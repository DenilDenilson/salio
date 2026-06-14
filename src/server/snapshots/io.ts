import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MatchSnapshotSchema, type MatchSnapshot } from "./schema";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function snapshotPathForSlug(slug: string): string {
  assertValidSlug(slug);
  return join(matchesDirectory(), `${slug}.json`);
}

export async function readSnapshot(slug: string): Promise<MatchSnapshot> {
  const content = await readFile(snapshotPathForSlug(slug), "utf8");
  return MatchSnapshotSchema.parse(JSON.parse(content));
}

export async function readSnapshotIfExists(
  slug: string,
): Promise<MatchSnapshot | null> {
  try {
    return await readSnapshot(slug);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeSnapshot(snapshot: MatchSnapshot): Promise<void> {
  const parsed = MatchSnapshotSchema.parse(snapshot);
  await mkdir(matchesDirectory(), { recursive: true });
  const finalPath = snapshotPathForSlug(parsed.slug);
  const tempPath = join(
    matchesDirectory(),
    `.${parsed.slug}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    const tempContent = await readFile(tempPath, "utf8");
    MatchSnapshotSchema.parse(JSON.parse(tempContent));
    await rename(tempPath, finalPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function matchesDirectory(): string {
  return resolve(process.cwd(), "src/content/matches");
}

function assertValidSlug(slug: string): void {
  if (!slugPattern.test(slug)) {
    throw new Error(
      "Invalid slug. Use lowercase letters, numbers and hyphens only.",
    );
  }
}
