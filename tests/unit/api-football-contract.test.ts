import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApiFootballErrorSchema,
  ApiFootballEventsResponseSchema,
  ApiFootballFixtureResponseSchema,
  ApiFootballPlayersResponseSchema,
  ApiFootballStatisticsResponseSchema,
} from "../../src/server/providers/api-football/schemas";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "tests/fixtures/api-football", name),
      "utf8",
    ),
  ) as unknown;
}

describe("API-Football contract fixtures", () => {
  it.each([
    "fixture-not-started.json",
    "fixture-live.json",
    "fixture-halftime.json",
    "fixture-finished.json",
  ])("validates fixture %s", (name) => {
    expect(
      ApiFootballFixtureResponseSchema.parse(fixture(name)).response[0]?.fixture
        .id,
    ).toBe(990001);
  });

  it("validates events, statistics, players and provider errors", () => {
    expect(
      ApiFootballEventsResponseSchema.parse(fixture("events-goals-cards.json"))
        .response,
    ).toHaveLength(4);
    expect(
      ApiFootballStatisticsResponseSchema.parse(
        fixture("statistics-corners-shots.json"),
      ).response,
    ).toHaveLength(2);
    expect(
      ApiFootballPlayersResponseSchema.parse(
        fixture("players-shots-on-target.json"),
      ).response[0]?.players,
    ).toHaveLength(1);
    expect(
      ApiFootballErrorSchema.parse(fixture("error-rate-limit.json")).errors,
    ).toBeTruthy();
  });
});
