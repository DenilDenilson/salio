import { describe, expect, it } from "vitest";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";
import { EspnSportsProvider } from "../../src/server/providers/espn/provider";
import { type AppConfig } from "../../src/server/config";
import { createSnapshotSportsProvider } from "../../src/server/snapshots/providerFactory";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    DATABASE_URL: undefined,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    ESPN_BASE_URL: "https://site.api.espn.test/apis/site/v2/sports/soccer",
    ESPN_LEAGUE_SLUG: "fifa.world",
    ESPN_REQUEST_TIMEOUT_MS: 30_000,
    ADMIN_SESSION_SECRET: "test-secret",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD_HASH: "demo",
    PUBLIC_SITE_URL: "http://127.0.0.1:4321",
    ODDS_FREEZE_OFFSET_MINUTES: 3,
    PUBLIC_STATE_POLL_INTERVAL_MS: 10_000,
    EVENTS_REFRESH_INTERVAL_MS: 15_000,
    STATS_REFRESH_INTERVAL_MS: 60_000,
    PLAYER_STATS_REFRESH_INTERVAL_MS: 60_000,
    STAKE_ALLOWED_HOSTS: "stake.pe",
    STAKE_API_ALLOWED_HOSTS: ".websbkt.com",
    STAKE_API_TIMEOUT_MS: 15_000,
    STAKE_SAVE_RAW_RESPONSES: false,
    DEMO_MODE: false,
    stakeAllowedHosts: ["stake.pe"],
    stakeApiAllowedHosts: [".websbkt.com"],
    ...overrides,
  };
}

describe("snapshot provider factory", () => {
  it("creates the ESPN provider without an API key", () => {
    const provider = createSnapshotSportsProvider({
      config: config(),
      homeTeamName: "Canadá",
      awayTeamName: "Bosnia y Herzegovina",
    });

    expect(provider).toBeInstanceOf(EspnSportsProvider);
  });

  it("uses demo provider when DEMO_MODE=true", () => {
    const provider = createSnapshotSportsProvider({
      config: config({ DEMO_MODE: true }),
      homeTeamName: "Canadá",
      awayTeamName: "Bosnia y Herzegovina",
    });

    expect(provider).toBeInstanceOf(DemoSportsProvider);
  });

  it("uses demo provider when --demo-provider is explicit", () => {
    const provider = createSnapshotSportsProvider({
      config: config(),
      homeTeamName: "Canadá",
      awayTeamName: "Bosnia y Herzegovina",
      demoProvider: true,
    });

    expect(provider).toBeInstanceOf(DemoSportsProvider);
  });

  it("creates the ESPN provider when real mode is configured", () => {
    const provider = createSnapshotSportsProvider({
      config: config({
        ESPN_BASE_URL: "https://site.api.espn.test/apis/site/v2/sports/soccer",
      }),
      homeTeamName: "Canadá",
      awayTeamName: "Bosnia y Herzegovina",
    });

    expect(provider).toBeInstanceOf(EspnSportsProvider);
  });
});
