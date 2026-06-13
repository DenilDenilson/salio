import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FixtureStatus } from "../../src/domain/model";
import {
  ApiFootballProvider,
  mapFixtureStatus,
} from "../../src/server/providers/api-football/provider";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "tests/fixtures/api-football", name),
      "utf8",
    ),
  ) as unknown;
}

function mockFetch(payload: unknown, status = 200): void {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(payload), { status }),
  ) as typeof fetch;
}

describe("API-Football provider adapter", () => {
  it("maps fixture, events, team statistics, player statistics and candidates", async () => {
    const provider = new ApiFootballProvider({
      baseUrl: "https://api.example.test",
      apiKey: "test-key",
      homeTeamName: "Estados Unidos",
      awayTeamName: "Paraguay",
    });

    mockFetch(fixture("fixture-live.json"));
    await expect(provider.getFixture(990001)).resolves.toMatchObject({
      fixtureId: 990001,
      status: FixtureStatus.LIVE,
      elapsedMinutes: 67,
      score: { home: 2, away: 1, halftimeHome: 1, halftimeAway: 0 },
    });

    mockFetch(fixture("events-goals-cards.json"));
    await expect(provider.getEvents(990001)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "GOAL",
          teamSide: "HOME",
          minute: 31,
        }),
        expect.objectContaining({
          eventType: "YELLOW_CARD",
          teamSide: "AWAY",
          minute: 70,
        }),
      ]),
    );

    mockFetch(fixture("statistics-corners-shots.json"));
    await expect(provider.getTeamStatistics(990001)).resolves.toEqual({
      yellowCards: { home: 3, away: 2 },
      corners: { home: 6, away: 4 },
      shotsOnTarget: { home: 5, away: 3 },
    });

    mockFetch(fixture("players-shots-on-target.json"));
    await expect(provider.getPlayerStatistics(990001)).resolves.toEqual([
      {
        playerId: "player_10",
        playerName: "Demo Striker",
        goals: 1,
        shotsOnTarget: 2,
        appeared: true,
      },
    ]);

    mockFetch(fixture("fixture-live.json"));
    await expect(
      provider.searchFixtureCandidates({
        homeTeamName: "Estados Unidos",
        awayTeamName: "Paraguay",
        kickoffAt: "2026-06-20T21:00:00.000Z",
        competitionName: "Amistoso internacional",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ fixtureId: 990001, score: expect.any(Number) }),
    ]);
  });

  it("maps provider status variants and failures", async () => {
    expect(mapFixtureStatus("NS")).toBe(FixtureStatus.NOT_STARTED);
    expect(mapFixtureStatus("HT")).toBe(FixtureStatus.HALFTIME);
    expect(mapFixtureStatus("FT")).toBe(FixtureStatus.FINISHED);
    expect(mapFixtureStatus("AET")).toBe(FixtureStatus.AFTER_EXTRA_TIME);
    expect(mapFixtureStatus("PEN")).toBe(FixtureStatus.PENALTIES);
    expect(mapFixtureStatus("PST")).toBe(FixtureStatus.POSTPONED);
    expect(mapFixtureStatus("CANC")).toBe(FixtureStatus.CANCELLED);
    expect(mapFixtureStatus("ABD")).toBe(FixtureStatus.ABANDONED);
    expect(mapFixtureStatus("SUSP")).toBe(FixtureStatus.SUSPENDED);
    expect(mapFixtureStatus("UNKNOWN")).toBe(FixtureStatus.LIVE);

    const provider = new ApiFootballProvider({
      baseUrl: "https://api.example.test",
    });
    await expect(provider.getFixture(1)).rejects.toMatchObject({
      code: "SPORTS_PROVIDER_UNAUTHORIZED",
    });

    const authorized = new ApiFootballProvider({
      baseUrl: "https://api.example.test",
      apiKey: "test",
    });
    mockFetch({ response: [] }, 429);
    await expect(authorized.getFixture(1)).rejects.toMatchObject({
      code: "SPORTS_PROVIDER_RATE_LIMITED",
    });
    mockFetch({ response: [] }, 500);
    await expect(authorized.getFixture(1)).rejects.toMatchObject({
      code: "SPORTS_PROVIDER_TIMEOUT",
    });
    mockFetch({ response: [] });
    await expect(authorized.getFixture(1)).rejects.toMatchObject({
      code: "SPORTS_PROVIDER_INVALID_RESPONSE",
    });
  });
});
