import { getConfig } from "../src/server/config";
import {
  optionalStringArg,
  parseCliArgs,
  requireStringArg,
} from "../src/server/snapshots/cli";
import {
  assertFixtureIsFinalizable,
  assertRemoteFixtureMatchesSnapshot,
} from "../src/server/snapshots/fixtureValidation";
import { readSnapshot } from "../src/server/snapshots/io";
import { createSnapshotSportsProvider } from "../src/server/snapshots/providerFactory";

const args = parseCliArgs(process.argv.slice(2));

try {
  const slug = requireStringArg(args, "slug");
  const eventId = requireStringArg(args, "event-id");
  const config = getConfig();
  const snapshot = await readSnapshot(slug);
  const provider = createSnapshotSportsProvider({
    config,
    homeTeamName: snapshot.homeTeamName,
    awayTeamName: snapshot.awayTeamName,
    evidenceDirectory: null,
  });
  const fixture = await provider.getFixture(eventId);

  let matchesSnapshot = true;
  let finalizable = true;
  let mismatch: string | null = null;
  try {
    assertRemoteFixtureMatchesSnapshot(snapshot, fixture, eventId);
    assertFixtureIsFinalizable(fixture);
  } catch (error) {
    matchesSnapshot = false;
    finalizable = false;
    mismatch = error instanceof Error ? error.message : String(error);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        eventId,
        matchesSnapshot,
        finalizable,
        fixture: {
          eventId: fixture.eventId,
          homeTeamName: fixture.homeTeamName,
          awayTeamName: fixture.awayTeamName,
          kickoffAt: fixture.kickoffAt,
          competitionName: fixture.competitionName,
          leagueSlug: fixture.leagueSlug,
          status: fixture.providerStatus ?? fixture.status,
          score: fixture.score,
          sourceUrl: fixture.sourceUrl,
        },
        mismatch,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  const slug = optionalStringArg(args, "slug") ?? "brasil-vs-marruecos";
  console.error(`Uso: pnpm espn:validate -- --slug=${slug} --event-id=760419`);
  process.exit(1);
}
