import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EspnSportsProvider } from "../../src/server/providers/espn/provider";

const summaryUrl =
  "https://site.api.espn.test/apis/site/v2/sports/soccer/fifa.world/summary";

afterEach(() => {
  vi.restoreAllMocks();
});

async function summaryPayload(): Promise<unknown> {
  return JSON.parse(
    await readFile("tests/fixtures/espn/summary-760419.json", "utf8"),
  ) as unknown;
}

function provider(input: {
  fetchFn: typeof fetch;
  evidenceDirectory?: string | null;
  maxRetries?: number;
}) {
  return new EspnSportsProvider({
    baseUrl: summaryUrl,
    fetchFn: input.fetchFn,
    evidenceDirectory: input.evidenceDirectory ?? null,
    maxRetries: input.maxRetries ?? 0,
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("ESPN provider failure and evidence paths", () => {
  it.each([
    [401, "SPORTS_PROVIDER_UNAUTHORIZED"],
    [403, "SPORTS_PROVIDER_UNAUTHORIZED"],
    [404, "SPORTS_FIXTURE_NOT_FOUND"],
    [429, "SPORTS_PROVIDER_RATE_LIMITED"],
    [500, "SPORTS_PROVIDER_TIMEOUT"],
  ])("maps HTTP %s to the provider error contract", async (status, code) => {
    const fetchFn = vi.fn(async () => new Response("{}", { status }));

    await expect(
      provider({ fetchFn }).getFixture("760419"),
    ).rejects.toMatchObject({
      code,
    });
  });

  it("retries transient fetch errors and reuses the successful summary promise", async () => {
    const payload = await summaryPayload();
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("temporary network failure"))
      .mockResolvedValueOnce(jsonResponse(payload));
    const adapter = provider({
      fetchFn: fetchFn as unknown as typeof fetch,
      maxRetries: 1,
    });

    await expect(adapter.getFixture("760419")).resolves.toMatchObject({
      eventId: "760419",
    });
    await expect(adapter.getEvents("760419")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ eventType: "GOAL" })]),
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed JSON and schema-invalid ESPN payloads", async () => {
    await expect(
      provider({
        fetchFn: vi.fn(async () => new Response("{bad json")),
      }).getFixture("760419"),
    ).rejects.toMatchObject({ code: "SPORTS_PROVIDER_INVALID_RESPONSE" });

    await expect(
      provider({
        fetchFn: vi.fn(async () => jsonResponse({ header: { id: "760419" } })),
      }).getFixture("760419"),
    ).rejects.toMatchObject({ code: "SPORTS_PROVIDER_INVALID_RESPONSE" });
  });

  it("writes raw evidence and versions repeated artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "salio-espn-evidence-"));
    const payload = await summaryPayload();
    try {
      const first = await provider({
        fetchFn: vi.fn(async () => jsonResponse(payload)),
        evidenceDirectory: directory,
      }).getFixture("760419");
      const second = await provider({
        fetchFn: vi.fn(async () => jsonResponse(payload)),
        evidenceDirectory: directory,
      }).getFixture("760419");

      expect(first.evidence?.rawArtifactPath).toBe(
        join(directory, "espn/760419.json"),
      );
      expect(second.evidence?.rawArtifactPath).toBe(
        join(directory, "espn/760419.v2.json"),
      );
      await expect(
        readFile(join(directory, "espn/760419.json"), "utf8"),
      ).resolves.toContain('"header"');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
