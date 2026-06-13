import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, afterAll } from "vitest";
import { MarketType, SelectionStatus } from "../../src/domain/model";
import { snapshotPathForSlug } from "../../src/server/snapshots/io";
import { MatchSnapshotSchema } from "../../src/server/snapshots/schema";

const execFileAsync = promisify(execFile);
const slug = `test-snapshot-${Date.now().toString(36)}`;
const snapshotPath = snapshotPathForSlug(slug);

async function runCli(script: string, args: string[], demoMode = true) {
  const tsxBin = join(
    process.cwd(),
    "node_modules/.bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );
  return execFileAsync(tsxBin, [script, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEMO_MODE: demoMode ? "true" : "false",
      API_FOOTBALL_KEY: "",
      STAKE_ALLOWED_HOSTS: "stake.pe",
    },
    timeout: 20_000,
  });
}

async function readTempSnapshot() {
  return MatchSnapshotSchema.parse(
    JSON.parse(await readFile(snapshotPath, "utf8")) as unknown,
  );
}

afterAll(async () => {
  await unlink(snapshotPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
});

describe.sequential("snapshot CLIs", () => {
  it("captures pre-match odds from the Stake fixture in demo mode", async () => {
    const { stdout } = await runCli("scripts/odds-capture.ts", [
      "--slug",
      slug,
      "--stake-url",
      "https://stake.pe/deportes/futbol/world-cup/event-canada-bosnia-demo",
      "--title",
      "Canadá vs Bosnia y Herzegovina",
      "--home",
      "Canadá",
      "--away",
      "Bosnia y Herzegovina",
      "--kickoff",
      "2026-06-12T19:00:00.000Z",
      "--competition",
      "Copa Mundial 2026 · Grupo B",
      "--captured-at",
      "2026-06-12T18:57:00.000Z",
    ]);
    const output = JSON.parse(stdout) as {
      ok: boolean;
      phase: string;
      markets: number;
    };
    const snapshot = await readTempSnapshot();

    expect(output).toMatchObject({
      ok: true,
      phase: "odds_captured",
    });
    expect(output.markets).toBeGreaterThan(0);
    expect(existsSync(snapshotPath)).toBe(true);
    expect(snapshot).toMatchObject({
      slug,
      phase: "odds_captured",
      result: null,
      stake: { eventId: "canada-bosnia-demo" },
    });
    expect(
      snapshot.odds.markets.find(
        (market) => market.marketType === MarketType.TOTAL_GOALS,
      )?.selections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawSelectionName: "Más de 2.5",
          status: SelectionStatus.PENDING,
        }),
      ]),
    );
  });

  it("finds fixture candidates with the explicit demo provider", async () => {
    const { stdout } = await runCli(
      "scripts/fixture-search.ts",
      ["--slug", slug, "--demo-provider"],
      false,
    );
    const output = JSON.parse(stdout) as {
      ok: boolean;
      candidates: Array<{ fixtureId: number }>;
    };

    expect(output.ok).toBe(true);
    expect(output.candidates).toEqual([
      expect.objectContaining({ fixtureId: 990001 }),
    ]);
  });

  it("finalizes and evaluates the temp snapshot in demo mode", async () => {
    const { stdout } = await runCli("scripts/match-finalize.ts", [
      "--slug",
      slug,
      "--fixture-id",
      "990001",
      "--finalized-at",
      "2026-06-13T06:45:00.000Z",
    ]);
    const output = JSON.parse(stdout) as {
      ok: boolean;
      phase: string;
      score: { home: number; away: number };
      counts: Partial<Record<SelectionStatus, number>>;
    };
    const snapshot = await readTempSnapshot();

    expect(output).toMatchObject({
      ok: true,
      phase: "finalized",
      score: { home: 1, away: 1 },
    });
    expect(output.counts.pending ?? 0).toBe(0);
    expect(snapshot.phase).toBe("finalized");
    expect(snapshot.result?.firstScoringTeam).toBe("AWAY");
    expect(
      snapshot.odds.markets.flatMap((market) =>
        market.selections.filter(
          (selection) => selection.status === SelectionStatus.PENDING,
        ),
      ),
    ).toHaveLength(0);
  });
});
