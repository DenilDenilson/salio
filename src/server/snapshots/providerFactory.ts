import { getConfig, type AppConfig } from "../config";
import { DemoSportsProvider } from "../providers/demoProvider";
import { EspnSportsProvider } from "../providers/espn/provider";
import { type LiveSportsProvider } from "../providers/types";

export function createSnapshotSportsProvider(input: {
  config?: AppConfig;
  homeTeamName: string;
  awayTeamName: string;
  demoProvider?: boolean;
  evidenceDirectory?: string | null;
}): LiveSportsProvider {
  const config = input.config ?? getConfig();
  if (config.DEMO_MODE || input.demoProvider === true) {
    return new DemoSportsProvider();
  }

  return new EspnSportsProvider({
    baseUrl: config.ESPN_BASE_URL,
    leagueSlug: config.ESPN_LEAGUE_SLUG,
    timeoutMs: config.ESPN_REQUEST_TIMEOUT_MS,
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
    ...(input.evidenceDirectory !== undefined
      ? { evidenceDirectory: input.evidenceDirectory }
      : {}),
  });
}
