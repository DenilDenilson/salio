import { InMemoryCache, UpstashCache, type CacheClient } from "./cache/cache";
import { getConfig, type AppConfig } from "./config";
import { seedDemoData, stakeFixturePath } from "./demo/seed";
import { StakeImporter } from "./importers/stake/importer";
import { ApiFootballProvider } from "./providers/api-football/provider";
import { DemoSportsProvider } from "./providers/demoProvider";
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
    timeoutMs: config.STAKE_IMPORT_TIMEOUT_MS,
    browserWsEndpoint: config.BROWSER_WS_ENDPOINT,
    headless: config.STAKE_IMPORT_HEADLESS,
    fixtureHtmlPath: config.DEMO_MODE ? stakeFixturePath : undefined,
  });
  const provider = config.DEMO_MODE
    ? new DemoSportsProvider()
    : new ApiFootballProvider({
        baseUrl: config.API_FOOTBALL_BASE_URL,
        apiKey: config.API_FOOTBALL_KEY,
      });

  if (config.DEMO_MODE) {
    await seedDemoData(store, config);
  }

  return { config, store, cache, importer, provider };
}
