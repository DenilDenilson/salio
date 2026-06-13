import { getConfig, type AppConfig } from "../config";
import { ApiFootballProvider } from "../providers/api-football/provider";
import { DemoSportsProvider } from "../providers/demoProvider";
import { type LiveSportsProvider } from "../providers/types";

export function createSnapshotSportsProvider(input: {
  config?: AppConfig;
  homeTeamName: string;
  awayTeamName: string;
  demoProvider?: boolean;
}): LiveSportsProvider {
  const config = input.config ?? getConfig();
  if (config.DEMO_MODE || input.demoProvider === true) {
    return new DemoSportsProvider();
  }

  if (!config.API_FOOTBALL_KEY) {
    throw new Error(
      "Missing API_FOOTBALL_KEY. Set API_FOOTBALL_KEY for real API-Football calls, or explicitly use DEMO_MODE=true / --demo-provider for fixture-backed demo data.",
    );
  }

  return new ApiFootballProvider({
    baseUrl: config.API_FOOTBALL_BASE_URL,
    apiKey: config.API_FOOTBALL_KEY,
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
  });
}
