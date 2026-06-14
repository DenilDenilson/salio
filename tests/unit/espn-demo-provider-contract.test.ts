import { describe, expect, it } from "vitest";
import { FixtureStatus } from "../../src/domain/model";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";

const demoSourceUrl = "demo://canada-vs-bosnia";

describe("demo sports provider ESPN-era contract", () => {
  it("returns fixture, stats and players on the new sports data contract", async () => {
    const provider = new DemoSportsProvider();
    const eventId = "demo-canada-bosnia" as never;
    const [fixture, events, teamStats, playerStats] = await Promise.all([
      provider.getFixture(eventId),
      provider.getEvents(eventId),
      provider.getTeamStatistics(eventId),
      provider.getPlayerStatistics(eventId),
    ]);

    expect(fixture).toMatchObject({
      eventId: "demo-canada-bosnia",
      sourceUrl: demoSourceUrl,
      status: FixtureStatus.FINISHED,
      providerStatus: "FT",
      homeTeamName: "Canadá",
      awayTeamName: "Bosnia y Herzegovina",
      leagueSlug: "fifa.world",
      score: { home: 1, away: 1, halftimeHome: 0, halftimeAway: 1 },
    });
    expect(fixture.evidence).toMatchObject({
      provider: "demo",
      eventId: "demo-canada-bosnia",
      sourceUrl: demoSourceUrl,
      rawArtifactPath: null,
    });
    expect(fixture.evidence?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(events).toEqual([
      expect.objectContaining({
        providerEventId: "goal-bosnia-lukic-21",
        originalType: "demo-goal",
        eventType: "GOAL",
        teamSide: "AWAY",
        period: 1,
        minute: 21,
      }),
      expect.objectContaining({
        providerEventId: "goal-canada-larin-79",
        originalType: "demo-goal",
        eventType: "GOAL",
        teamSide: "HOME",
        period: 2,
        minute: 79,
      }),
    ]);
    expect(teamStats).toMatchObject({
      yellowCards: { home: 2, away: 1 },
      corners: { home: 8, away: 3 },
      shotsOnTarget: { home: 5, away: 2 },
      home: { yellowCards: 2, corners: 8, shotsOnTarget: 5 },
      away: { yellowCards: 1, corners: 3, shotsOnTarget: 2 },
    });
    expect(playerStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: "player_cyle-larin",
          playerName: "Cyle Larin",
          teamSide: "HOME",
          starter: true,
          substitute: false,
          minutes: null,
          goals: 1,
          shots: null,
          shotsOnTarget: 1,
          yellowCards: 0,
          redCards: 0,
          assists: null,
          appeared: true,
        }),
      ]),
    );
  });
});
