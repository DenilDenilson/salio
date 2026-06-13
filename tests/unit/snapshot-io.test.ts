import { readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readSnapshot,
  readSnapshotIfExists,
  snapshotPathForSlug,
  writeSnapshot,
} from "../../src/server/snapshots/io";
import { MatchSnapshotSchema } from "../../src/server/snapshots/schema";

const slug = `io-test-${Date.now().toString(36)}`;
const path = snapshotPathForSlug(slug);

function demoSnapshot() {
  return MatchSnapshotSchema.parse(
    JSON.parse(
      readFileSync(
        join(process.cwd(), "src/content/matches/canada-vs-bosnia.json"),
        "utf8",
      ),
    ) as unknown,
  );
}

afterEach(async () => {
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
});

describe("snapshot IO", () => {
  it("rejects invalid slugs before touching disk", () => {
    expect(() => snapshotPathForSlug("../bad")).toThrow("Invalid slug");
  });

  it("returns null for missing snapshots", async () => {
    await expect(readSnapshotIfExists(slug)).resolves.toBeNull();
  });

  it("writes and reads validated snapshots", async () => {
    await writeSnapshot({ ...demoSnapshot(), slug });

    await expect(readSnapshot(slug)).resolves.toMatchObject({
      slug,
      phase: "finalized",
    });
    await expect(readSnapshotIfExists(slug)).resolves.toMatchObject({ slug });
  });
});
