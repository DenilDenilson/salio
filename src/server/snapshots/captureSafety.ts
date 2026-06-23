import { type MatchSnapshot } from "./schema";

export function assertOddsCaptureCanWriteSnapshot(
  slug: string,
  previous: MatchSnapshot | null,
): void {
  if (previous?.phase !== "finalized") {
    return;
  }

  throw new Error(
    `Snapshot ${slug} is finalized. Create a new slug instead of overwriting it.`,
  );
}
