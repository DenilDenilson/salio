import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { describe, expect, it, afterAll } from "vitest";
import { MarketType, SelectionStatus } from "../../src/domain/model";
import { importStakeHtml } from "../../src/server/importers/stake/importer";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";
import {
  snapshotPathForSlug,
  writeSnapshot,
} from "../../src/server/snapshots/io";
import {
  buildOddsCapturedSnapshot,
  buildResultSnapshot,
  evaluateSnapshot,
} from "../../src/server/snapshots/logic";
import {
  assertFixtureIsFinalizable,
  assertRemoteFixtureMatchesSnapshot,
} from "../../src/server/snapshots/fixtureValidation";
import {
  optionalStringArg,
  parseMatchTitleTeams,
} from "../../src/server/snapshots/cli";
import { MatchSnapshotSchema } from "../../src/server/snapshots/schema";

const slug = `test-snapshot-${Date.now().toString(36)}`;
const snapshotPath = snapshotPathForSlug(slug);
const titleOnlySlug = `test-title-only-${Date.now().toString(36)}`;
const titleOnlySnapshotPath = snapshotPathForSlug(titleOnlySlug);
const demoEventId = "demo-canada-bosnia";
const demoSportsData = {
  provider: "demo" as const,
  eventId: demoEventId,
  leagueSlug: "fifa.world",
  sourceUrl: "demo://canada-vs-bosnia",
};

async function readTempSnapshot() {
  return MatchSnapshotSchema.parse(
    JSON.parse(await readFile(snapshotPath, "utf8")) as unknown,
  );
}

async function captureStakeFixture(input: {
  slug: string;
  stakeUrl: string;
  title: string;
  home?: string;
  away?: string;
  kickoff: string;
  competition: string;
  capturedAt: string;
  fixtureHtml?: string;
}) {
  const titleTeams = parseMatchTitleTeams(input.title);
  const html = await readFile(
    input.fixtureHtml ??
      "tests/fixtures/stake/event-canada-bosnia-finished.html",
    "utf8",
  );
  const imported = importStakeHtml({
    html,
    url: input.stakeUrl,
    capturedAt: new Date(input.capturedAt),
    matchId: input.slug,
    fallbackHomeTeamName: input.home ?? titleTeams?.home,
    fallbackAwayTeamName: input.away ?? titleTeams?.away,
    fallbackCompetitionName: input.competition,
    fallbackKickoffAt: input.kickoff,
  });
  const snapshot = buildOddsCapturedSnapshot({
    slug: input.slug,
    title: input.title,
    homeTeamName: input.home ?? titleTeams?.home ?? imported.homeTeamName,
    awayTeamName: input.away ?? titleTeams?.away ?? imported.awayTeamName,
    competitionName: input.competition,
    timezone: "America/Lima",
    kickoffAt: new Date(input.kickoff).toISOString(),
    stakeUrl: input.stakeUrl,
    stakeEventId: imported.stakeEventId,
    capturedAt: imported.capturedAt,
    markets: imported.markets,
  });
  await writeSnapshot(snapshot);
  return snapshot;
}

afterAll(async () => {
  for (const path of [snapshotPath, titleOnlySnapshotPath]) {
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
});

describe.sequential("snapshot command flows", () => {
  it("captures pre-match odds from the Stake fixture in demo mode", async () => {
    const snapshot = await captureStakeFixture({
      slug,
      stakeUrl:
        "https://stake.pe/deportes/futbol/world-cup/event-canada-bosnia-demo",
      title: "Canadá vs Bosnia y Herzegovina",
      home: "Canadá",
      away: "Bosnia y Herzegovina",
      kickoff: "2026-06-12T19:00:00.000Z",
      competition: "Copa Mundial 2026 · Grupo B",
      capturedAt: "2026-06-12T18:57:00.000Z",
    });

    expect(snapshot.phase).toBe("odds_captured");
    expect(snapshot.odds.markets.length).toBeGreaterThan(0);
    expect(existsSync(snapshotPath)).toBe(true);
    expect(snapshot).toMatchObject({
      slug,
      phase: "odds_captured",
      result: null,
      stake: { eventId: "canada-bosnia-demo" },
    });
    expect(
      snapshot.odds.markets.find(
        (market) => market.marketType === MarketType.TOTAL_GOALS,
      )?.selections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawSelectionName: "Más de 2.5",
          status: SelectionStatus.PENDING,
        }),
      ]),
    );
  });

  it("uses the match title as team fallback when Stake omits visible teams", async () => {
    const snapshot = await captureStakeFixture({
      slug: titleOnlySlug,
      stakeUrl:
        "https://stake.pe/deportes/football/world/fifa-world-cup/brasil-vs-marruecos/event/21798325",
      title: "Brasil vs Marruecos",
      kickoff: "2026-06-13T22:00:00.000Z",
      competition: "Mundial 2026",
      fixtureHtml: "tests/fixtures/stake/event-without-visible-teams.html",
      capturedAt: "2026-06-13T21:55:00.000Z",
    });

    expect(snapshot.phase).toBe("odds_captured");
    expect(snapshot.odds.markets.length).toBe(1);
    expect(snapshot).toMatchObject({
      slug: titleOnlySlug,
      title: "Brasil vs Marruecos",
      homeTeamName: "Brasil",
      awayTeamName: "Marruecos",
      competitionName: "Mundial 2026",
      stake: { eventId: "21798325" },
    });
  });

  it("loads the explicit demo event for a captured snapshot", async () => {
    const snapshot = await readTempSnapshot();
    const provider = new DemoSportsProvider();
    const fixture = await provider.getFixture(demoEventId);

    expect(fixture).toMatchObject({
      eventId: demoEventId,
      homeTeamName: snapshot.homeTeamName,
      awayTeamName: snapshot.awayTeamName,
    });
  });

  it("parses optional ESPN event ids before any write", async () => {
    const before = await readFile(snapshotPath, "utf8");

    expect(optionalStringArg({ "event-id": "760419" }, "event-id")).toBe(
      "760419",
    );
    expect(optionalStringArg({ "event-id": "" }, "event-id")).toBeNull();

    await expect(readFile(snapshotPath, "utf8")).resolves.toBe(before);
  });

  it("finalizes and evaluates the temp snapshot in demo mode", async () => {
    const provider = new DemoSportsProvider();
    const initial = await readTempSnapshot();
    const fixture = await provider.getFixture(demoEventId);
    assertRemoteFixtureMatchesSnapshot(initial, fixture, demoEventId);
    assertFixtureIsFinalizable(fixture);
    const [events, teamStats, playerStats] = await Promise.all([
      provider.getEvents(demoEventId),
      provider.getTeamStatistics(demoEventId),
      provider.getPlayerStatistics(demoEventId),
    ]);
    const result = buildResultSnapshot({
      fixture,
      events,
      teamStats,
      playerStats,
    });
    const finalized = evaluateSnapshot({
      snapshot: initial,
      result,
      evaluatedAt: new Date("2026-06-13T06:45:00.000Z"),
      sportsData: demoSportsData,
    });
    await writeSnapshot(finalized);
    const snapshot = await readTempSnapshot();

    expect(snapshot.phase).toBe("finalized");
    expect(snapshot.result?.score).toMatchObject({ home: 1, away: 1 });
    expect(snapshot.result?.firstScoringTeam).toBe("AWAY");
    expect(
      snapshot.odds.markets.flatMap((market) =>
        market.selections.filter(
          (selection) => selection.status === SelectionStatus.PENDING,
        ),
      ),
    ).toHaveLength(0);
  });
});
