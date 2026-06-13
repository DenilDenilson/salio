import { getConfig } from "../src/server/config";
import {
  booleanFlag,
  optionalStringArg,
  optionalNumberArg,
  parseCliArgs,
  requireStringArg,
} from "../src/server/snapshots/cli";
import {
  buildResultSnapshot,
  evaluateSnapshot,
} from "../src/server/snapshots/logic";
import {
  readSnapshot,
  snapshotPathForSlug,
  writeSnapshot,
} from "../src/server/snapshots/io";
import { createSnapshotSportsProvider } from "../src/server/snapshots/providerFactory";

const args = parseCliArgs(process.argv.slice(2));

try {
  const slug = requireStringArg(args, "slug");
  const snapshot = await readSnapshot(slug);
  const fixtureId =
    optionalNumberArg(args, "fixture-id") ?? snapshot.apiFootball.fixtureId;

  if (!fixtureId) {
    throw new Error("Missing --fixture-id and snapshot has no fixtureId.");
  }

  const provider = createSnapshotSportsProvider({
    config: getConfig(),
    homeTeamName: snapshot.homeTeamName,
    awayTeamName: snapshot.awayTeamName,
    demoProvider: booleanFlag(args, "demo-provider"),
  });

  const [fixture, events, teamStats, playerStats] = await Promise.all([
    provider.getFixture(fixtureId),
    provider.getEvents(fixtureId),
    provider.getTeamStatistics(fixtureId),
    provider.getPlayerStatistics(fixtureId),
  ]);

  const result = buildResultSnapshot({
    fixture,
    events,
    teamStats,
    playerStats,
  });
  const evaluatedAt = parseDateArg(
    optionalStringArg(args, "finalized-at") ?? new Date().toISOString(),
    "finalized-at",
  );
  const finalized = evaluateSnapshot({
    snapshot,
    result,
    evaluatedAt,
    fixtureId,
  });

  await writeSnapshot(finalized);

  const counts = finalized.odds.markets
    .flatMap((market) => market.selections)
    .reduce<Record<string, number>>((acc, selection) => {
      acc[selection.status] = (acc[selection.status] ?? 0) + 1;
      return acc;
    }, {});

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: finalized.phase,
        path: snapshotPathForSlug(slug),
        score: finalized.result?.score,
        counts,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "Uso: pnpm match:finalize -- --slug=canada-vs-bosnia --fixture-id=990001 [--demo-provider]",
  );
  process.exit(1);
}

function parseDateArg(value: string, key: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Argument --${key} must be a valid date.`);
  }
  return parsed;
}
