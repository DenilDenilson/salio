import { readFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  MarketType,
  SelectionOperator,
  type MarketState,
} from "../../src/domain/model";
import {
  classifyStakeOddCode,
  normalizeStakeMarkets,
} from "../../src/domain/markets/normalization";
import { buildOddsCapturedSnapshot } from "../../src/server/snapshots/logic";
import { AppError } from "../../src/server/errors";
import {
  curlStakeApi,
  StakeApiClient,
  STAKE_API_REQUEST_HEADERS,
} from "../../src/server/importers/stake/apiClient";
import {
  importStakeHtml,
  StakeImporter,
  type ImportedEvent,
} from "../../src/server/importers/stake/importer";
import {
  assertStakeApiPayloadConsistency,
  parseStakeApiPayload,
  realStakeApiOddsCount,
  stakeApiPayloadToImportedEvent,
  stakeApiPayloadToRawMarkets,
} from "../../src/server/importers/stake/apiNormalizer";
import { StakeApiPayloadSchema } from "../../src/server/importers/stake/apiSchema";
import {
  isAllowedStakeApiHost,
  redactStakeApiUrl,
  requireStakeEventId,
  stakeApiEventIdFromUrl,
  stakeEventIdFromUrl,
  validateStakeApiUrl,
} from "../../src/server/importers/stake/endpoint";
import { assertOddsCaptureCanWriteSnapshot } from "../../src/server/snapshots/captureSafety";
import { type MatchSnapshot } from "../../src/server/snapshots/schema";

type StakeApiFixture = {
  info: { id: number; count?: number };
  odds: Record<
    string,
    { event_id: number; odd_code: string; union_id: number }
  >;
};

const rawApiEvidencePath = join(
  process.cwd(),
  ".tmp",
  `stake-api-client-test-${Date.now().toString(36)}.json`,
);

function readFixture(eventId: number): StakeApiFixture {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "tests/fixtures/stake-api",
        `event-${eventId}-single-pre-event.json`,
      ),
      "utf8",
    ),
  ) as StakeApiFixture;
}

function readFixtureText(eventId: number): string {
  return readFileSync(
    join(
      process.cwd(),
      "tests/fixtures/stake-api",
      `event-${eventId}-single-pre-event.json`,
    ),
    "utf8",
  );
}

function stakePublicUrl(eventId: number): string {
  return `https://stake.pe/deportes/football/world/fifa-world-cup/test/event/${eventId}`;
}

function stakeApiUrl(eventId: number): string {
  return `https://pre-143o-sp.websbkt.com/cache/143/es/pe/${eventId}/single-pre-event.json?hidenseek=test-token`;
}

function importedFromFixture(eventId: number): ImportedEvent {
  const rawText = readFixtureText(eventId);
  return stakeApiPayloadToImportedEvent({
    payload: JSON.parse(rawText) as unknown,
    rawText,
    apiUrl: stakeApiUrl(eventId),
    fetchedAt: "2026-06-13T18:00:00.000Z",
    expectedEventId: String(eventId),
    sourceUrl: stakePublicUrl(eventId),
    capturedAt: new Date("2026-06-13T18:00:00.000Z"),
    matchId: `fixture-${eventId}`,
  });
}

function mockCurlSpawn(output: string, exitCode = 0) {
  return vi.fn((_command: string, _args: string[], _options: object) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    queueMicrotask(() => {
      child.stdout.end(output);
      child.stderr.end();
      child.emit("close", exitCode, null);
    });
    return child;
  });
}

function marketsSignature(markets: MarketState[]) {
  return markets.map((market) => ({
    marketType: market.marketType,
    supported: market.supported,
    selections: market.selections.map((selection) => ({
      status: selection.status,
      rawSelectionName: selection.rawSelectionName,
    })),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await unlink(rawApiEvidencePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
});

describe("Stake API-first parser contract", () => {
  it("extracts event ids and validates allowed Stake API hosts safely", () => {
    expect(stakeEventIdFromUrl(stakePublicUrl(21798330))).toBe("21798330");
    expect(stakeEventIdFromUrl("not-a-url")).toBeNull();
    expect(() =>
      requireStakeEventId("https://stake.pe/deportes/football"),
    ).toThrow(AppError);
    expect(
      stakeApiEventIdFromUrl(
        "https://pre-143o-sp.websbkt.com/single-pre-event.json",
      ),
    ).toBeNull();
    expect(
      isAllowedStakeApiHost("pre-143o-sp.websbkt.com", [".websbkt.com"]),
    ).toBe(true);
    expect(
      isAllowedStakeApiHost("pre-143o-sp.websbkt.com", [
        "pre-143o-sp.websbkt.com",
      ]),
    ).toBe(true);
    expect(isAllowedStakeApiHost("pre-143o-sp.websbkt.com", [""])).toBe(false);
    expect(
      isAllowedStakeApiHost("websbkt.com.attacker.example", [".websbkt.com"]),
    ).toBe(false);
    expect(() =>
      validateStakeApiUrl(stakeApiUrl(21798330), {
        expectedEventId: "21798331",
        allowedHosts: [".websbkt.com"],
      }),
    ).toThrow(AppError);
    expect(() =>
      validateStakeApiUrl(
        "https://websbkt.com.attacker.example/cache/143/es/pe/21798330/single-pre-event.json?hidenseek=secret",
        {
          expectedEventId: "21798330",
          allowedHosts: [".websbkt.com"],
        },
      ),
    ).toThrow(AppError);
    expect(() =>
      validateStakeApiUrl(
        "http://pre-143o-sp.websbkt.com/cache/143/es/pe/21798330/single-pre-event.json?hidenseek=secret",
        {
          expectedEventId: "21798330",
          allowedHosts: [".websbkt.com"],
        },
      ),
    ).toThrow(AppError);
    expect(() =>
      validateStakeApiUrl(
        "https://pre-143o-sp.websbkt.com/cache/143/es/pe/21798330/not-the-event.json?hidenseek=secret",
        {
          expectedEventId: "21798330",
          allowedHosts: [".websbkt.com"],
        },
      ),
    ).toThrow(AppError);
  });

  it("keeps representative local API fixtures for the target event ids", () => {
    for (const eventId of [21798330, 21798331, 21798332]) {
      const payload = readFixture(eventId);
      expect(StakeApiPayloadSchema.parse(payload).info.id).toBe(eventId);
      expect(Object.keys(payload.odds).length).toBeGreaterThan(0);
      expect(realStakeApiOddsCount(parseStakeApiPayload(payload))).toBe(
        Object.keys(payload.odds).length,
      );
      expect(Object.values(payload.odds)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event_id: eventId }),
        ]),
      );
    }
  });

  it("classifies markets from odd_code instead of translated labels", () => {
    expect(classifyStakeOddCode("ODD_S1")).toBe(MarketType.MATCH_RESULT);
    expect(classifyStakeOddCode("ODD_DX2")).toBe(MarketType.DOUBLE_CHANCE);
    expect(classifyStakeOddCode("ODD_DRAWNOBET_2")).toBe(
      MarketType.DRAW_NO_BET,
    );
    expect(classifyStakeOddCode("ODD_TTL_OVR")).toBe(MarketType.TOTAL_GOALS);
    expect(classifyStakeOddCode("ODD_INDTTL1_UND")).toBe(
      MarketType.TEAM_TOTAL_GOALS,
    );
    expect(classifyStakeOddCode("ODD_HT1_TTL_OVR")).toBe(
      MarketType.FIRST_HALF_TOTAL_GOALS,
    );
    expect(classifyStakeOddCode("ODD_FTB_BOTHTEAMSSCORE_YES")).toBe(
      MarketType.BOTH_TEAMS_TO_SCORE,
    );
    expect(classifyStakeOddCode("ODD_SCORES_1_0")).toBe(MarketType.EXACT_SCORE);
    expect(classifyStakeOddCode("ODD_HND_1")).toBe(MarketType.HANDICAP);
    expect(classifyStakeOddCode("ODD_YEL_TTL_OVR")).toBe(
      MarketType.TOTAL_YELLOW_CARDS,
    );
    expect(classifyStakeOddCode("ODD_CRN_TTL_UND")).toBe(
      MarketType.TOTAL_CORNERS,
    );
    expect(classifyStakeOddCode("ODD_PLR_SHOTSONTARGET_OVR")).toBe(
      MarketType.PLAYER_SHOTS_ON_TARGET,
    );
    expect(classifyStakeOddCode("ODD_SPLR_SCORES_PLAYER")).toBe(
      MarketType.ANYTIME_GOALSCORER,
    );
    expect(classifyStakeOddCode("ODD_FTB_2HALVES_X2")).toBe(
      MarketType.UNSUPPORTED,
    );
    expect(classifyStakeOddCode("ODD_UNKNOWN_PROMO_BOOST")).toBe(
      MarketType.UNSUPPORTED,
    );
  });

  it("groups flat API odds by union_id and preserves raw Stake metadata", () => {
    const payload = parseStakeApiPayload(readFixture(21798330));
    assertStakeApiPayloadConsistency(payload, "21798330");
    const markets = stakeApiPayloadToRawMarkets(payload);

    expect(payload).toMatchObject({
      info: {
        id: 21798330,
        teams: { home: "España", away: "Cabo Verde" },
        tournament_name: "FIFA World Cup",
        date_start: "2026-06-13T19:00:00Z",
      },
    });

    const result = markets.find(
      (market) => market.sourceMarketId === "21798330:7001",
    );
    const totals = markets.find(
      (market) => market.sourceMarketId === "21798330:7010",
    );

    expect(result?.rawMarketName).toBe("Resultado del Partido");
    expect(result?.selections).toHaveLength(3);
    expect(totals?.marketType).toBe(MarketType.TOTAL_GOALS);
    expect(totals?.rawMarketName).toBe("Total de goles");
    expect(
      totals?.selections.map((selection) => selection.additionalValue),
    ).toEqual(["2.5", "2.5"]);
    expect(totals?.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSelectionId: "21798330:ttl:over:2.5",
          oddCode: "ODD_TTL_OVR",
          rawSelectionName: "Más de 2.5",
          oddDecimal: 1.63,
          additionalValue: "2.5",
          metadata: expect.objectContaining({
            odd_code: "ODD_TTL_OVR",
            union_id: 7010,
            group_id: 20,
            filter_id: 101,
            variation_id: 12,
            additional_value_raw: "2.5",
          }),
        }),
      ]),
    );
  });

  it("redacts hidenseek values in API URLs", () => {
    const redacted = redactStakeApiUrl(
      "https://pre-143o-sp.websbkt.com/cache/143/es/pe/21798330/single-pre-event.json?hidenseek=secret-token-123&locale=es",
    );

    expect(new URL(redacted).searchParams.get("hidenseek")).toBe("[REDACTED]");
    expect(redacted).toContain("single-pre-event.json");
    expect(redacted).not.toContain("secret-token-123");
    expect(redactStakeApiUrl("not-url hidenseek=secret-token")).toBe(
      "not-url hidenseek=[REDACTED]",
    );
  });

  it("fetches JSON with default headers, retries transient errors and saves raw evidence", async () => {
    const rawText = readFixtureText(21798330);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("temporary", {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(rawText, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 1,
      fetchFn,
      saveRawApiPath: rawApiEvidencePath,
    });

    const result = await client.fetchEvent({
      apiUrl: stakeApiUrl(21798330),
      expectedEventId: "21798330",
    });
    const requestInit = fetchFn.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = requestInit?.headers as Record<string, string> | undefined;

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(headers).toMatchObject(STAKE_API_REQUEST_HEADERS);
    expect(result).toMatchObject({
      apiUrlSanitized: expect.not.stringContaining("test-token"),
      rawArtifactPath: rawApiEvidencePath,
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await expect(readFile(rawApiEvidencePath, "utf8")).resolves.toBe(rawText);
  });

  it("passes the exact provided API URL and curl-compatible headers to fetch", async () => {
    const exactUrl =
      "https://pre-143o-sp.websbkt.com/cache/143/es/pe/21798330/single-pre-event.json?hidenseek=test-token%2Fwith%2Bencoded&x=1";
    const rawText = readFixtureText(21798330);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(rawText, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 0,
      fetchFn,
    });

    await client.fetchEvent({
      apiUrl: exactUrl,
      expectedEventId: "21798330",
    });

    const requestInit = fetchFn.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(fetchFn.mock.calls[0]?.[0]).toBe(exactUrl);
    expect(requestInit?.headers).toEqual(STAKE_API_REQUEST_HEADERS);
  });

  it("uses curl as the default transport with separated args and the exact URL", async () => {
    const exactUrl =
      "https://pre-143o-sp.websbkt.com/cache/143/es/pe/21798330/single-pre-event.json?hidenseek=test-token%2Fwith%2Bencoded&x=1";
    const rawText = JSON.stringify({ ok: true });
    const spawnFn = mockCurlSpawn(
      `${rawText}\n__STAKE_HTTP_STATUS__:200\n__STAKE_CONTENT_TYPE__:application/json`,
    );
    const client = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 0,
      spawnFn: spawnFn as never,
    });

    const result = await client.fetchEvent({
      apiUrl: exactUrl,
      expectedEventId: "21798330",
    });

    const [command, args, options] = spawnFn.mock.calls[0] as [
      string,
      string[],
      { shell: boolean },
    ];
    expect(result.rawText).toBe(rawText);
    expect(command).toBe("curl");
    expect(options.shell).toBe(false);
    expect(args.at(-1)).toBe(exactUrl);
    expect(args).toContain("--write-out");
    expect(args).toContain("Referer: https://stake.pe/");
    expect(args).toContain(
      `User-Agent: ${STAKE_API_REQUEST_HEADERS["User-Agent"]}`,
    );
    expect(args).toContain(
      `sec-ch-ua: ${STAKE_API_REQUEST_HEADERS["sec-ch-ua"]}`,
    );
    expect(args).toContain("sec-ch-ua-mobile: ?0");
    expect(args).toContain('sec-ch-ua-platform: "Linux"');
    expect(args.some((arg) => arg.startsWith("Accept:"))).toBe(false);
    expect(args.some((arg) => arg.startsWith("Cookie:"))).toBe(false);
  });

  it("exposes curl transport diagnostics without throwing on HTTP statuses", async () => {
    const exactUrl = stakeApiUrl(21798330);
    const rawText = "not acceptable";
    const spawnFn = mockCurlSpawn(
      `${rawText}\n__STAKE_HTTP_STATUS__:406\n__STAKE_CONTENT_TYPE__:text/plain`,
    );

    const result = await curlStakeApi({
      apiUrl: exactUrl,
      timeoutMs: 100,
      maxResponseBytes: 1000,
      spawnFn: spawnFn as never,
    });

    expect(result).toEqual({
      rawText,
      status: 406,
      contentType: "text/plain",
      responseBytes: rawText.length,
    });
  });

  it("handles HTTP errors without leaking hidenseek tokens", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Forbidden", {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 0,
      fetchFn,
    });

    await expect(
      client.fetchEvent({
        apiUrl: stakeApiUrl(21798330),
        expectedEventId: "21798330",
      }),
    ).rejects.toMatchObject({
      code: "STAKE_API_HTTP_ERROR",
      status: 403,
      message: expect.not.stringContaining("test-token"),
    });
  });

  it("maps specific HTTP status codes without leaking hidenseek tokens", async () => {
    for (const [status, expectedMessage] of [
      [401, "credentials"],
      [406, "HTTP 406"],
      [429, "rate limited"],
      [418, "HTTP 418"],
    ] as const) {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("error", {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new StakeApiClient({
        allowedHosts: [".websbkt.com"],
        timeoutMs: 100,
        retries: 0,
        fetchFn,
      });

      await expect(
        client.fetchEvent({
          apiUrl: stakeApiUrl(21798330),
          expectedEventId: "21798330",
        }),
      ).rejects.toMatchObject({
        code: "STAKE_API_HTTP_ERROR",
        status,
        message: expect.stringContaining(expectedMessage),
      });
    }
  });

  it("does not retry permanent HTTP errors and maps fetch failures to timeout errors", async () => {
    const notFoundFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Not found", {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    const abortFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    const networkFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network down"));
    const notFoundClient = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 1,
      fetchFn: notFoundFetch,
    });
    const abortClient = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 0,
      fetchFn: abortFetch,
    });
    const networkClient = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 0,
      fetchFn: networkFetch,
    });

    await expect(
      notFoundClient.fetchEvent({
        apiUrl: stakeApiUrl(21798330),
        expectedEventId: "21798330",
      }),
    ).rejects.toMatchObject({ code: "STAKE_API_HTTP_ERROR", status: 404 });
    expect(notFoundFetch).toHaveBeenCalledTimes(1);
    await expect(
      abortClient.fetchEvent({
        apiUrl: stakeApiUrl(21798330),
        expectedEventId: "21798330",
      }),
    ).rejects.toMatchObject({ code: "STAKE_API_TIMEOUT", status: 504 });
    await expect(
      networkClient.fetchEvent({
        apiUrl: stakeApiUrl(21798330),
        expectedEventId: "21798330",
      }),
    ).rejects.toMatchObject({ code: "STAKE_API_TIMEOUT", status: 503 });
  });

  it("rejects non-JSON and oversized API responses", async () => {
    const nonJsonClient = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 0,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    });
    const largeClient = new StakeApiClient({
      allowedHosts: [".websbkt.com"],
      timeoutMs: 100,
      retries: 0,
      maxResponseBytes: 4,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });

    await expect(
      nonJsonClient.fetchEvent({
        apiUrl: stakeApiUrl(21798330),
        expectedEventId: "21798330",
      }),
    ).rejects.toMatchObject({ code: "STAKE_API_INVALID_CONTENT_TYPE" });
    await expect(
      largeClient.fetchEvent({
        apiUrl: stakeApiUrl(21798330),
        expectedEventId: "21798330",
      }),
    ).rejects.toMatchObject({ code: "STAKE_API_RESPONSE_TOO_LARGE" });
  });

  it("rejects invalid payloads and payloads without odds", () => {
    const invalid = structuredClone(readFixture(21798330));
    delete (invalid as Partial<StakeApiFixture>).odds;

    expect(() => parseStakeApiPayload(invalid)).toThrow(AppError);

    const emptyOdds = parseStakeApiPayload({
      ...readFixture(21798330),
      odds: {},
    });
    expect(() =>
      assertStakeApiPayloadConsistency(emptyOdds, "21798330"),
    ).toThrow(AppError);
  });

  it("keeps frozen selections as locked without dropping the market", () => {
    const payload = parseStakeApiPayload(readFixture(21798331));
    const markets = stakeApiPayloadToRawMarkets(payload);
    const btts = markets.find(
      (market) => market.sourceMarketId === "21798331:7120",
    );

    expect(btts?.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSelectionId: "21798331:btts:yes",
          rawSelectionName: "Sí",
          locked: true,
        }),
        expect.objectContaining({
          sourceSelectionId: "21798331:btts:no",
          rawSelectionName: "No",
          locked: false,
        }),
      ]),
    );
  });

  it("uses structured player names before noisy team_name text", () => {
    const payload = parseStakeApiPayload(readFixture(21798330));
    const markets = stakeApiPayloadToRawMarkets(payload);
    const playerMarket = markets.find(
      (market) => market.sourceMarketId === "21798330:7050",
    );

    expect(playerMarket?.rawMarketName).toBe("Tiros a puerta por jugador");
    expect(playerMarket?.selections[0]).toEqual(
      expect.objectContaining({
        rawSelectionName: "Lamine Yamal",
        additionalValue: "1.5",
        metadata: expect.objectContaining({
          team_players_id: 991,
          player_tag: "LAMINE_YAMAL",
        }),
      }),
    );

    const normalized = normalizeStakeMarkets({
      matchId: "espana-vs-cabo-verde",
      homeTeamName: payload.info.teams.home,
      awayTeamName: payload.info.teams.away,
      markets,
    });
    const shotSelection = normalized
      .find((market) => market.marketType === MarketType.PLAYER_SHOTS_ON_TARGET)
      ?.selections.find(
        (selection) => selection.operator === SelectionOperator.OVER,
      );

    expect(shotSelection).toMatchObject({
      participantName: "Lamine Yamal",
      participantId: "player_lamine-yamal",
      line: 1.5,
    });
  });

  it("produces markets compatible with odds-captured snapshots", () => {
    const payload = parseStakeApiPayload(readFixture(21798332));
    const rawMarkets = stakeApiPayloadToRawMarkets(payload);
    const markets = normalizeStakeMarkets({
      matchId: "brasil-vs-marruecos",
      homeTeamName: payload.info.teams.home,
      awayTeamName: payload.info.teams.away,
      markets: rawMarkets,
    });
    const snapshot = buildOddsCapturedSnapshot({
      slug: "brasil-vs-marruecos",
      title: "Brasil vs Marruecos",
      homeTeamName: payload.info.teams.home,
      awayTeamName: payload.info.teams.away,
      competitionName: payload.info.tournament_name,
      timezone: "America/Lima",
      kickoffAt: new Date(payload.info.date_start).toISOString(),
      stakeUrl:
        "https://stake.pe/deportes/football/world/fifa-world-cup/brasil-vs-marruecos/event/21798332",
      stakeEventId: String(payload.info.id),
      capturedAt: "2026-06-12T18:00:00.000Z",
      markets,
    });

    expect(snapshot).toMatchObject({
      schemaVersion: "2.0",
      phase: "odds_captured",
      stake: { eventId: "21798332" },
      odds: {
        source: "stake",
        frozen: true,
        markets: expect.arrayContaining([
          expect.objectContaining({
            marketType: MarketType.TOTAL_YELLOW_CARDS,
          }),
          expect.objectContaining({
            marketType: MarketType.UNSUPPORTED,
            supported: false,
          }),
        ]),
      },
      result: null,
    });
  });

  it("keeps the same importer contract for API and browser fixtures", () => {
    const apiImported = importedFromFixture(21798330);
    const browserImported = importStakeHtml({
      html: readFileSync(
        join(
          process.cwd(),
          "tests/fixtures/stake/event-21798323-main-markets.html",
        ),
        "utf8",
      ),
      url: "https://stake.pe/deportes/football/world/fifa-world-cup/usa-vs-paraguay/event/21798323",
      capturedAt: new Date("2026-06-13T18:00:00.000Z"),
      matchId: "usa-vs-paraguay",
    });

    for (const imported of [apiImported, browserImported]) {
      expect(imported).toMatchObject({
        source: "stake",
        sourceUrl: expect.stringContaining("https://stake.pe/"),
        stakeEventId: expect.any(String),
        homeTeamName: expect.any(String),
        awayTeamName: expect.any(String),
        capturedAt: expect.any(String),
      });
      expect(imported.markets.length).toBeGreaterThan(0);
    }
  });

  it("requires a complete API URL per import execution", async () => {
    const importer = new StakeImporter({
      allowedHosts: ["stake.pe"],
      timeoutMs: 100,
      stakeApiAllowedHosts: [".websbkt.com"],
    });

    await expect(
      importer.importEvent({
        url: stakePublicUrl(21798330),
        capturedAt: new Date("2026-06-13T18:00:00.000Z"),
        matchId: "espana-vs-cabo-verde",
      }),
    ).rejects.toMatchObject({ code: "STAKE_API_URL_NOT_RESOLVED" });
  });

  it("imports only through the explicit API URL", async () => {
    const rawText = readFixtureText(21798330);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(rawText, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const importer = new StakeImporter({
      allowedHosts: ["stake.pe"],
      timeoutMs: 100,
      stakeApiAllowedHosts: [".websbkt.com"],
      stakeApiFetchFn: fetchFn,
    });

    const imported = await importer.importEvent({
      url: stakePublicUrl(21798330),
      stakeApiUrl: stakeApiUrl(21798330),
      capturedAt: new Date("2026-06-13T18:00:00.000Z"),
      matchId: "espana-vs-cabo-verde",
    });

    expect(imported.stakeEventId).toBe("21798330");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite finalized snapshot odds during capture", () => {
    const apiImported = importedFromFixture(21798330);
    const initial = buildOddsCapturedSnapshot({
      slug: "espana-vs-cabo-verde",
      title: "España vs Cabo Verde",
      homeTeamName: apiImported.homeTeamName,
      awayTeamName: apiImported.awayTeamName,
      competitionName: apiImported.competitionName,
      timezone: "America/Lima",
      kickoffAt: apiImported.kickoffAt ?? "2026-06-13T19:00:00.000Z",
      stakeUrl: stakePublicUrl(21798330),
      stakeEventId: apiImported.stakeEventId,
      capturedAt: apiImported.capturedAt,
      markets: apiImported.markets,
    });
    const finalized = {
      ...initial,
      phase: "finalized",
      metadata: {
        ...initial.metadata,
        finalizedAt: "2026-06-13T21:00:00.000Z",
      },
    } as MatchSnapshot;
    const before = marketsSignature(finalized.odds.markets);

    expect(() =>
      assertOddsCaptureCanWriteSnapshot("espana-vs-cabo-verde", null),
    ).not.toThrow();
    expect(() =>
      assertOddsCaptureCanWriteSnapshot("espana-vs-cabo-verde", finalized),
    ).toThrow("finalized");
    expect(marketsSignature(finalized.odds.markets)).toEqual(before);
  });
});
