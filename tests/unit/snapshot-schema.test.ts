import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { SelectionStatus } from "../../src/domain/model";
import {
  MatchSnapshotSchema,
  type MatchSnapshot,
} from "../../src/server/snapshots/schema";

const matchesDirectory = join(process.cwd(), "src/content/matches");
const demoSnapshotPath = join(matchesDirectory, "canada-vs-bosnia.json");

function readSnapshot(path = demoSnapshotPath): MatchSnapshot {
  return MatchSnapshotSchema.parse(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
  );
}

function cloneSnapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    ...structuredClone(readSnapshot()),
    ...overrides,
  };
}

describe("match snapshot schema", () => {
  it("parses the Canada vs Bosnia demo JSON", () => {
    const snapshot = readSnapshot();

    expect(snapshot.slug).toBe("canada-vs-bosnia");
    expect(snapshot.phase).toBe("finalized");
    expect(snapshot.result?.score).toEqual(
      expect.objectContaining({ home: 1, away: 1 }),
    );
  });

  it("requires odds-captured snapshots to keep result null", () => {
    const invalid = cloneSnapshot({ phase: "odds_captured" });

    const result = MatchSnapshotSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["result"],
          message: "Odds-captured snapshots must not include a result.",
        }),
      ]),
    );

    expect(
      MatchSnapshotSchema.safeParse(
        cloneSnapshot({
          phase: "odds_captured",
          result: null,
          metadata: {
            ...invalid.metadata,
            finalizedAt: null,
            lastEvaluatedAt: null,
          },
        }),
      ).success,
    ).toBe(true);
  });

  it("requires finalized snapshots to include result, finalizedAt and no pending selections", () => {
    const missingResult = cloneSnapshot({ result: null });
    const missingFinalizedAt = cloneSnapshot({
      metadata: { ...readSnapshot().metadata, finalizedAt: null },
    });
    const pendingSelection = cloneSnapshot();
    pendingSelection.odds.markets[0].selections[0].status =
      SelectionStatus.PENDING;

    expect(MatchSnapshotSchema.safeParse(missingResult).error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["result"],
          message: "Finalized snapshots require a result.",
        }),
      ]),
    );
    expect(
      MatchSnapshotSchema.safeParse(missingFinalizedAt).error?.issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["metadata", "finalizedAt"],
          message: "Finalized snapshots require finalizedAt.",
        }),
      ]),
    );
    expect(
      MatchSnapshotSchema.safeParse(pendingSelection).error?.issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["odds", "markets"],
          message: "Finalized snapshots cannot keep pending selections.",
        }),
      ]),
    );
  });

  it("keeps content slugs aligned with src/content/matches file names", () => {
    const files = readdirSync(matchesDirectory).filter(
      (file) =>
        file.endsWith(".json") &&
        !file.startsWith("test-") &&
        !file.startsWith("io-test-"),
    );

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const snapshot = readSnapshot(join(matchesDirectory, file));
      expect(snapshot.slug).toBe(basename(file, ".json"));
    }
  });
});
