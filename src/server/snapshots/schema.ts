import { z } from "zod";
import {
  FixtureStatusSchema,
  MarketStateSchema,
  SelectionStatus,
  type StateResponse,
} from "../../domain/model";

export const SnapshotPhaseSchema = z.enum(["odds_captured", "finalized"]);

export const SnapshotResultEventSchema = z.object({
  type: z.enum(["GOAL", "YELLOW_CARD", "SUBSTITUTION"]),
  teamSide: z.enum(["HOME", "AWAY"]),
  minute: z.number().int().nonnegative().nullable(),
  extraMinute: z.number().int().nonnegative().nullable(),
  playerName: z.string().nullable(),
  providerEventId: z.string().nullable(),
});

export const SnapshotResultSchema = z.object({
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
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
  }),
  corners: z.object({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
  }),
  events: z.array(SnapshotResultEventSchema),
  playerStats: z.record(
    z.object({
      goals: z.number().int().nonnegative(),
      shotsOnTarget: z.number().int().nonnegative(),
      appeared: z.boolean(),
    }),
  ),
});

export const MatchSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
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
    apiFootball: z.object({
      fixtureId: z.number().int().nullable(),
    }),
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

export type SnapshotStateResponse = StateResponse;
