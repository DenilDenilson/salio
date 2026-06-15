import { InMemoryCache, UpstashCache, type CacheClient } from "./cache/cache";
import { getConfig, type AppConfig } from "./config";
import { seedDemoData } from "./demo/seed";
import { StakeImporter } from "./importers/stake/importer";
import { DemoSportsProvider } from "./providers/demoProvider";
import { EspnSportsProvider } from "./providers/espn/provider";
import { type LiveSportsProvider } from "./providers/types";
import { MemoryAppStore } from "./repositories/memoryStore";
import { type AppStore } from "./repositories/types";

export interface Services {
  config: AppConfig;
  store: AppStore;
  cache: CacheClient;
  importer: StakeImporter;
  provider: LiveSportsProvider;
}

let servicesPromise: Promise<Services> | null = null;

export async function getServices(): Promise<Services> {
  servicesPromise ??= createServices();
  return servicesPromise;
}

export function resetServicesForTests(): void {
  servicesPromise = null;
}

async function createServices(): Promise<Services> {
  const config = getConfig();
  const store = new MemoryAppStore();
  const cache =
    config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN
      ? new UpstashCache(
          config.UPSTASH_REDIS_REST_URL,
          config.UPSTASH_REDIS_REST_TOKEN,
        )
      : new InMemoryCache();
  const importer = new StakeImporter({
    allowedHosts: config.stakeAllowedHosts,
    timeoutMs: config.STAKE_API_TIMEOUT_MS,
    stakeApiAllowedHosts: config.stakeApiAllowedHosts,
    stakeApiTimeoutMs: config.STAKE_API_TIMEOUT_MS,
    stakeApiSaveRawResponses: config.STAKE_SAVE_RAW_RESPONSES,
  });
  const provider = config.DEMO_MODE
    ? new DemoSportsProvider()
    : new EspnSportsProvider({
        baseUrl: config.ESPN_BASE_URL,
        leagueSlug: config.ESPN_LEAGUE_SLUG,
        timeoutMs: config.ESPN_REQUEST_TIMEOUT_MS,
        evidenceDirectory: null,
      });

  if (config.DEMO_MODE) {
    await seedDemoData(store, config);
  }

  return { config, store, cache, importer, provider };
}
