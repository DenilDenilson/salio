import { existsSync } from "node:fs";
import { getConfig } from "../src/server/config";
import { stakeFixturePath } from "../src/server/demo/seed";
import { StakeImporter } from "../src/server/importers/stake/importer";
import { buildOddsCapturedSnapshot } from "../src/server/snapshots/logic";
import {
  readSnapshotIfExists,
  snapshotPathForSlug,
  writeSnapshot,
} from "../src/server/snapshots/io";
import {
  optionalStringArg,
  parseCliArgs,
  requireStringArg,
} from "../src/server/snapshots/cli";

const args = parseCliArgs(process.argv.slice(2));

try {
  const config = getConfig();
  const slug = requireStringArg(args, "slug");
  const stakeUrl = requireStringArg(args, "stake-url");
  const homeTeamName = optionalStringArg(args, "home") ?? undefined;
  const awayTeamName = optionalStringArg(args, "away") ?? undefined;
  const competitionName = optionalStringArg(args, "competition");
  const kickoffArg = optionalStringArg(args, "kickoff");
  const capturedAt = parseDateArg(
    optionalStringArg(args, "captured-at") ?? new Date().toISOString(),
    "captured-at",
  );
  const previous = await readSnapshotIfExists(slug);

  if (previous?.phase === "finalized") {
    throw new Error(
      `Snapshot ${slug} is finalized. Create a new slug instead of overwriting it.`,
    );
  }

  const importer = new StakeImporter({
    allowedHosts: config.stakeAllowedHosts,
    timeoutMs: config.STAKE_IMPORT_TIMEOUT_MS,
    browserWsEndpoint: config.BROWSER_WS_ENDPOINT,
    fixtureHtmlPath:
      optionalStringArg(args, "fixture-html") ??
      (config.DEMO_MODE ? stakeFixturePath : undefined),
  });
  const imported = await importer.importEvent({
    url: stakeUrl,
    capturedAt,
    matchId: slug,
    fallbackHomeTeamName: homeTeamName,
    fallbackAwayTeamName: awayTeamName,
    fallbackCompetitionName: competitionName,
    fallbackKickoffAt: kickoffArg,
  });

  const kickoffAt = kickoffArg ?? imported.kickoffAt ?? null;
  if (!kickoffAt) {
    throw new Error("Missing --kickoff and Stake fixture did not expose one.");
  }

  const snapshot = buildOddsCapturedSnapshot({
    slug,
    title:
      optionalStringArg(args, "title") ??
      `${imported.homeTeamName} vs ${imported.awayTeamName}`,
    homeTeamName: homeTeamName ?? imported.homeTeamName,
    awayTeamName: awayTeamName ?? imported.awayTeamName,
    competitionName: competitionName ?? imported.competitionName,
    timezone: optionalStringArg(args, "timezone") ?? "America/Lima",
    kickoffAt: new Date(kickoffAt).toISOString(),
    stakeUrl,
    stakeEventId: imported.stakeEventId,
    capturedAt: imported.capturedAt,
    markets: imported.markets,
    previous,
  });

  await writeSnapshot(snapshot);

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: snapshot.phase,
        path: snapshotPathForSlug(slug),
        existed: existsSync(snapshotPathForSlug(slug)),
        markets: snapshot.odds.markets.length,
        selections: snapshot.odds.markets.reduce(
          (total, market) => total + market.selections.length,
          0,
        ),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    'Uso: pnpm odds:capture -- --slug=canada-vs-bosnia --stake-url="https://stake.pe/..." --kickoff="2026-06-12T19:00:00.000Z" [--title="Canadá vs Bosnia y Herzegovina"] [--home="Canadá"] [--away="Bosnia y Herzegovina"] [--competition="Amistoso internacional"]',
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
