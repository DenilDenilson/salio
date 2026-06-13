import { describe, expect, it } from "vitest";
import {
  FixtureStatus,
  MarketType,
  ParticipantType,
  SelectionOperator,
  SelectionStatus,
  type NormalizedSelection,
  type RuleEvaluationContext,
} from "../../src/domain/model";
import { evaluateSelection } from "../../src/domain/rules";

const baseContext: RuleEvaluationContext = {
  now: new Date("2026-06-20T22:24:15.000Z"),
  fixtureStatus: FixtureStatus.LIVE,
  elapsedMinutes: 67,
  score: { home: 2, away: 1, halftimeHome: 1, halftimeAway: 0 },
  firstScoringTeam: "HOME",
  yellowCards: { home: 3, away: 2 },
  corners: { home: 6, away: 4 },
  playerStats: {
    "player_demo-striker": { goals: 1, shotsOnTarget: 2, appeared: true },
    player_absent: { goals: 0, shotsOnTarget: 0, appeared: false },
  },
};

function selection(
  overrides: Partial<NormalizedSelection>,
): NormalizedSelection {
  return {
    id: "sel",
    matchId: "match",
    marketType: MarketType.TOTAL_GOALS,
    operator: SelectionOperator.OVER,
    participantType: ParticipantType.MATCH,
    oddDecimal: 2,
    status: SelectionStatus.PENDING,
    rawMarketName: "Total de goles",
    rawSelectionName: "Más de 2.5",
    line: 2.5,
    ...overrides,
  };
}

describe("rule engine P0", () => {
  it.each([
    [SelectionOperator.HOME, SelectionStatus.PENDING, FixtureStatus.LIVE, 2, 1],
    [SelectionOperator.HOME, SelectionStatus.WON, FixtureStatus.FINISHED, 2, 1],
    [SelectionOperator.DRAW, SelectionStatus.WON, FixtureStatus.FINISHED, 1, 1],
    [SelectionOperator.AWAY, SelectionStatus.WON, FixtureStatus.FINISHED, 1, 2],
    [
      SelectionOperator.HOME,
      SelectionStatus.PENDING,
      FixtureStatus.ABANDONED,
      2,
      1,
    ],
  ])("evaluates match result %s", (operator, expected, status, home, away) => {
    const result = evaluateSelection(
      selection({
        marketType: MarketType.MATCH_RESULT,
        operator,
        line: undefined,
      }),
      { ...baseContext, fixtureStatus: status, score: { home, away } },
    );
    expect(result.status).toBe(expected);
  });

  it.each([
    [
      SelectionOperator.OVER,
      2.5,
      2,
      FixtureStatus.LIVE,
      SelectionStatus.PENDING,
    ],
    [SelectionOperator.OVER, 2.5, 3, FixtureStatus.LIVE, SelectionStatus.WON],
    [SelectionOperator.UNDER, 2.5, 3, FixtureStatus.LIVE, SelectionStatus.LOST],
    [
      SelectionOperator.UNDER,
      2.5,
      2,
      FixtureStatus.LIVE,
      SelectionStatus.PENDING,
    ],
    [
      SelectionOperator.UNDER,
      2.5,
      2,
      FixtureStatus.FINISHED,
      SelectionStatus.WON,
    ],
    [
      SelectionOperator.UNDER,
      2,
      2,
      FixtureStatus.FINISHED,
      SelectionStatus.VOID,
    ],
  ])(
    "evaluates totals %s line %s total %s",
    (operator, line, total, fixtureStatus, expected) => {
      const result = evaluateSelection(selection({ operator, line }), {
        ...baseContext,
        fixtureStatus,
        score: { home: total, away: 0 },
      });
      expect(result.status).toBe(expected);
    },
  );

  it.each([
    [SelectionOperator.YES, 1, 0, FixtureStatus.LIVE, SelectionStatus.PENDING],
    [SelectionOperator.YES, 1, 1, FixtureStatus.LIVE, SelectionStatus.WON],
    [SelectionOperator.NO, 1, 1, FixtureStatus.LIVE, SelectionStatus.LOST],
    [SelectionOperator.NO, 2, 0, FixtureStatus.FINISHED, SelectionStatus.WON],
  ])(
    "evaluates both teams to score",
    (operator, home, away, fixtureStatus, expected) => {
      const result = evaluateSelection(
        selection({
          marketType: MarketType.BOTH_TEAMS_TO_SCORE,
          operator,
          line: undefined,
        }),
        { ...baseContext, fixtureStatus, score: { home, away } },
      );
      expect(result.status).toBe(expected);
    },
  );

  it.each([
    [SelectionOperator.HOME, "HOME", SelectionStatus.WON],
    [SelectionOperator.AWAY, "HOME", SelectionStatus.LOST],
    [SelectionOperator.NO, null, SelectionStatus.WON],
  ] as const)(
    "evaluates first team to score",
    (operator, firstScoringTeam, expected) => {
      const result = evaluateSelection(
        selection({
          marketType: MarketType.FIRST_TEAM_TO_SCORE,
          operator,
          line: undefined,
        }),
        {
          ...baseContext,
          fixtureStatus: firstScoringTeam
            ? FixtureStatus.LIVE
            : FixtureStatus.FINISHED,
          firstScoringTeam,
          score: firstScoringTeam ? { home: 1, away: 0 } : { home: 0, away: 0 },
        },
      );
      expect(result.status).toBe(expected);
    },
  );

  it("evaluates yellow cards and corners without double counting provider corrections", () => {
    const cards = evaluateSelection(
      selection({
        marketType: MarketType.TOTAL_YELLOW_CARDS,
        operator: SelectionOperator.OVER,
        line: 4.5,
      }),
      baseContext,
    );
    const corners = evaluateSelection(
      selection({
        marketType: MarketType.TOTAL_CORNERS,
        operator: SelectionOperator.OVER,
        line: 8.5,
      }),
      baseContext,
    );
    expect(cards.status).toBe(SelectionStatus.WON);
    expect(corners.status).toBe(SelectionStatus.WON);
  });

  it("preserves resolved selections when a later partial context would be pending", () => {
    const result = evaluateSelection(
      selection({
        status: SelectionStatus.WON,
        resolvedAt: "2026-06-20T22:00:00.000Z",
        resolutionReason: "Ya resuelta.",
      }),
      { ...baseContext, score: { home: 1, away: 1 } },
    );
    expect(result.status).toBe(SelectionStatus.WON);
  });
});

describe("rule engine P1 coverage", () => {
  it.each([
    [MarketType.EXACT_SCORE, SelectionOperator.EXACT, SelectionStatus.PENDING],
    [MarketType.TEAM_TOTAL_GOALS, SelectionOperator.OVER, SelectionStatus.WON],
    [
      MarketType.FIRST_HALF_TOTAL_GOALS,
      SelectionOperator.UNDER,
      SelectionStatus.WON,
    ],
    [
      MarketType.ANYTIME_GOALSCORER,
      SelectionOperator.PLAYER,
      SelectionStatus.WON,
    ],
    [
      MarketType.PLAYER_SHOTS_ON_TARGET,
      SelectionOperator.OVER,
      SelectionStatus.WON,
    ],
  ])("evaluates %s", (marketType, operator, expected) => {
    const result = evaluateSelection(
      selection({
        marketType,
        operator,
        participantType:
          marketType === MarketType.ANYTIME_GOALSCORER ||
          marketType === MarketType.PLAYER_SHOTS_ON_TARGET
            ? ParticipantType.PLAYER
            : marketType === MarketType.TEAM_TOTAL_GOALS
              ? ParticipantType.HOME_TEAM
              : ParticipantType.MATCH,
        participantId:
          marketType === MarketType.ANYTIME_GOALSCORER ||
          marketType === MarketType.PLAYER_SHOTS_ON_TARGET
            ? "player_demo-striker"
            : undefined,
        exactHomeScore: marketType === MarketType.EXACT_SCORE ? 2 : undefined,
        exactAwayScore: marketType === MarketType.EXACT_SCORE ? 1 : undefined,
        line: marketType === MarketType.FIRST_HALF_TOTAL_GOALS ? 1.5 : 1.5,
      }),
      baseContext,
    );
    expect(result.status).toBe(expected);
  });

  it("voids absent goalscorer at final and does not invent missing player stats", () => {
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.ANYTIME_GOALSCORER,
          operator: SelectionOperator.PLAYER,
          participantType: ParticipantType.PLAYER,
          participantId: "player_absent",
          line: undefined,
        }),
        { ...baseContext, fixtureStatus: FixtureStatus.FINISHED },
      ).status,
    ).toBe(SelectionStatus.VOID);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.PLAYER_SHOTS_ON_TARGET,
          operator: SelectionOperator.OVER,
          participantType: ParticipantType.PLAYER,
          participantId: "missing",
        }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
  });
});

describe("rule engine edge cases", () => {
  it("returns unsupported for missing lines, unknown markets and missing exact scores", () => {
    expect(
      evaluateSelection(selection({ line: undefined }), baseContext).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({ marketType: MarketType.UNSUPPORTED }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.EXACT_SCORE,
          operator: SelectionOperator.EXACT,
          line: undefined,
        }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
  });

  it("covers draw-no-bet, double chance losses and exact score final outcomes", () => {
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.DRAW_NO_BET,
          operator: SelectionOperator.HOME,
          line: undefined,
        }),
        {
          ...baseContext,
          fixtureStatus: FixtureStatus.FINISHED,
          score: { home: 1, away: 1 },
        },
      ).status,
    ).toBe(SelectionStatus.VOID);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.DOUBLE_CHANCE,
          operator: SelectionOperator.HOME_OR_DRAW,
          line: undefined,
        }),
        {
          ...baseContext,
          fixtureStatus: FixtureStatus.FINISHED,
          score: { home: 0, away: 1 },
        },
      ).status,
    ).toBe(SelectionStatus.LOST);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.EXACT_SCORE,
          operator: SelectionOperator.EXACT,
          exactHomeScore: 1,
          exactAwayScore: 0,
          line: undefined,
        }),
        {
          ...baseContext,
          fixtureStatus: FixtureStatus.FINISHED,
          score: { home: 1, away: 0 },
        },
      ).status,
    ).toBe(SelectionStatus.WON);
  });

  it("keeps abandoned matches pending and handles first-half/player pending branches", () => {
    expect(
      evaluateSelection(selection({ operator: SelectionOperator.UNDER }), {
        ...baseContext,
        fixtureStatus: FixtureStatus.SUSPENDED,
      }).status,
    ).toBe(SelectionStatus.PENDING);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.FIRST_HALF_TOTAL_GOALS,
          operator: SelectionOperator.UNDER,
          line: 1.5,
        }),
        {
          ...baseContext,
          score: { home: 0, away: 0 },
          fixtureStatus: FixtureStatus.HALFTIME,
        },
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.ANYTIME_GOALSCORER,
          operator: SelectionOperator.PLAYER,
          participantType: ParticipantType.PLAYER,
          participantId: "player_pending",
          line: undefined,
        }),
        {
          ...baseContext,
          playerStats: {
            player_pending: { goals: 0, shotsOnTarget: 0, appeared: true },
          },
        },
      ).status,
    ).toBe(SelectionStatus.PENDING);
  });

  it("covers unsupported operators and missing participants", () => {
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.HANDICAP,
          operator: SelectionOperator.HOME,
        }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({ operator: SelectionOperator.EXACT }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.BOTH_TEAMS_TO_SCORE,
          operator: SelectionOperator.EXACT,
          line: undefined,
        }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.TEAM_TOTAL_GOALS,
          participantType: ParticipantType.MATCH,
        }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.PLAYER_SHOTS_ON_TARGET,
          participantType: ParticipantType.PLAYER,
          participantId: undefined,
        }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
  });

  it("covers final losing branches and unresolved preservation fallback", () => {
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.DRAW_NO_BET,
          operator: SelectionOperator.AWAY,
          line: undefined,
        }),
        {
          ...baseContext,
          fixtureStatus: FixtureStatus.FINISHED,
          score: { home: 2, away: 1 },
        },
      ).status,
    ).toBe(SelectionStatus.LOST);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.EXACT_SCORE,
          operator: SelectionOperator.EXACT,
          exactHomeScore: 1,
          exactAwayScore: 0,
          line: undefined,
        }),
        {
          ...baseContext,
          fixtureStatus: FixtureStatus.FINISHED,
          score: { home: 1, away: 1 },
        },
      ).status,
    ).toBe(SelectionStatus.LOST);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.ANYTIME_GOALSCORER,
          operator: SelectionOperator.PLAYER,
          participantType: ParticipantType.PLAYER,
          participantId: "player_pending",
          status: SelectionStatus.LOST,
          line: undefined,
        }),
        {
          ...baseContext,
          playerStats: {
            player_pending: { goals: 0, shotsOnTarget: 0, appeared: true },
          },
        },
      ),
    ).toMatchObject({
      status: SelectionStatus.LOST,
      reason: "Estado resuelto preservado hasta reconstruccion oficial.",
    });
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.ANYTIME_GOALSCORER,
          operator: SelectionOperator.PLAYER,
          participantType: ParticipantType.PLAYER,
          participantId: "missing",
          line: undefined,
        }),
        baseContext,
      ).status,
    ).toBe(SelectionStatus.UNSUPPORTED);
    expect(
      evaluateSelection(
        selection({
          marketType: MarketType.ANYTIME_GOALSCORER,
          operator: SelectionOperator.PLAYER,
          participantType: ParticipantType.PLAYER,
          participantId: "player_pending",
          line: undefined,
        }),
        {
          ...baseContext,
          fixtureStatus: FixtureStatus.FINISHED,
          playerStats: {
            player_pending: { goals: 0, shotsOnTarget: 0, appeared: true },
          },
        },
      ),
    ).toMatchObject({
      status: SelectionStatus.LOST,
      reason: "El jugador participo y no marco.",
    });
  });
});
