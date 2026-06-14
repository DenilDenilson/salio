import { describe, expect, it } from "vitest";
import { FixtureStatus } from "../../src/domain/model";
import {
  assertNoAmbiguousExtraTimeOrPenalties,
  emptyTeamMatchStatistics,
  mapEspnEventType,
  mapEspnFixtureStatus,
  mapEspnTeamStatistics,
  parseEspnScore,
  parseEspnStatValue,
  readClock,
} from "../../src/server/providers/espn/mappings";

describe("ESPN mapping helpers", () => {
  it("maps known provider statuses and fails closed on unknown statuses", () => {
    expect(
      mapEspnFixtureStatus({ description: "Postponed", shortDetail: "Post" })
        .status,
    ).toBe(FixtureStatus.POSTPONED);
    expect(mapEspnFixtureStatus({ name: "cancelled" }).status).toBe(
      FixtureStatus.CANCELLED,
    );
    expect(mapEspnFixtureStatus({ detail: "abandoned" }).status).toBe(
      FixtureStatus.ABANDONED,
    );
    expect(mapEspnFixtureStatus({ detail: "suspended" }).status).toBe(
      FixtureStatus.SUSPENDED,
    );
    expect(mapEspnFixtureStatus({ detail: "Half Time" }).status).toBe(
      FixtureStatus.HALFTIME,
    );
    expect(mapEspnFixtureStatus({ state: "pre" }).status).toBe(
      FixtureStatus.NOT_STARTED,
    );
    expect(mapEspnFixtureStatus({ state: "in" }).status).toBe(
      FixtureStatus.LIVE,
    );
    expect(mapEspnFixtureStatus({ state: "post" })).toMatchObject({
      status: FixtureStatus.FINISHED,
      elapsedMinutes: 90,
    });
    expect(() => mapEspnFixtureStatus({ name: "mystery" })).toThrow(
      /unknown fixture status/i,
    );
    expect(() => mapEspnFixtureStatus({ detail: "Final PEN" })).toThrow(
      /AET\/PEN/i,
    );
  });

  it("maps supported event types and ignores unsupported play types", () => {
    expect(mapEspnEventType({ type: "yellow-card" })).toBe("YELLOW_CARD");
    expect(mapEspnEventType({ text: "Straight Red Card" })).toBe("RED_CARD");
    expect(mapEspnEventType({ type: "substitution" })).toBe("SUBSTITUTION");
    expect(mapEspnEventType({ type: "own-goal" })).toBe("GOAL");
    expect(mapEspnEventType({ type: "foul" })).toBeNull();
    expect(mapEspnEventType()).toBeNull();
  });

  it("parses scores, stats, team stats and clocks without inventing data", () => {
    expect(parseEspnScore(2)).toBe(2);
    expect(parseEspnScore(" 3 ")).toBe(3);
    expect(parseEspnScore(Number.NaN)).toBeNull();
    expect(parseEspnScore("not-a-score")).toBeNull();
    expect(parseEspnScore(null)).toBeNull();

    expect(parseEspnStatValue({ name: "pct", value: "55%" })).toBe(55);
    expect(
      parseEspnStatValue({
        name: "clearance",
        value: "unknown",
        displayValue: "7",
      }),
    ).toBe(7);
    expect(parseEspnStatValue({ name: "bad", displayValue: "N/A" })).toBeNull();
    expect(parseEspnStatValue(undefined)).toBeNull();

    expect(
      mapEspnTeamStatistics([
        { name: "yellowCards", value: 2 },
        { name: "wonCorners", value: "6" },
        { name: "totalClearance", displayValue: "11" },
      ]),
    ).toMatchObject({
      yellowCards: 2,
      corners: 6,
      clearances: 11,
      shotsOnTarget: null,
    });
    expect(emptyTeamMatchStatistics()).toMatchObject({
      yellowCards: null,
      corners: null,
      shotsOnTarget: null,
    });

    expect(readClock({ displayValue: "45'+2'" })).toEqual({
      minute: 45,
      extraMinute: 2,
      sortSeconds: 2702,
    });
    expect(readClock({ value: 1255 })).toEqual({
      minute: 21,
      sortSeconds: 1255,
    });
    expect(readClock({ displayValue: "HT", value: null })).toEqual({
      sortSeconds: 0,
    });
  });

  it("rejects extra-time or penalty linescores until they are explicitly modeled", () => {
    expect(() =>
      assertNoAmbiguousExtraTimeOrPenalties({
        id: "760419",
        status: { type: {} },
        competitors: [
          { homeAway: "home", linescores: [{}, {}] },
          { homeAway: "away", linescores: [{}, {}] },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      assertNoAmbiguousExtraTimeOrPenalties({
        id: "760419",
        status: { type: {} },
        competitors: [{ homeAway: "home", linescores: [{}, {}, {}] }],
      }),
    ).toThrow(/extra-time|penalty/i);
  });
});
