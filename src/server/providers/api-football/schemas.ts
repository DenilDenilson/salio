import { z } from "zod";

export const ApiFootballErrorSchema = z.object({
  errors: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional(),
});

export const ApiFootballFixtureResponseSchema = z.object({
  response: z.array(
    z.object({
      fixture: z.object({
        id: z.number(),
        date: z.string(),
        status: z.object({
          short: z.string(),
          elapsed: z.number().nullable(),
        }),
      }),
      league: z.object({ name: z.string().nullable().optional() }).optional(),
      teams: z.object({
        home: z.object({ name: z.string(), id: z.number().optional() }),
        away: z.object({ name: z.string(), id: z.number().optional() }),
      }),
      goals: z.object({
        home: z.number().nullable(),
        away: z.number().nullable(),
      }),
      score: z
        .object({
          halftime: z
            .object({
              home: z.number().nullable(),
              away: z.number().nullable(),
            })
            .optional(),
        })
        .optional(),
    }),
  ),
});

export const ApiFootballEventsResponseSchema = z.object({
  response: z.array(
    z.object({
      time: z.object({
        elapsed: z.number().nullable(),
        extra: z.number().nullable(),
      }),
      team: z.object({
        id: z.number().nullable(),
        name: z.string().nullable(),
      }),
      player: z
        .object({ id: z.number().nullable(), name: z.string().nullable() })
        .optional(),
      type: z.string(),
      detail: z.string().nullable(),
      comments: z.string().nullable().optional(),
    }),
  ),
});

export const ApiFootballStatisticsResponseSchema = z.object({
  response: z.array(
    z.object({
      team: z.object({ id: z.number().optional(), name: z.string() }),
      statistics: z.array(
        z.object({
          type: z.string(),
          value: z.union([z.number(), z.string(), z.null()]),
        }),
      ),
    }),
  ),
});

export const ApiFootballPlayersResponseSchema = z.object({
  response: z.array(
    z.object({
      players: z.array(
        z.object({
          player: z.object({ id: z.number(), name: z.string() }),
          statistics: z.array(
            z.object({
              games: z
                .object({ minutes: z.number().nullable().optional() })
                .optional(),
              goals: z
                .object({ total: z.number().nullable().optional() })
                .optional(),
              shots: z
                .object({ on: z.number().nullable().optional() })
                .optional(),
            }),
          ),
        }),
      ),
    }),
  ),
});
