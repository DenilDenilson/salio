import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FixtureStatus,
  MarketType,
  SelectionStatus,
} from "../../src/domain/model";
import { importStakeHtml } from "../../src/server/importers/stake/importer";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";
import {
  buildOddsCapturedSnapshot,
  buildResultSnapshot,
  evaluateSnapshot,
  snapshotToStateResponse,
} from "../../src/server/snapshots/logic";

const stakeUrl =
  "https://stake.pe/deportes/futbol/world-cup/event-canada-bosnia-demo";
const capturedAt = "2026-06-12T18:57:00.000Z";
const finalizedAt = new Date("2026-06-13T06:45:00.000Z");

function importedCanadaBosnia() {
  return importStakeHtml({
    html: readFileSync(
      join(
        process.cwd(),
        "tests/fixtures/stake/event-canada-bosnia-finished.html",
      ),
      "utf8",
    ),
    url: stakeUrl,
    capturedAt: new Date(capturedAt),
    matchId: "canada-vs-bosnia",
  });
}

function buildOddsSnapshot() {
  const imported = importedCanadaBosnia();
  return buildOddsCapturedSnapshot({
    slug: "canada-vs-bosnia",
    title: "Canadá vs Bosnia y Herzegovina",
    homeTeamName: imported.homeTeamName,
    awayTeamName: imported.awayTeamName,
    competitionName: imported.competitionName,
    timezone: "America/Lima",
    kickoffAt: imported.kickoffAt ?? "2026-06-12T19:00:00.000Z",
    stakeUrl,
    stakeEventId: imported.stakeEventId,
    capturedAt: imported.capturedAt,
    markets: imported.markets,
  });
}

async function buildDemoResult() {
  const provider = new DemoSportsProvider();
  const [fixture, events, teamStats, playerStats] = await Promise.all([
    provider.getFixture(990001),
    provider.getEvents(990001),
    provider.getTeamStatistics(990001),
    provider.getPlayerStatistics(990001),
  ]);

  return buildResultSnapshot({ fixture, events, teamStats, playerStats });
}

function findSelection(
  snapshot: ReturnType<typeof buildOddsSnapshot>,
  marketType: MarketType,
  rawSelectionName: string,
) {
  return snapshot.odds.markets
    .find((market) => market.marketType === marketType)
    ?.selections.find(
      (selection) => selection.rawSelectionName === rawSelectionName,
    );
}

describe("snapshot logic", () => {
  it("builds an odds-captured snapshot with normalized markets", () => {
    const snapshot = buildOddsSnapshot();

    expect(snapshot.phase).toBe("odds_captured");
    expect(snapshot.result).toBeNull();
    expect(snapshot.odds).toMatchObject({
      source: "stake",
      frozen: true,
      capturedAt,
    });
    expect(snapshot.stake.eventId).toBe("canada-bosnia-demo");
    expect(snapshot.odds.markets.map((market) => market.marketType)).toEqual(
      expect.arrayContaining([
        MarketType.MATCH_RESULT,
        MarketType.TOTAL_GOALS,
        MarketType.DRAW_NO_BET,
      ]),
    );
    expect(
      snapshot.odds.markets.flatMap((market) =>
        market.selections.map((selection) => selection.status),
      ),
    ).toEqual(expect.arrayContaining([SelectionStatus.PENDING]));
  });

  it("builds a result snapshot from provider data", async () => {
    const result = await buildDemoResult();

    expect(result).toMatchObject({
      status: FixtureStatus.FINISHED,
      elapsedMinutes: 90,
      score: {
        home: 1,
        away: 1,
        halftimeHome: 0,
        halftimeAway: 1,
      },
      firstScoringTeam: "AWAY",
      yellowCards: { home: 2, away: 1 },
      corners: { home: 8, away: 3 },
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        type: "GOAL",
        teamSide: "AWAY",
        minute: 21,
        playerName: "Jovo Lukic",
      }),
      expect.objectContaining({
        type: "GOAL",
        teamSide: "HOME",
        minute: 79,
        playerName: "Cyle Larin",
      }),
    ]);
    expect(result.playerStats).toMatchObject({
      "player_cyle-larin": {
        goals: 1,
        shotsOnTarget: 1,
        appeared: true,
      },
    });
  });

  it("sorts scoring events, ignores cancelled goals and keeps non-goal events", () => {
    const result = buildResultSnapshot({
      fixture: {
        fixtureId: 1,
        status: FixtureStatus.FINISHED,
        elapsedMinutes: 90,
        score: { home: 1, away: 1 },
        kickoffAt: "2026-06-12T19:00:00.000Z",
        lastUpdatedAt: "2026-06-12T21:00:00.000Z",
      },
      events: [
        {
          providerEventId: "cancelled-home",
          eventType: "GOAL",
          teamSide: "HOME",
          playerName: "Cancelled",
          minute: 5,
          isCancelled: true,
        },
        {
          providerEventId: "away-goal",
          eventType: "GOAL",
          teamSide: "AWAY",
          playerName: "Away",
          minute: 10,
          extraMinute: 2,
          isCancelled: false,
        },
        {
          providerEventId: "home-goal",
          eventType: "GOAL",
          teamSide: "HOME",
          playerName: "Home",
          minute: 10,
          extraMinute: 1,
          isCancelled: false,
        },
        {
          providerEventId: "yellow",
          eventType: "YELLOW_CARD",
          teamSide: "AWAY",
          playerName: "Booked",
          minute: 88,
          isCancelled: false,
        },
      ],
      teamStats: {
        yellowCards: { home: 0, away: 1 },
        corners: { home: 2, away: 4 },
        shotsOnTarget: { home: 3, away: 3 },
      },
      playerStats: [],
    });

    expect(result.firstScoringTeam).toBe("HOME");
    expect(result.events).toEqual([
      expect.objectContaining({ providerEventId: "away-goal" }),
      expect.objectContaining({ providerEventId: "home-goal" }),
      expect.objectContaining({ providerEventId: "yellow" }),
    ]);
  });

  it("finalizes a snapshot and resolves P0 selections with the demo result", async () => {
    const finalized = evaluateSnapshot({
      snapshot: buildOddsSnapshot(),
      result: await buildDemoResult(),
      evaluatedAt: finalizedAt,
      fixtureId: 990001,
    });

    expect(finalized.phase).toBe("finalized");
    expect(finalized.metadata.finalizedAt).toBe(finalizedAt.toISOString());
    expect(finalized.apiFootball.fixtureId).toBe(990001);
    expect(
      finalized.odds.markets.flatMap((market) =>
        market.selections.filter(
          (selection) => selection.status === SelectionStatus.PENDING,
        ),
      ),
    ).toHaveLength(0);
    expect(
      findSelection(finalized, MarketType.MATCH_RESULT, "Empate")?.status,
    ).toBe(SelectionStatus.WON);
    expect(
      findSelection(finalized, MarketType.TOTAL_GOALS, "Más de 2.5")?.status,
    ).toBe(SelectionStatus.LOST);
    expect(
      findSelection(finalized, MarketType.DRAW_NO_BET, "Canadá")?.status,
    ).toBe(SelectionStatus.VOID);
  });

  it("converts snapshots to a LiveMatchBoard state response without stale polling pressure", async () => {
    const finalized = evaluateSnapshot({
      snapshot: buildOddsSnapshot(),
      result: await buildDemoResult(),
      evaluatedAt: finalizedAt,
      fixtureId: 990001,
    });

    const state = snapshotToStateResponse(finalized);

    expect(state.match).toMatchObject({
      id: "canada-vs-bosnia",
      slug: "canada-vs-bosnia",
      status: FixtureStatus.FINISHED,
      score: { home: 1, away: 1 },
    });
    expect(state.odds).toMatchObject({
      frozen: true,
      frozenAt: capturedAt,
    });
    expect(state.stale).toBe(false);
    expect(state.nextSuggestedPollMs).toBeGreaterThanOrEqual(60_000);
    expect(state.errors).toEqual([]);
  });

  it("converts odds-captured snapshots to pending public state", () => {
    const state = snapshotToStateResponse(buildOddsSnapshot());

    expect(state.match).toMatchObject({
      status: FixtureStatus.NOT_STARTED,
      elapsedMinutes: null,
      score: { home: 0, away: 0 },
    });
    expect(state.odds.notice).toContain("pendiente de resultado oficial");
    expect(state.lastUpdatedAt).toBe(capturedAt);
    expect(state.stale).toBe(false);
  });
});
