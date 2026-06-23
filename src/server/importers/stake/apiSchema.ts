import { z } from "zod";

const StakeApiNameSchema = z.record(z.string()).nullable();
const StakeApiNumberLikeSchema = z.union([z.number(), z.string()]);

export const StakeApiOddSchema = z
  .object({
    id: z.number().int(),
    event_id: z.number().int(),
    odd_id: z.number().int(),
    odd_code: z.string().min(1),
    odd_value: z.number().positive(),
    team_name: z.string().min(1),
    team_side: z.number().int().optional(),
    union_id: z.number().int(),
    group_id: z.number().int().optional(),
    filter_id: z.number().int().optional(),
    variation_id: z.number().int().optional(),
    variation_order_id: z.number().int().nullable().optional(),
    additional_value_raw: StakeApiNumberLikeSchema.nullable().optional(),
    denominator: z.number().optional(),
    numerator: z.number().optional(),
    frozen: z.boolean().optional(),
    unique_id: z.string().optional(),
    team_players_id: z.number().int().nullable().optional(),
    racing_team_players_id: z.number().int().nullable().optional(),
    team_player_1_name: StakeApiNameSchema.optional(),
    team_player_2_name: StakeApiNameSchema.optional(),
    player_tag: z.string().nullable().optional(),
    row_id: z.number().int().optional(),
    order_num: z.number().int().optional(),
  })
  .passthrough();

export const StakeApiPayloadSchema = z
  .object({
    info: z
      .object({
        id: z.number().int(),
        date_start: z.string().min(1),
        event_slug: z.string().optional(),
        teams: z.object({
          home: z.string().min(1),
          away: z.string().min(1),
        }),
        teams_id: z
          .object({
            home: z.number().int(),
            away: z.number().int(),
          })
          .optional(),
        tournament_id: z.number().int().optional(),
        tournament_name: z.string().min(1),
        tournament_slug: z.string().optional(),
        sport_id: z.number().int().optional(),
        sport_name: z.string().optional(),
        is_live: z.boolean().optional(),
        count: z.number().int().optional(),
        betBuilderEnabled: z.boolean().optional(),
        expandableMarkets: z.array(z.string()).optional(),
      })
      .passthrough(),
    odds: z.record(StakeApiOddSchema),
    filters: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type StakeApiPayload = z.infer<typeof StakeApiPayloadSchema>;
export type StakeApiOdd = z.infer<typeof StakeApiOddSchema>;
