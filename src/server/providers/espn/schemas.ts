import { z } from "zod";

const EspnIdSchema = z.union([z.string(), z.number()]).transform(String);
const EspnNumberLikeSchema = z.union([z.number(), z.string()]);

export const EspnClockSchema = z
  .object({
    value: z.number().nullable().optional(),
    displayValue: z.string().nullable().optional(),
  })
  .passthrough();

export const EspnTeamSchema = z
  .object({
    id: EspnIdSchema.optional(),
    uid: z.string().optional(),
    slug: z.string().optional(),
    location: z.string().optional(),
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    displayName: z.string().optional(),
    shortDisplayName: z.string().optional(),
  })
  .passthrough();

export const EspnStatisticSchema = z
  .object({
    name: z.string(),
    displayName: z.string().optional(),
    shortDisplayName: z.string().optional(),
    label: z.string().optional(),
    value: z.union([z.number(), z.string(), z.null()]).optional(),
    displayValue: z.string().nullable().optional(),
  })
  .passthrough();

export const EspnCompetitorSchema = z
  .object({
    id: EspnIdSchema.optional(),
    uid: z.string().optional(),
    homeAway: z.enum(["home", "away"]).optional(),
    score: EspnNumberLikeSchema.nullable().optional(),
    winner: z.boolean().optional(),
    team: EspnTeamSchema.optional(),
    linescores: z
      .array(
        z
          .object({
            value: EspnNumberLikeSchema.nullable().optional(),
            displayValue: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const EspnStatusTypeSchema = z
  .object({
    id: EspnIdSchema.optional(),
    name: z.string().optional(),
    state: z.string().optional(),
    completed: z.boolean().optional(),
    description: z.string().optional(),
    detail: z.string().optional(),
    shortDetail: z.string().optional(),
  })
  .passthrough();

export const EspnCompetitionSchema = z
  .object({
    id: EspnIdSchema,
    uid: z.string().optional(),
    date: z.string().optional(),
    isFinal: z.boolean().optional(),
    status: z
      .object({
        type: EspnStatusTypeSchema,
      })
      .passthrough(),
    competitors: z.array(EspnCompetitorSchema),
  })
  .passthrough();

export const EspnLeagueSchema = z
  .object({
    id: EspnIdSchema.optional(),
    uid: z.string().optional(),
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    shortName: z.string().optional(),
    slug: z.string().optional(),
  })
  .passthrough();

export const EspnSeasonSchema = z
  .object({
    year: z.number().int().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const EspnHeaderSchema = z
  .object({
    id: EspnIdSchema,
    uid: z.string().optional(),
    name: z.string().optional(),
    shortName: z.string().optional(),
    league: EspnLeagueSchema,
    season: EspnSeasonSchema,
    competitions: z.array(EspnCompetitionSchema).min(1),
  })
  .passthrough();

export const EspnBoxscoreTeamSchema = z
  .object({
    homeAway: z.enum(["home", "away"]).optional(),
    team: EspnTeamSchema.optional(),
    statistics: z.array(EspnStatisticSchema).optional(),
  })
  .passthrough();

export const EspnPlayTypeSchema = z
  .object({
    id: EspnIdSchema.optional(),
    text: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export const EspnAthleteSchema = z
  .object({
    id: EspnIdSchema.optional(),
    uid: z.string().optional(),
    displayName: z.string().optional(),
    fullName: z.string().optional(),
    shortName: z.string().optional(),
  })
  .passthrough();

export const EspnParticipantSchema = z
  .object({
    athlete: EspnAthleteSchema.optional(),
  })
  .passthrough();

export const EspnPlaySchema = z
  .object({
    id: EspnIdSchema.optional(),
    sequence: z.number().optional(),
    type: EspnPlayTypeSchema.optional(),
    text: z.string().optional(),
    shortText: z.string().optional(),
    period: z
      .object({
        number: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    clock: EspnClockSchema.optional(),
    team: EspnTeamSchema.optional(),
    participants: z.array(EspnParticipantSchema).optional(),
    wallclock: z.string().optional(),
  })
  .passthrough();

export const EspnCommentaryItemSchema = z
  .object({
    id: EspnIdSchema.optional(),
    sequence: z.number().optional(),
    text: z.string().optional(),
    time: EspnClockSchema.optional(),
    play: EspnPlaySchema.optional(),
  })
  .passthrough();

export const EspnRosterPlayerSchema = z
  .object({
    athlete: EspnAthleteSchema.optional(),
    starter: z.boolean().optional(),
    subbedIn: z.boolean().optional(),
    subbedOut: z.boolean().optional(),
    active: z.boolean().optional(),
    didNotPlay: z.boolean().optional(),
    stats: z.array(EspnStatisticSchema).optional(),
  })
  .passthrough();

export const EspnRosterSchema = z
  .object({
    homeAway: z.enum(["home", "away"]).optional(),
    team: EspnTeamSchema.optional(),
    roster: z.array(EspnRosterPlayerSchema).optional(),
  })
  .passthrough();

export const EspnSummarySchema = z
  .object({
    boxscore: z
      .object({
        teams: z.array(EspnBoxscoreTeamSchema),
      })
      .passthrough(),
    rosters: z.array(EspnRosterSchema).optional(),
    header: EspnHeaderSchema,
    keyEvents: z.array(EspnPlaySchema).optional(),
    commentary: z.array(EspnCommentaryItemSchema).optional(),
    plays: z.array(EspnPlaySchema).optional(),
    meta: z
      .object({
        lastUpdatedAt: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type EspnSummary = z.infer<typeof EspnSummarySchema>;
export type EspnCompetition = z.infer<typeof EspnCompetitionSchema>;
export type EspnCompetitor = z.infer<typeof EspnCompetitorSchema>;
export type EspnStatusType = z.infer<typeof EspnStatusTypeSchema>;
export type EspnTeam = z.infer<typeof EspnTeamSchema>;
export type EspnStatistic = z.infer<typeof EspnStatisticSchema>;
export type EspnBoxscoreTeam = z.infer<typeof EspnBoxscoreTeamSchema>;
export type EspnClock = z.infer<typeof EspnClockSchema>;
export type EspnPlayType = z.infer<typeof EspnPlayTypeSchema>;
export type EspnPlay = z.infer<typeof EspnPlaySchema>;
export type EspnCommentaryItem = z.infer<typeof EspnCommentaryItemSchema>;
export type EspnRoster = z.infer<typeof EspnRosterSchema>;
