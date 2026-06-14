import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EspnSummarySchema } from "../../src/server/providers/espn/schemas";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/espn", name), "utf8"),
  ) as unknown;
}

describe("ESPN summary contract fixtures", () => {
  it("validates the 760419 Brazil vs Morocco summary payload", () => {
    const parsed = EspnSummarySchema.parse(fixture("summary-760419.json"));
    const competition = parsed.header.competitions[0];

    expect(competition?.id).toBe("760419");
    expect(parsed.header.league.slug).toBe("fifa.world");
    expect(parsed.header.season.year).toBe(2026);
    expect(competition?.date).toBe("2026-06-13T22:00Z");
    expect(competition?.status.type).toMatchObject({
      name: "STATUS_FULL_TIME",
      completed: true,
      detail: "FT",
      shortDetail: "FT",
    });
    expect(competition?.competitors).toEqual([
      expect.objectContaining({
        homeAway: "home",
        score: "1",
        team: expect.objectContaining({ id: "205", displayName: "Brazil" }),
      }),
      expect.objectContaining({
        homeAway: "away",
        score: "1",
        team: expect.objectContaining({ id: "2869", displayName: "Morocco" }),
      }),
    ]);
    expect(parsed.boxscore.teams).toHaveLength(2);
    expect(parsed.keyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "49497769",
          type: expect.objectContaining({ type: "goal" }),
          scoringPlay: true,
        }),
        expect.objectContaining({
          id: "49497900",
          type: expect.objectContaining({ type: "goal" }),
          scoringPlay: true,
        }),
      ]),
    );
    expect(parsed.rosters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          homeAway: "home",
          roster: expect.arrayContaining([
            expect.objectContaining({
              athlete: expect.objectContaining({
                id: "252107",
                displayName: "Vinícius Júnior",
              }),
            }),
          ]),
        }),
      ]),
    );
  });
});
