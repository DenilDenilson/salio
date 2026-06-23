import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  ESPN_BASE_URL: z
    .string()
    .url()
    .default("https://site.api.espn.com/apis/site/v2/sports/soccer"),
  ESPN_LEAGUE_SLUG: z.string().min(1).default("fifa.world"),
  ESPN_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  STAKE_ALLOWED_HOSTS: z.string().default("stake.pe"),
  STAKE_API_ALLOWED_HOSTS: z.string().default(".websbkt.com"),
  STAKE_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  STAKE_SAVE_RAW_RESPONSES: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  stakeAllowedHosts: string[];
  stakeApiAllowedHosts: string[];
};

export function getConfig(): AppConfig {
  loadDotenvFiles();
  const parsed = EnvSchema.parse(process.env);
  return {
    ...parsed,
    stakeAllowedHosts: parsed.STAKE_ALLOWED_HOSTS.split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    stakeApiAllowedHosts: parsed.STAKE_API_ALLOWED_HOSTS.split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  };
}

function loadDotenvFiles(): void {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed || process.env[parsed.key] !== undefined) {
        continue;
      }
      process.env[parsed.key] = parsed.value;
    }
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  const rawValue = trimmed.slice(equalsIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  return { key, value: unquoteEnvValue(rawValue) };
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
