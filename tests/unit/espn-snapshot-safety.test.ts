import { describe, expect, it, vi } from "vitest";
import {
  FixtureStatus,
  MarketType,
  ParticipantType,
  SelectionOperator,
  SelectionStatus,
} from "../../src/domain/model";
import type { ProviderFixture } from "../../src/server/providers/types";
import {
  assertFixtureIsFinalizable,
  assertRemoteFixtureMatchesSnapshot,
} from "../../src/server/snapshots/fixtureValidation";
import {
  MatchSnapshotSchema,
  type MatchSnapshot,
  type SnapshotResult,
} from "../../src/server/snapshots/schema";
import { evaluateSnapshot } from "../../src/server/snapshots/logic";

const espnSource = {
  provider: "espn" as const,
  eventId: "760419",
  leagueSlug: "fifa.world",
  sourceUrl: "https://www.espn.com/soccer/match/_/gameId/760419/morocco-brazil",
};

function oddsCapturedSnapshot(): MatchSnapshot {
  return MatchSnapshotSchema.parse({
    schemaVersion: "2.0",
    slug: "brasil-vs-marruecos",
    title: "Brasil vs Marruecos",
    competitionName: "Mundial 2026",
    timezone: "America/Lima",
    homeTeamName: "Brasil",
    awayTeamName: "Marruecos",
    kickoffAt: "2026-06-13T22:00:00.000Z",
    phase: "odds_captured",
    stake: {
      eventUrl:
        "https://stake.pe/deportes/football/world/fifa-world-cup/brasil-vs-marruecos/event/21798325",
      eventId: "21798325",
    },
    sportsData: espnSource,
    odds: {
      source: "stake",
      capturedAt: "2026-06-13T21:08:03.608Z",
      frozen: true,
      markets: [
        {
          id: "market_1d",
          marketType: MarketType.MATCH_RESULT,
          rawMarketName: "Resultado del Partido",
          displayName: "Resultado",
          displayOrder: 10,
          supported: true,
          selections: [
            {
              id: "selection_draw",
              matchId: "brasil-vs-marruecos",
              marketType: MarketType.MATCH_RESULT,
              operator: SelectionOperator.DRAW,
              participantType: ParticipantType.MATCH,
              oddDecimal: 3.65,
              status: SelectionStatus.PENDING,
              sourceMarketId: "1",
              sourceSelectionId: "3138237496",
              rawMarketName: "Resultado del Partido",
              rawSelectionName: "X",
            },
          ],
        },
      ],
    },
    result: null,
    metadata: {
      createdAt: "2026-06-13T21:08:03.608Z",
      finalizedAt: null,
      lastEvaluatedAt: null,
    },
  });
}

function providerFixture(
  overrides: Partial<ProviderFixture> = {},
): ProviderFixture {
  return {
    eventId: "760419",
    sourceUrl: espnSource.sourceUrl,
    status: FixtureStatus.FINISHED,
    providerStatus: "FT",
    elapsedMinutes: 90,
    homeTeamId: "205",
    awayTeamId: "2869",
    homeTeamName: "Brazil",
    awayTeamName: "Morocco",
    competitionName: "FIFA World Cup",
    leagueSlug: "fifa.world",
    score: { home: 1, away: 1, halftimeHome: 1, halftimeAway: 1 },
    kickoffAt: "2026-06-13T22:00:00.000Z",
    lastUpdatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

function emptyTeamStats(
  overrides: Partial<SnapshotResult["teamStatistics"]["home"]> = {},
) {
  return {
    fouls: null,
    yellowCards: null,
    redCards: null,
    offsides: null,
    corners: null,
    saves: null,
    possessionPercent: null,
    totalShots: null,
    shotsOnTarget: null,
    blockedShots: null,
    accuratePasses: null,
    totalPasses: null,
    accurateCrosses: null,
    totalCrosses: null,
    totalLongBalls: null,
    accurateLongBalls: null,
    tacklesWon: null,
    totalTackles: null,
    interceptions: null,
    clearances: null,
    ...overrides,
  };
}

function espnResult(): SnapshotResult {
  return {
    evidence: {
      provider: "espn",
      eventId: "760419",
      sourceUrl: espnSource.sourceUrl,
      fetchedAt: "2026-06-14T00:01:00.000Z",
      payloadSha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rawArtifactPath: "tests/fixtures/espn/summary-760419.json",
    },
    status: FixtureStatus.FINISHED,
    elapsedMinutes: 90,
    score: { home: 1, away: 1, halftimeHome: 1, halftimeAway: 1 },
    firstScoringTeam: "AWAY",
    yellowCards: { home: 2, away: 0 },
    corners: { home: 6, away: 2 },
    teamStatistics: {
      home: emptyTeamStats({
        yellowCards: 2,
        corners: 6,
        shotsOnTarget: 5,
        totalShots: 12,
      }),
      away: emptyTeamStats({
        yellowCards: 0,
        corners: 2,
        shotsOnTarget: 3,
        totalShots: 14,
      }),
    },
    events: [
      {
        type: "GOAL",
        originalType: "goal",
        teamSide: "AWAY",
        period: 1,
        minute: 21,
        extraMinute: null,
        playerName: "Ismael Saibari",
        providerEventId: "49497769",
        text: "Ismael Saibari Goal",
      },
      {
        type: "GOAL",
        originalType: "goal",
        teamSide: "HOME",
        period: 1,
        minute: 32,
        extraMinute: null,
        playerName: "Vinícius Júnior",
        providerEventId: "49497900",
        text: "Vinícius Júnior Goal",
      },
    ],
    playerStats: {
      player_252107: {
        playerName: "Vinícius Júnior",
        teamSide: "HOME",
        starter: true,
        substitute: false,
        minutes: 90,
        goals: 1,
        shots: 1,
        shotsOnTarget: 1,
        yellowCards: 0,
        redCards: 0,
        assists: 0,
        appeared: true,
      },
    },
  };
}

describe("ESPN snapshot finalization safety", () => {
  it("accepts only the expected ESPN event, teams, orientation and kickoff", () => {
    expect(() =>
      assertRemoteFixtureMatchesSnapshot(
        oddsCapturedSnapshot(),
        providerFixture(),
        "760419" as never,
      ),
    ).not.toThrow();
  });

  it.each([
    ["event id mismatch", { eventId: "760420" }],
    ["wrong teams", { homeTeamName: "Argentina", awayTeamName: "Morocco" }],
    ["wrong orientation", { homeTeamName: "Morocco", awayTeamName: "Brazil" }],
    ["wrong kickoff", { kickoffAt: "2026-06-14T02:30:00.000Z" }],
  ])("rejects %s before any write", (_caseName, overrides) => {
    const writeSnapshot = vi.fn();

    expect(() =>
      assertRemoteFixtureMatchesSnapshot(
        oddsCapturedSnapshot(),
        providerFixture(overrides),
        "760419" as never,
      ),
    ).toThrow(/No se modifico el snapshot/i);
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a matching ESPN event that is not finalized yet", () => {
    const writeSnapshot = vi.fn();

    expect(() =>
      assertFixtureIsFinalizable(
        providerFixture({
          status: FixtureStatus.LIVE,
          providerStatus: "STATUS_IN_PROGRESS",
        }),
      ),
    ).toThrow(/todavia no esta finalizado/i);
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("finalizes with ESPN evidence without changing frozen odds identity", () => {
    const snapshot = oddsCapturedSnapshot();
    const originalOddsSignature = snapshot.odds.markets.map((market) => ({
      id: market.id,
      selections: market.selections.map((selection) => ({
        id: selection.id,
        oddDecimal: selection.oddDecimal,
        sourceMarketId: selection.sourceMarketId,
        sourceSelectionId: selection.sourceSelectionId,
      })),
    }));

    const finalized = (
      evaluateSnapshot as (input: {
        snapshot: MatchSnapshot;
        result: SnapshotResult;
        evaluatedAt: Date;
        sportsData: typeof espnSource;
      }) => MatchSnapshot
    )({
      snapshot,
      result: espnResult(),
      evaluatedAt: new Date("2026-06-14T00:05:00.000Z"),
      sportsData: espnSource,
    });

    expect(finalized.phase).toBe("finalized");
    expect(finalized.sportsData).toEqual(espnSource);
    expect(finalized.result?.evidence).toMatchObject({
      provider: "espn",
      eventId: "760419",
    });
    expect(
      finalized.odds.markets.map((market) => ({
        id: market.id,
        selections: market.selections.map((selection) => ({
          id: selection.id,
          oddDecimal: selection.oddDecimal,
          sourceMarketId: selection.sourceMarketId,
          sourceSelectionId: selection.sourceSelectionId,
        })),
      })),
    ).toEqual(originalOddsSignature);
    expect(finalized.odds.markets[0]?.selections[0]?.status).toBe(
      SelectionStatus.WON,
    );
  });
});
