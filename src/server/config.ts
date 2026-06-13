import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  API_FOOTBALL_BASE_URL: z
    .string()
    .url()
    .default("https://v3.football.api-sports.io"),
  API_FOOTBALL_KEY: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().default("dev-session-secret"),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD_HASH: z.string().default("demo"),
  PUBLIC_SITE_URL: z.string().url().default("http://localhost:4321"),
  ODDS_FREEZE_OFFSET_MINUTES: z.coerce.number().int().positive().default(3),
  PUBLIC_STATE_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
  EVENTS_REFRESH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_000),
  STATS_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  PLAYER_STATS_REFRESH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  STAKE_ALLOWED_HOSTS: z.string().default("stake.pe"),
  STAKE_IMPORT_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  BROWSER_WS_ENDPOINT: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  stakeAllowedHosts: string[];
};

export function getConfig(): AppConfig {
  const parsed = EnvSchema.parse(process.env);
  return {
    ...parsed,
    stakeAllowedHosts: parsed.STAKE_ALLOWED_HOSTS.split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  };
}
