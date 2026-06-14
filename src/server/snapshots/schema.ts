import { z } from "zod";
import {
  FixtureStatusSchema,
  MarketStateSchema,
  SelectionStatus,
  type StateResponse,
} from "../../domain/model";
import { type TeamMatchStatistics } from "../providers/types";

export const SnapshotPhaseSchema = z.enum(["odds_captured", "finalized"]);
export const SportsDataProviderSchema = z.enum(["espn", "demo"]);

export const SportsDataSourceSchema = z.object({
  provider: SportsDataProviderSchema,
  eventId: z.string().min(1).nullable(),
  leagueSlug: z.string().min(1).nullable(),
  sourceUrl: z.string().url().nullable(),
});

export const ResultEvidenceSchema = z.object({
  provider: SportsDataProviderSchema,
  eventId: z.string().min(1),
  sourceUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rawArtifactPath: z.string().min(1).nullable(),
});

export const SnapshotResultEventSchema = z.object({
  type: z.enum(["GOAL", "YELLOW_CARD", "RED_CARD", "SUBSTITUTION"]),
  originalType: z.string().nullable(),
  teamSide: z.enum(["HOME", "AWAY"]),
  period: z.number().int().positive().nullable(),
  minute: z.number().int().nonnegative().nullable(),
  extraMinute: z.number().int().nonnegative().nullable(),
  playerName: z.string().nullable(),
  providerEventId: z.string().nullable(),
  text: z.string().nullable(),
});

export const TeamMatchStatisticsSchema = z.object({
  fouls: z.number().int().nonnegative().nullable(),
  yellowCards: z.number().int().nonnegative().nullable(),
  redCards: z.number().int().nonnegative().nullable(),
  offsides: z.number().int().nonnegative().nullable(),
  corners: z.number().int().nonnegative().nullable(),
  saves: z.number().int().nonnegative().nullable(),
  possessionPercent: z.number().nonnegative().nullable(),
  totalShots: z.number().int().nonnegative().nullable(),
  shotsOnTarget: z.number().int().nonnegative().nullable(),
  blockedShots: z.number().int().nonnegative().nullable(),
  accuratePasses: z.number().int().nonnegative().nullable(),
  totalPasses: z.number().int().nonnegative().nullable(),
  accurateCrosses: z.number().int().nonnegative().nullable(),
  totalCrosses: z.number().int().nonnegative().nullable(),
  totalLongBalls: z.number().int().nonnegative().nullable(),
  accurateLongBalls: z.number().int().nonnegative().nullable(),
  tacklesWon: z.number().int().nonnegative().nullable(),
  totalTackles: z.number().int().nonnegative().nullable(),
  interceptions: z.number().int().nonnegative().nullable(),
  clearances: z.number().int().nonnegative().nullable(),
}) satisfies z.ZodType<TeamMatchStatistics>;

export const SnapshotResultSchema = z.object({
  evidence: ResultEvidenceSchema.nullable(),
  status: FixtureStatusSchema,
  elapsedMinutes: z.number().int().nonnegative().nullable(),
  score: z.object({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
    halftimeHome: z.number().int().nonnegative().nullable(),
    halftimeAway: z.number().int().nonnegative().nullable(),
  }),
  firstScoringTeam: z.enum(["HOME", "AWAY"]).nullable(),
  yellowCards: z.object({
    home: z.number().int().nonnegative().nullable(),
    away: z.number().int().nonnegative().nullable(),
  }),
  corners: z.object({
    home: z.number().int().nonnegative().nullable(),
    away: z.number().int().nonnegative().nullable(),
  }),
  teamStatistics: z.object({
    home: TeamMatchStatisticsSchema,
    away: TeamMatchStatisticsSchema,
  }),
  events: z.array(SnapshotResultEventSchema),
  playerStats: z.record(
    z.object({
      playerName: z.string(),
      teamSide: z.enum(["HOME", "AWAY"]).nullable(),
      starter: z.boolean(),
      substitute: z.boolean(),
      minutes: z.number().int().nonnegative().nullable(),
      goals: z.number().int().nonnegative().nullable(),
      shots: z.number().int().nonnegative().nullable(),
      shotsOnTarget: z.number().int().nonnegative().nullable(),
      yellowCards: z.number().int().nonnegative().nullable(),
      redCards: z.number().int().nonnegative().nullable(),
      assists: z.number().int().nonnegative().nullable(),
      appeared: z.boolean(),
    }),
  ),
});

export const MatchSnapshotSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid snapshot slug."),
    title: z.string().min(1),
    competitionName: z.string().nullable(),
    timezone: z.string().min(1),
    homeTeamName: z.string().min(1),
    awayTeamName: z.string().min(1),
    kickoffAt: z.string().datetime(),
    phase: SnapshotPhaseSchema,
    stake: z.object({
      eventUrl: z.string().url(),
      eventId: z.string().nullable(),
    }),
    sportsData: SportsDataSourceSchema,
    odds: z.object({
      source: z.literal("stake"),
      capturedAt: z.string().datetime(),
      frozen: z.literal(true),
      markets: z.array(MarketStateSchema),
    }),
    result: SnapshotResultSchema.nullable(),
    metadata: z.object({
      createdAt: z.string().datetime(),
      finalizedAt: z.string().datetime().nullable(),
      lastEvaluatedAt: z.string().datetime().nullable(),
    }),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.phase === "odds_captured" && snapshot.result !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result"],
        message: "Odds-captured snapshots must not include a result.",
      });
      return;
    }

    if (snapshot.phase !== "finalized") {
      return;
    }

    if (!snapshot.result) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["result"],
        message: "Finalized snapshots require a result.",
      });
    }
    if (!snapshot.metadata.finalizedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metadata", "finalizedAt"],
        message: "Finalized snapshots require finalizedAt.",
      });
    }

    const pendingSelections = snapshot.odds.markets
      .flatMap((market) => market.selections)
      .filter((selection) => selection.status === SelectionStatus.PENDING);
    if (pendingSelections.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["odds", "markets"],
        message: "Finalized snapshots cannot keep pending selections.",
      });
    }
  });

export type SnapshotPhase = z.infer<typeof SnapshotPhaseSchema>;
export type SnapshotResult = z.infer<typeof SnapshotResultSchema>;
export type MatchSnapshot = z.infer<typeof MatchSnapshotSchema>;
export type SportsDataSource = z.infer<typeof SportsDataSourceSchema>;
export type ResultEvidence = z.infer<typeof ResultEvidenceSchema>;

export type SnapshotStateResponse = StateResponse;
