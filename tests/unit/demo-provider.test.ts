import { describe, expect, it } from "vitest";
import { DemoSportsProvider } from "../../src/server/providers/demoProvider";

describe("demo sports provider", () => {
  it("returns the finished Canada vs Bosnia demo state", async () => {
    const provider = new DemoSportsProvider();
    const eventId = "demo-canada-bosnia";
    await expect(provider.getFixture(eventId)).resolves.toMatchObject({
      eventId,
      elapsedMinutes: 90,
      score: { home: 1, away: 1, halftimeHome: 0, halftimeAway: 1 },
    });
    await expect(provider.getEvents(eventId)).resolves.toEqual([
      expect.objectContaining({ teamSide: "AWAY", minute: 21 }),
      expect.objectContaining({ teamSide: "HOME", minute: 79 }),
    ]);
    await expect(provider.getTeamStatistics(eventId)).resolves.toMatchObject({
      corners: { home: 8, away: 3 },
      home: { corners: 8 },
      away: { corners: 3 },
    });
    await expect(provider.getPlayerStatistics(eventId)).resolves.toEqual([
      expect.objectContaining({
        playerName: "Cyle Larin",
        goals: 1,
        appeared: true,
      }),
    ]);
  });
});
