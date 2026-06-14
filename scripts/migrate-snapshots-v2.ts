import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  MatchSnapshotSchema,
  type MatchSnapshot,
} from "../src/server/snapshots/schema";
import { type TeamMatchStatistics } from "../src/server/providers/types";

const matchesDirectory = resolve(process.cwd(), "src/content/matches");

const emptyStats: TeamMatchStatistics = {
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

const files = (await readdir(matchesDirectory)).filter((file) =>
  file.endsWith(".json"),
);

const migrated: string[] = [];
for (const file of files) {
  const path = join(matchesDirectory, file);
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const snapshot = migrateSnapshot(raw);
  await writeJsonAtomically(path, snapshot);
  migrated.push(file);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      schemaVersion: "2.0",
      migrated,
    },
    null,
    2,
  ),
);

export function migrateSnapshot(raw: unknown): MatchSnapshot {
  const source = object(raw, "snapshot");
  if (source.schemaVersion === "2.0") {
    return MatchSnapshotSchema.parse(source);
  }
  if (source.schemaVersion !== "1.0") {
    throw new Error(
      `Unsupported snapshot schemaVersion ${source.schemaVersion}`,
    );
  }

  const apiFootball = object(source.apiFootball, "apiFootball");
  const fixtureId =
    typeof apiFootball.fixtureId === "number" ? apiFootball.fixtureId : null;
  const sportsData =
    fixtureId === 990001
      ? {
          provider: "demo" as const,
          eventId: "demo-canada-bosnia",
          leagueSlug: "fifa.world",
          sourceUrl: "demo://canada-vs-bosnia",
        }
      : {
          provider: "espn" as const,
          eventId: null,
          leagueSlug: null,
          sourceUrl: null,
        };

  return MatchSnapshotSchema.parse({
    ...source,
    schemaVersion: "2.0",
    sportsData,
    result: migrateResult(source.result, sportsData),
    apiFootball: undefined,
  });
}

function migrateResult(
  result: unknown,
  sportsData: {
    provider: "espn" | "demo";
    eventId: string | null;
    sourceUrl: string | null;
  },
): unknown {
  if (result === null) {
    return null;
  }
  const value = object(result, "result");
  const yellowCards = sidePair(value.yellowCards);
  const corners = sidePair(value.corners);
  return {
    ...value,
    evidence:
      sportsData.eventId && sportsData.sourceUrl
        ? {
            provider: sportsData.provider,
            eventId: sportsData.eventId,
            sourceUrl: sportsData.sourceUrl,
            fetchedAt: string(value.lastUpdatedAt) ?? new Date(0).toISOString(),
            payloadSha256:
              sportsData.provider === "demo"
                ? "0000000000000000000000000000000000000000000000000000000000000000"
                : "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            rawArtifactPath: null,
          }
        : null,
    yellowCards,
    corners,
    teamStatistics: {
      home: {
        ...emptyStats,
        yellowCards: yellowCards.home,
        corners: corners.home,
      },
      away: {
        ...emptyStats,
        yellowCards: yellowCards.away,
        corners: corners.away,
      },
    },
    events: array(value.events).map((event) => ({
      ...object(event, "event"),
      originalType: string(object(event, "event").originalType),
      period: numberOrNull(object(event, "event").period),
      text: string(object(event, "event").text),
    })),
    playerStats: Object.fromEntries(
      Object.entries(object(value.playerStats ?? {}, "playerStats")).map(
        ([playerId, stats]) => {
          const player = object(stats, "playerStats entry");
          return [
            playerId,
            {
              playerName: string(player.playerName) ?? playerId,
              teamSide:
                player.teamSide === "HOME" || player.teamSide === "AWAY"
                  ? player.teamSide
                  : null,
              starter: boolean(player.starter),
              substitute: boolean(player.substitute),
              minutes: numberOrNull(player.minutes),
              goals: numberOrNull(player.goals),
              shots: numberOrNull(player.shots),
              shotsOnTarget: numberOrNull(player.shotsOnTarget),
              yellowCards: numberOrNull(player.yellowCards),
              redCards: numberOrNull(player.redCards),
              assists: numberOrNull(player.assists),
              appeared: boolean(player.appeared),
            },
          ];
        },
      ),
    ),
  };
}

async function writeJsonAtomically(
  path: string,
  snapshot: MatchSnapshot,
): Promise<void> {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    MatchSnapshotSchema.parse(JSON.parse(await readFile(tempPath, "utf8")));
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sidePair(value: unknown): {
  home: number | null;
  away: number | null;
} {
  const pair = object(value ?? {}, "side pair");
  return {
    home: numberOrNull(pair.home),
    away: numberOrNull(pair.away),
  };
}
