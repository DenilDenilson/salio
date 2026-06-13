import { getConfig } from "../src/server/config";
import {
  booleanFlag,
  parseCliArgs,
  requireStringArg,
} from "../src/server/snapshots/cli";
import { readSnapshot } from "../src/server/snapshots/io";
import { createSnapshotSportsProvider } from "../src/server/snapshots/providerFactory";

const args = parseCliArgs(process.argv.slice(2));

try {
  const slug = requireStringArg(args, "slug");
  const snapshot = await readSnapshot(slug);
  const provider = createSnapshotSportsProvider({
    config: getConfig(),
    homeTeamName: snapshot.homeTeamName,
    awayTeamName: snapshot.awayTeamName,
    demoProvider: booleanFlag(args, "demo-provider"),
  });
  const candidates = await provider.searchFixtureCandidates({
    homeTeamName: snapshot.homeTeamName,
    awayTeamName: snapshot.awayTeamName,
    kickoffAt: snapshot.kickoffAt,
    competitionName: snapshot.competitionName,
  });

  console.log(JSON.stringify({ ok: true, slug, candidates }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "Uso: pnpm fixture:search -- --slug=canada-vs-bosnia [--demo-provider]",
  );
  process.exit(1);
}
