import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FixtureStatus } from "../../src/domain/model";
import { mapEspnFixtureStatus } from "../../src/server/providers/espn/mappings";
import { EspnSportsProvider } from "../../src/server/providers/espn/provider";

const originalFetch = globalThis.fetch;
const summaryUrl =
  "https://site.api.espn.test/apis/site/v2/sports/soccer/fifa.world/summary";

interface EspnStat {
  name: string;
  value?: number;
  displayValue?: string;
}

interface EspnTeamBoxscore {
  homeAway: "home" | "away";
  statistics: EspnStat[];
}

interface EspnRosterEntry {
  athlete: { id?: string; displayName?: string };
  stats: EspnStat[];
}

interface EspnRoster {
  homeAway: "home" | "away";
  roster: EspnRosterEntry[];
}

interface EspnPlay {
  id: string;
  type: { type: string; text?: string };
  scoringPlay?: boolean;
  team?: { id?: string; displayName?: string };
  clock?: { value?: number; displayValue?: string };
  period?: { number?: number };
  participants?: Array<{
    athlete?: { id?: string; displayName?: string };
  }>;
}

interface EspnSummaryFixture {
  header: {
    id: string;
    competitions: Array<{
      id: string;
      date: string;
      status: {
        type: {
          name: string;
          completed: boolean;
          detail?: string;
          shortDetail?: string;
        };
      };
    }>;
  };
  boxscore: { teams: EspnTeamBoxscore[] };
  rosters: EspnRoster[];
  keyEvents: EspnPlay[];
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function fixture(name = "summary-760419.json"): EspnSummaryFixture {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/espn", name), "utf8"),
  ) as EspnSummaryFixture;
}

function provider(): EspnSportsProvider {
  return new EspnSportsProvider({
    baseUrl: summaryUrl,
    evidenceDirectory: null,
  });
}

function mockFetch(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(payload), { status }),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function removeTeamStat(payload: EspnSummaryFixture, statName: string): void {
  for (const team of payload.boxscore.teams) {
    team.statistics = team.statistics.filter((stat) => stat.name !== statName);
  }
}

function removePlayerStat(
  payload: EspnSummaryFixture,
  playerId: string,
  statName: string,
): void {
  for (const roster of payload.rosters) {
    for (const player of roster.roster) {
      if (player.athlete.id === playerId) {
        player.stats = player.stats.filter((stat) => stat.name !== statName);
      }
    }
  }
}

function goals(payload: EspnSummaryFixture): EspnPlay[] {
  return payload.keyEvents.filter((event) => event.type.type === "goal");
}

function rawEventId(providerEventId: string): string {
  return providerEventId.split(":").pop() ?? providerEventId;
}

describe("ESPN summary provider adapter", () => {
  it("maps fixture, homeAway orientation, stats, events and players from 760419", async () => {
    const payload = fixture();
    payload.boxscore.teams.reverse();
    payload.rosters.reverse();
    const fetchMock = mockFetch(payload);
    const adapter = provider();

    const [remoteFixture, events, teamStats, playerStats] = await Promise.all([
      adapter.getFixture("760419"),
      adapter.getEvents("760419"),
      adapter.getTeamStatistics("760419"),
      adapter.getPlayerStatistics("760419"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe(
      "/apis/site/v2/sports/soccer/fifa.world/summary",
    );
    expect(requestedUrl.searchParams.get("event")).toBe("760419");
    expect(remoteFixture).toMatchObject({
      eventId: "760419",
      sourceUrl: expect.stringContaining("event=760419"),
      status: FixtureStatus.FINISHED,
      providerStatus: "FT",
      elapsedMinutes: 90,
      homeTeamId: "205",
      awayTeamId: "2869",
      homeTeamName: "Brazil",
      awayTeamName: "Morocco",
      competitionName: "FIFA World Cup",
      leagueSlug: "fifa.world",
      score: { home: 1, away: 1, halftimeHome: 1, halftimeAway: 1 },
      kickoffAt: "2026-06-13T22:00:00.000Z",
    });
    expect(remoteFixture.evidence).toMatchObject({
      provider: "espn",
      eventId: "760419",
      sourceUrl: expect.stringContaining("event=760419"),
      rawArtifactPath: null,
    });
    expect(remoteFixture.evidence?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(teamStats).toMatchObject({
      yellowCards: { home: 2, away: 0 },
      corners: { home: 6, away: 2 },
      shotsOnTarget: { home: 5, away: 3 },
      home: {
        yellowCards: 2,
        corners: 6,
        shotsOnTarget: 5,
        totalShots: 12,
      },
      away: {
        yellowCards: 0,
        corners: 2,
        shotsOnTarget: 3,
        totalShots: 14,
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerEventId: expect.stringMatching(/(?:^|:)49497769$/),
          eventType: "GOAL",
          originalType: "goal",
          teamSide: "AWAY",
          playerProviderId: "304572",
          playerName: "Ismael Saibari",
          period: 1,
          minute: 21,
          isCancelled: false,
        }),
        expect.objectContaining({
          providerEventId: expect.stringMatching(/(?:^|:)49497900$/),
          eventType: "GOAL",
          originalType: "goal",
          teamSide: "HOME",
          playerProviderId: "252107",
          playerName: "Vinícius Júnior",
          period: 1,
          minute: 32,
          isCancelled: false,
        }),
        expect.objectContaining({
          eventType: "YELLOW_CARD",
          teamSide: "HOME",
          playerName: "Casemiro",
          minute: 37,
        }),
      ]),
    );
    expect(
      events
        .filter((event) => event.eventType === "GOAL")
        .map((event) => ({
          id: rawEventId(event.providerEventId),
          teamSide: event.teamSide,
        })),
    ).toEqual([
      { id: "49497769", teamSide: "AWAY" },
      { id: "49497900", teamSide: "HOME" },
    ]);
    expect(playerStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: expect.stringMatching(/^player_(252107|vinicius-junior)$/),
          playerName: "Vinícius Júnior",
          teamSide: "HOME",
          starter: true,
          substitute: false,
          goals: 1,
          shots: 1,
          shotsOnTarget: 1,
          appeared: true,
        }),
        expect.objectContaining({
          playerId: expect.stringMatching(/^player_(304572|ismael-saibari)$/),
          playerName: "Ismael Saibari",
          teamSide: "AWAY",
          goals: 1,
          shots: 3,
          shotsOnTarget: 1,
          appeared: true,
        }),
        expect.objectContaining({
          playerId: expect.stringMatching(/^player_(357719|rayan)$/),
          playerName: "Rayan",
          teamSide: "HOME",
          starter: false,
          substitute: false,
          goals: 0,
          shotsOnTarget: 0,
          appeared: false,
        }),
      ]),
    );
  });

  it("sorts and deduplicates supported events by provider id and clock", async () => {
    const payload = fixture();
    const [moroccoGoal, brazilGoal] = goals(payload);
    if (!moroccoGoal || !brazilGoal) {
      throw new Error("760419 fixture must include Morocco and Brazil goals.");
    }
    payload.keyEvents = [
      brazilGoal,
      moroccoGoal,
      moroccoGoal,
      ...payload.keyEvents.filter((event) => event.type.type === "yellow-card"),
    ];
    mockFetch(payload);

    const events = await provider().getEvents("760419");

    expect(
      events.map((event) => rawEventId(event.providerEventId)).slice(0, 4),
    ).toEqual(["49497769", "49497900", "49497971", "49498187"]);
    expect(
      events.filter(
        (event) => rawEventId(event.providerEventId) === "49497769",
      ),
    ).toHaveLength(1);
  });

  it("returns null for absent ESPN stats instead of inventing zero", async () => {
    const payload = fixture();
    removeTeamStat(payload, "wonCorners");
    removeTeamStat(payload, "yellowCards");
    removePlayerStat(payload, "252107", "shotsOnTarget");
    mockFetch(payload);

    const adapter = provider();
    await expect(adapter.getTeamStatistics("760419")).resolves.toMatchObject({
      corners: { home: null, away: null },
      yellowCards: { home: null, away: null },
      shotsOnTarget: { home: 5, away: 3 },
    });
    await expect(adapter.getPlayerStatistics("760419")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: expect.stringMatching(/^player_(252107|vinicius-junior)$/),
          playerName: "Vinícius Júnior",
          shotsOnTarget: null,
          appeared: true,
        }),
      ]),
    );
  });

  it("rejects a summary whose event id differs from the requested event", async () => {
    const payload = fixture();
    const competition = payload.header.competitions[0];
    if (!competition) {
      throw new Error("760419 fixture must include one competition.");
    }
    payload.header.id = "760420";
    competition.id = "760420";
    mockFetch(payload);

    await expect(provider().getFixture("760419")).rejects.toMatchObject({
      code: expect.stringMatching(
        /^SPORTS_(PROVIDER_INVALID_RESPONSE|FIXTURE_MISMATCH)$/,
      ),
      message: expect.stringMatching(/event id/i),
    });
  });

  it("maps ESPN statuses and fails closed on ambiguous AET/PEN details", () => {
    expect(
      mapEspnFixtureStatus({
        name: "STATUS_FULL_TIME",
        completed: true,
        detail: "FT",
        shortDetail: "FT",
      }).status,
    ).toBe(FixtureStatus.FINISHED);
    expect(
      mapEspnFixtureStatus({
        name: "STATUS_IN_PROGRESS",
        state: "in",
        completed: false,
        detail: "55'",
        shortDetail: "55'",
      }).status,
    ).toBe(FixtureStatus.LIVE);
    expect(() =>
      mapEspnFixtureStatus({
        name: "STATUS_FINAL_AET",
        completed: true,
        detail: "AET",
        shortDetail: "AET",
      }),
    ).toThrow(/AET\/PEN|extra-time|penalt/i);
    expect(() =>
      mapEspnFixtureStatus({
        name: "STATUS_FINAL_PEN",
        completed: true,
        detail: "PEN",
        shortDetail: "PEN",
      }),
    ).toThrow(/AET\/PEN|extra-time|penalt/i);
  });
});
