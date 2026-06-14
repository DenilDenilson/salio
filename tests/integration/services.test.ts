import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureStatus } from "../../src/domain/model";
import { InMemoryCache } from "../../src/server/cache/cache";
import { getConfig } from "../../src/server/config";
import {
  importStakeHtml,
  StakeImporter,
} from "../../src/server/importers/stake/importer";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";
import type {
  LiveSportsProvider,
  ProviderEvent,
  ProviderFixture,
  ProviderPlayerStats,
  ProviderTeamStats,
  TeamMatchStatistics,
} from "../../src/server/providers/types";
import { MemoryAppStore } from "../../src/server/repositories/memoryStore";
import { refreshMatchIfStale } from "../../src/server/services/refresh";

const stakeUrl =
  "https://stake.pe/deportes/futbol/international/event-21798323";
const demoEventId = "demo-canada-bosnia";

async function readyStore() {
  const store = new MemoryAppStore();
  const config = getConfig();
  const match = await store.createMatch({
    slug: "usa-paraguay",
    title: "Estados Unidos vs Paraguay",
    homeTeamName: "Estados Unidos",
    awayTeamName: "Paraguay",
    competitionName: "Amistoso internacional",
    kickoffAt: "2026-06-20T21:00:00.000Z",
    timezone: "America/Lima",
    stakeUrl,
    oddsFreezeOffsetMinutes: config.ODDS_FREEZE_OFFSET_MINUTES,
  });
  const html = readFileSync(
    join(
      process.cwd(),
      "tests/fixtures/stake/event-21798323-main-markets.html",
    ),
    "utf8",
  );
  const imported = importStakeHtml({
    html,
    url: stakeUrl,
    capturedAt: new Date("2026-06-20T20:57:00.000Z"),
    matchId: match.id,
  });
  await store.saveImportedSnapshot(match.id, imported);
  return { store, config, match };
}

describe("domain services integration", () => {
  it("imports twice without duplicating the visible snapshot selections", async () => {
    const { store, match } = await readyStore();
    const first = await store.getVisibleSnapshot(match.id);
    const html = readFileSync(
      join(
        process.cwd(),
        "tests/fixtures/stake/event-21798323-main-markets.html",
      ),
      "utf8",
    );
    const imported = importStakeHtml({
      html,
      url: stakeUrl,
      capturedAt: new Date("2026-06-20T20:58:00.000Z"),
      matchId: match.id,
    });
    await store.saveImportedSnapshot(match.id, imported);
    const second = await store.getVisibleSnapshot(match.id);

    expect(
      first?.markets.reduce(
        (count, market) => count + market.selections.length,
        0,
      ),
    ).toBe(
      second?.markets.reduce(
        (count, market) => count + market.selections.length,
        0,
      ),
    );
  });

  it("freezing odds prevents overwrite and mapping is required before publishing", async () => {
    const { store, match } = await readyStore();
    await expect(store.publishMatch(match.id)).rejects.toMatchObject({
      code: "FIXTURE_MAPPING_REQUIRED",
    });
    await store.confirmFixture(match.id, demoEventId, "test");
    await store.freezeOdds(
      match.id,
      new Date("2026-06-20T20:57:00.000Z"),
      false,
    );
    await expect(
      store.saveImportedSnapshot(
        match.id,
        importStakeHtml({
          html: readFileSync(
            join(
              process.cwd(),
              "tests/fixtures/stake/event-21798323-main-markets.html",
            ),
            "utf8",
          ),
          url: stakeUrl,
          capturedAt: new Date(),
          matchId: match.id,
        }),
      ),
    ).rejects.toMatchObject({ code: "STAKE_IMPORT_ALREADY_FROZEN" });
    await expect(store.publishMatch(match.id)).resolves.toMatchObject({
      published: true,
    });
  });

  it("refreshes stale live data, persists selections and serves fresh cache without provider calls", async () => {
    const { store, config, match } = await readyStore();
    await store.confirmFixture(match.id, demoEventId, "test");
    await store.freezeOdds(
      match.id,
      new Date("2026-06-20T20:57:00.000Z"),
      false,
    );
    await store.publishMatch(match.id);
    const cache = new InMemoryCache();
    const provider = new DemoSportsProvider();

    const first = await refreshMatchIfStale({
      slug: match.slug,
      store,
      cache,
      provider,
      force: true,
      options: {
        pollMs: config.PUBLIC_STATE_POLL_INTERVAL_MS,
        eventsRefreshMs: config.EVENTS_REFRESH_INTERVAL_MS,
        statsRefreshMs: config.STATS_REFRESH_INTERVAL_MS,
        playerStatsRefreshMs: config.PLAYER_STATS_REFRESH_INTERVAL_MS,
      },
    });
    const fixtureCalls = provider.callCounts.fixture;
    const second = await refreshMatchIfStale({
      slug: match.slug,
      store,
      cache,
      provider,
      options: {
        pollMs: config.PUBLIC_STATE_POLL_INTERVAL_MS,
        eventsRefreshMs: config.EVENTS_REFRESH_INTERVAL_MS,
        statsRefreshMs: config.STATS_REFRESH_INTERVAL_MS,
        playerStatsRefreshMs: config.PLAYER_STATS_REFRESH_INTERVAL_MS,
      },
    });

    expect(first.match.status).toBe(FixtureStatus.FINISHED);
    expect(second.lastUpdatedAt).toBe(first.lastUpdatedAt);
    expect(provider.callCounts.fixture).toBe(fixtureCalls);
  });

  it("returns cached stale state under concurrent refresh pressure", async () => {
    const { store, config, match } = await readyStore();
    await store.confirmFixture(match.id, demoEventId, "test");
    await store.freezeOdds(
      match.id,
      new Date("2026-06-20T20:57:00.000Z"),
      false,
    );
    await store.publishMatch(match.id);
    const cache = new InMemoryCache();
    const provider = new DemoSportsProvider();
    const options = {
      pollMs: config.PUBLIC_STATE_POLL_INTERVAL_MS,
      eventsRefreshMs: 1,
      statsRefreshMs: 1,
      playerStatsRefreshMs: 1,
    };
    await refreshMatchIfStale({
      slug: match.slug,
      store,
      cache,
      provider,
      force: true,
      options,
    });
    const live = await store.getLiveState(match.id);
    if (live) {
      await store.saveLiveState({
        ...live,
        fixtureLastRefreshAt: new Date(Date.now() - 10_000).toISOString(),
        statsLastRefreshAt: new Date(Date.now() - 10_000).toISOString(),
        playersLastRefreshAt: new Date(Date.now() - 10_000).toISOString(),
      });
    }
    const before = provider.callCounts.fixture;
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        refreshMatchIfStale({
          slug: match.slug,
          store,
          cache,
          provider,
          options,
        }).catch((error: unknown) => error),
      ),
    );
    expect(results.filter((result) => !(result instanceof Error))).toHaveLength(
      20,
    );
    expect(provider.callCounts.fixture - before).toBeLessThanOrEqual(1);
  });

  it("validates Stake allowlist in importer", async () => {
    const importer = new StakeImporter({
      allowedHosts: ["stake.pe"],
      timeoutMs: 1000,
    });
    await expect(
      importer.importEvent({
        url: "http://stake.pe/event",
        capturedAt: new Date(),
        matchId: "m",
      }),
    ).rejects.toMatchObject({
      code: "STAKE_INVALID_URL",
    });
  });

  it("guards unpublished, unmapped and unsnapshotted matches", async () => {
    const store = new MemoryAppStore();
    const config = getConfig();
    const match = await store.createMatch({
      slug: "guarded",
      title: "Guarded",
      homeTeamName: "A",
      awayTeamName: "B",
      competitionName: null,
      kickoffAt: "2026-06-20T21:00:00.000Z",
      timezone: "America/Lima",
      stakeUrl,
      oddsFreezeOffsetMinutes: 3,
    });
    const cache = new InMemoryCache();
    const provider = new DemoSportsProvider();
    const options = {
      pollMs: config.PUBLIC_STATE_POLL_INTERVAL_MS,
      eventsRefreshMs: config.EVENTS_REFRESH_INTERVAL_MS,
      statsRefreshMs: config.STATS_REFRESH_INTERVAL_MS,
      playerStatsRefreshMs: config.PLAYER_STATS_REFRESH_INTERVAL_MS,
    };

    await expect(
      refreshMatchIfStale({
        slug: match.slug,
        store,
        cache,
        provider,
        options,
      }),
    ).rejects.toMatchObject({ code: "MATCH_NOT_PUBLISHED" });
    await store.confirmFixture(match.id, demoEventId, "test");
    await expect(store.publishMatch(match.id)).rejects.toBeTruthy();
  });

  it("keeps cached state when provider fails and stops polling final matches", async () => {
    const { store, config, match } = await readyStore();
    await store.confirmFixture(match.id, demoEventId, "test");
    await store.freezeOdds(
      match.id,
      new Date("2026-06-20T20:57:00.000Z"),
      false,
    );
    await store.publishMatch(match.id);
    const cache = new InMemoryCache();
    const provider = new DemoSportsProvider();
    const options = {
      pollMs: config.PUBLIC_STATE_POLL_INTERVAL_MS,
      eventsRefreshMs: 1,
      statsRefreshMs: 1,
      playerStatsRefreshMs: 1,
    };
    const first = await refreshMatchIfStale({
      slug: match.slug,
      store,
      cache,
      provider,
      force: true,
      options,
    });
    const live = await store.getLiveState(match.id);
    if (live) {
      await store.saveLiveState({
        ...live,
        fixtureStatus: FixtureStatus.FINISHED,
        context: { ...live.context, fixtureStatus: FixtureStatus.FINISHED },
      });
    }
    await expect(
      refreshMatchIfStale({
        slug: match.slug,
        store,
        cache,
        provider: new FailingProvider(),
        options,
      }),
    ).resolves.toMatchObject({ lastUpdatedAt: first.lastUpdatedAt });

    if (live) {
      await store.saveLiveState({
        ...live,
        fixtureStatus: FixtureStatus.LIVE,
        context: { ...live.context, fixtureStatus: FixtureStatus.LIVE },
        fixtureLastRefreshAt: new Date(Date.now() - 10_000).toISOString(),
      });
    }
    await expect(
      refreshMatchIfStale({
        slug: match.slug,
        store,
        cache,
        provider: new FailingProvider(),
        options,
      }),
    ).resolves.toMatchObject({
      stale: true,
      errors: expect.arrayContaining(["STALE_DATA_RETURNED"]),
    });
  });
});

class FailingProvider implements LiveSportsProvider {
  async getFixture(): Promise<ProviderFixture> {
    throw new Error("temporary provider failure");
  }

  async getEvents(): Promise<ProviderEvent[]> {
    return [];
  }

  async getTeamStatistics(): Promise<ProviderTeamStats> {
    const empty = emptyTeamStats();
    return {
      home: empty,
      away: empty,
      yellowCards: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
    };
  }

  async getPlayerStatistics(): Promise<ProviderPlayerStats[]> {
    return [];
  }
}

function emptyTeamStats(): TeamMatchStatistics {
  return {
    fouls: null,
    yellowCards: null,
    redCards: null,
    offsides: null,
    corners: null,
    saves: null,
    possessionPercent: null,
    totalShots: null,
    shotsOnTarget: null,
    blockedShots: null,
    accuratePasses: null,
    totalPasses: null,
    accurateCrosses: null,
    totalCrosses: null,
    totalLongBalls: null,
    accurateLongBalls: null,
    tacklesWon: null,
    totalTackles: null,
    interceptions: null,
    clearances: null,
  };
}
