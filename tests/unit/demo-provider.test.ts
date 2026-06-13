import { describe, expect, it } from "vitest";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";

describe("demo sports provider", () => {
  it("returns the finished Canada vs Bosnia demo state", async () => {
    const provider = new DemoSportsProvider();
    await expect(provider.getFixture(990001)).resolves.toMatchObject({
      elapsedMinutes: 90,
      score: { home: 1, away: 1, halftimeHome: 0, halftimeAway: 1 },
    });
    await expect(provider.getEvents(990001)).resolves.toEqual([
      expect.objectContaining({ teamSide: "AWAY", minute: 21 }),
      expect.objectContaining({ teamSide: "HOME", minute: 79 }),
    ]);
    await expect(provider.getTeamStatistics(990001)).resolves.toMatchObject({
      corners: { home: 8, away: 3 },
    });
    await expect(provider.getPlayerStatistics(990001)).resolves.toEqual([
      expect.objectContaining({
        playerName: "Cyle Larin",
        goals: 1,
        appeared: true,
      }),
    ]);
    await expect(
      provider.searchFixtureCandidates({
        homeTeamName: "Canadá",
        awayTeamName: "Bosnia y Herzegovina",
      }),
    ).resolves.toEqual([expect.objectContaining({ fixtureId: 990001 })]);
  });
});
