import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FixtureStatus } from "../../src/domain/model";
import type { ProviderFixture } from "../../src/server/providers/types";
import {
  assertFixtureIsFinalizable,
  assertRemoteFixtureMatchesSnapshot,
} from "../../src/server/snapshots/fixtureValidation";
import {
  MatchSnapshotSchema,
  type MatchSnapshot,
} from "../../src/server/snapshots/schema";

function snapshot(name = "brasil-vs-marruecos"): MatchSnapshot {
  return MatchSnapshotSchema.parse(
    JSON.parse(
      readFileSync(
        join(process.cwd(), "src/content/matches", `${name}.json`),
        "utf8",
      ),
    ) as unknown,
  );
}

function providerFixture(
  overrides: Partial<ProviderFixture> = {},
): ProviderFixture {
  return {
    eventId: "760419",
    sourceUrl:
      "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=760419",
    status: FixtureStatus.FINISHED,
    providerStatus: "FT",
    elapsedMinutes: 90,
    homeTeamId: "205",
    awayTeamId: "2869",
    homeTeamName: "Brazil",
    awayTeamName: "Morocco",
    competitionName: "FIFA World Cup",
    leagueSlug: "fifa.world",
    score: {
      home: 2,
      away: 1,
      halftimeHome: 1,
      halftimeAway: 0,
    },
    kickoffAt: "2026-06-13T22:00:00.000Z",
    lastUpdatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("match:finalize safety validation", () => {
  it("rejects wrong teams before any write and preserves frozen odds exactly", () => {
    const current = snapshot();
    const originalOdds = structuredClone(current.odds);
    const writeSnapshot = vi.fn();

    expect(() =>
      assertRemoteFixtureMatchesSnapshot(
        current,
        providerFixture({
          eventId: "760420",
          homeTeamName: "A. Italiano",
          awayTeamName: "D. La Serena",
          competitionName: "Primera Division",
          leagueSlug: "chi.1",
        }),
        "760420",
      ),
    ).toThrow(/no corresponde al snapshot brasil-vs-marruecos/i);

    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(current.odds).toEqual(originalOdds);
  });

  it.each([
    ["wrong league", { leagueSlug: "chi.1" }],
    ["wrong kickoff", { kickoffAt: "2026-06-14T04:30:00.000Z" }],
    ["wrong orientation", { homeTeamName: "Morocco", awayTeamName: "Brazil" }],
  ])("rejects %s before any write", (_caseName, overrides) => {
    const current = snapshot();
    const writeSnapshot = vi.fn();

    expect(() =>
      assertRemoteFixtureMatchesSnapshot(
        current,
        providerFixture(overrides),
        "760419",
      ),
    ).toThrow(/No se modifico el snapshot/i);
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it.each(["NS", "1H", "2H"] as const)(
    "rejects non-final provider status %s before any write",
    (providerStatus) => {
      const writeSnapshot = vi.fn();

      expect(() =>
        assertFixtureIsFinalizable(
          providerFixture({
            status:
              providerStatus === "NS"
                ? FixtureStatus.NOT_STARTED
                : FixtureStatus.LIVE,
            providerStatus,
          }),
        ),
      ).toThrow(/todavia no esta finalizado/i);
      expect(writeSnapshot).not.toHaveBeenCalled();
    },
  );

  it("accepts only regulation full-time provider status", () => {
    expect(() =>
      assertFixtureIsFinalizable(
        providerFixture({
          providerStatus: "FT",
          status: FixtureStatus.FINISHED,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertFixtureIsFinalizable(
        providerFixture({
          providerStatus: "AET",
          status: FixtureStatus.AFTER_EXTRA_TIME,
        }),
      ),
    ).toThrow(/todavia no esta finalizado/i);
    expect(() =>
      assertFixtureIsFinalizable(
        providerFixture({
          providerStatus: "PEN",
          status: FixtureStatus.PENALTIES,
        }),
      ),
    ).toThrow(/todavia no esta finalizado/i);
  });
});
