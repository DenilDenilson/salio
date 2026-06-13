import { z } from "zod";

export enum MarketType {
  MATCH_RESULT = "MATCH_RESULT",
  DOUBLE_CHANCE = "DOUBLE_CHANCE",
  DRAW_NO_BET = "DRAW_NO_BET",
  HANDICAP = "HANDICAP",
  TOTAL_GOALS = "TOTAL_GOALS",
  TEAM_TOTAL_GOALS = "TEAM_TOTAL_GOALS",
  BOTH_TEAMS_TO_SCORE = "BOTH_TEAMS_TO_SCORE",
  EXACT_SCORE = "EXACT_SCORE",
  FIRST_TEAM_TO_SCORE = "FIRST_TEAM_TO_SCORE",
  ANYTIME_GOALSCORER = "ANYTIME_GOALSCORER",
  FIRST_HALF_TOTAL_GOALS = "FIRST_HALF_TOTAL_GOALS",
  TOTAL_YELLOW_CARDS = "TOTAL_YELLOW_CARDS",
  TOTAL_CORNERS = "TOTAL_CORNERS",
  PLAYER_SHOTS_ON_TARGET = "PLAYER_SHOTS_ON_TARGET",
  UNSUPPORTED = "UNSUPPORTED",
}

export enum SelectionStatus {
  PENDING = "pending",
  WON = "won",
  LOST = "lost",
  VOID = "void",
  UNSUPPORTED = "unsupported",
}

export enum SelectionOperator {
  HOME = "HOME",
  DRAW = "DRAW",
  AWAY = "AWAY",
  HOME_OR_DRAW = "HOME_OR_DRAW",
  HOME_OR_AWAY = "HOME_OR_AWAY",
  DRAW_OR_AWAY = "DRAW_OR_AWAY",
  OVER = "OVER",
  UNDER = "UNDER",
  YES = "YES",
  NO = "NO",
  EXACT = "EXACT",
  PLAYER = "PLAYER",
  TEAM = "TEAM",
}

export enum ParticipantType {
  MATCH = "MATCH",
  HOME_TEAM = "HOME_TEAM",
  AWAY_TEAM = "AWAY_TEAM",
  PLAYER = "PLAYER",
}

export enum FixtureStatus {
  NOT_STARTED = "NS",
  LIVE = "LIVE",
  HALFTIME = "HT",
  FINISHED = "FT",
  AFTER_EXTRA_TIME = "AET",
  PENALTIES = "PEN",
  POSTPONED = "PST",
  CANCELLED = "CANC",
  ABANDONED = "ABD",
  SUSPENDED = "SUSP",
}

export enum OddsSnapshotStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  FROZEN = "frozen",
  SUPERSEDED = "superseded",
  FAILED = "failed",
}

export const MarketTypeSchema = z.nativeEnum(MarketType);
export const SelectionStatusSchema = z.nativeEnum(SelectionStatus);
export const SelectionOperatorSchema = z.nativeEnum(SelectionOperator);
export const ParticipantTypeSchema = z.nativeEnum(ParticipantType);
export const FixtureStatusSchema = z.nativeEnum(FixtureStatus);
export const OddsSnapshotStatusSchema = z.nativeEnum(OddsSnapshotStatus);

export const NormalizedSelectionSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  marketType: MarketTypeSchema,
  operator: SelectionOperatorSchema,
  participantType: ParticipantTypeSchema,
  participantId: z.string().optional(),
  participantName: z.string().optional(),
  line: z.number().optional(),
  exactHomeScore: z.number().int().optional(),
  exactAwayScore: z.number().int().optional(),
  oddDecimal: z.number().positive(),
  status: SelectionStatusSchema,
  resolvedAt: z.string().datetime().optional(),
  resolvedMinute: z.number().int().optional(),
  resolutionReason: z.string().optional(),
  sourceMarketId: z.string().optional(),
  sourceSelectionId: z.string().optional(),
  rawMarketName: z.string(),
  rawSelectionName: z.string(),
});

export type NormalizedSelection = z.infer<typeof NormalizedSelectionSchema>;

export const RuleEvaluationContextSchema = z.object({
  now: z.date(),
  fixtureStatus: FixtureStatusSchema,
  elapsedMinutes: z.number().int().nonnegative().optional(),
  score: z.object({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
    halftimeHome: z.number().int().nonnegative().optional(),
    halftimeAway: z.number().int().nonnegative().optional(),
  }),
  firstScoringTeam: z.enum(["HOME", "AWAY"]).nullable().optional(),
  yellowCards: z.object({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
  }),
  corners: z.object({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
  }),
  playerStats: z.record(
    z.object({
      goals: z.number().int().nonnegative(),
      shotsOnTarget: z.number().int().nonnegative(),
      appeared: z.boolean(),
    }),
  ),
});

export type RuleEvaluationContext = z.infer<typeof RuleEvaluationContextSchema>;

export const RuleEvaluationSchema = z.object({
  status: SelectionStatusSchema,
  resolvedAt: z.date().optional(),
  resolvedMinute: z.number().int().optional(),
  reason: z.string(),
});

export type RuleEvaluation = z.infer<typeof RuleEvaluationSchema>;

export const MatchSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  homeTeamName: z.string(),
  awayTeamName: z.string(),
  competitionName: z.string().nullable(),
  kickoffAt: z.string().datetime(),
  timezone: z.string(),
  status: FixtureStatusSchema,
  stakeUrl: z.string().url(),
  stakeEventId: z.string().nullable(),
  apiFootballFixtureId: z.number().int().nullable(),
  oddsFreezeOffsetMinutes: z.number().int().positive(),
  published: z.boolean(),
});

export type MatchSummary = z.infer<typeof MatchSummarySchema>;

export const MarketStateSchema = z.object({
  id: z.string(),
  marketType: MarketTypeSchema,
  rawMarketName: z.string(),
  displayName: z.string(),
  displayOrder: z.number().int(),
  supported: z.boolean(),
  selections: z.array(NormalizedSelectionSchema),
});

export type MarketState = z.infer<typeof MarketStateSchema>;

export const StateResponseSchema = z.object({
  match: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    homeTeamName: z.string(),
    awayTeamName: z.string(),
    competitionName: z.string().nullable(),
    status: FixtureStatusSchema,
    elapsedMinutes: z.number().int().nullable(),
    score: z.object({ home: z.number().int(), away: z.number().int() }),
    kickoffAt: z.string().datetime(),
  }),
  odds: z.object({
    capturedAt: z.string().datetime(),
    frozen: z.boolean(),
    frozenAt: z.string().datetime().nullable(),
    source: z.string(),
    timezone: z.string(),
    notice: z.string(),
  }),
  markets: z.array(MarketStateSchema),
  lastUpdatedAt: z.string().datetime(),
  stale: z.boolean(),
  nextSuggestedPollMs: z.number().int().positive(),
  errors: z.array(z.string()),
});

export type StateResponse = z.infer<typeof StateResponseSchema>;

export function isFinalStatus(status: FixtureStatus): boolean {
  return [
    FixtureStatus.FINISHED,
    FixtureStatus.AFTER_EXTRA_TIME,
    FixtureStatus.PENALTIES,
  ].includes(status);
}

export function isUnresolvableStatus(status: FixtureStatus): boolean {
  return [
    FixtureStatus.POSTPONED,
    FixtureStatus.CANCELLED,
    FixtureStatus.ABANDONED,
    FixtureStatus.SUSPENDED,
  ].includes(status);
}
