import { existsSync } from "node:fs";
import { getConfig } from "../src/server/config";
import { stakeFixturePath } from "../src/server/demo/seed";
import { AppError } from "../src/server/errors";
import { StakeImporter } from "../src/server/importers/stake/importer";
import { buildOddsCapturedSnapshot } from "../src/server/snapshots/logic";
import {
  readSnapshotIfExists,
  snapshotPathForSlug,
  writeSnapshot,
} from "../src/server/snapshots/io";
import {
  booleanFlag,
  optionalStringArg,
  parseCliArgs,
  parseMatchTitleTeams,
  requireStringArg,
} from "../src/server/snapshots/cli";

const args = parseCliArgs(process.argv.slice(2));
const usage =
  'Uso: pnpm odds:capture -- --slug=equipo-a-vs-equipo-b --stake-url="https://stake.pe/..." --kickoff="2026-06-13T22:00:00.000Z" --title="Equipo A vs Equipo B" [--home="Equipo A"] [--away="Equipo B"] [--competition="Competición"] [--fixture-html="./stake.html"] [--debug-html="./tmp/stake-debug.html"] [--headed]';

try {
  const config = getConfig();
  const slug = requireStringArg(args, "slug");
  const stakeUrl = requireStringArg(args, "stake-url");
  const title = optionalStringArg(args, "title");
  const titleTeams = parseMatchTitleTeams(title);
  const homeTeamName =
    optionalStringArg(args, "home") ?? titleTeams?.home ?? undefined;
  const awayTeamName =
    optionalStringArg(args, "away") ?? titleTeams?.away ?? undefined;
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
    headless: booleanFlag(args, "headed")
      ? false
      : config.STAKE_IMPORT_HEADLESS,
    debugHtmlPath: optionalStringArg(args, "debug-html") ?? undefined,
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
    title: title ?? `${imported.homeTeamName} vs ${imported.awayTeamName}`,
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
  if (error instanceof AppError && error.code === "STAKE_NO_MARKETS_FOUND") {
    console.error(
      "Stake no expuso mercados en el HTML cargado por Playwright. Puede ser una pantalla intermedia, bloqueo, contenido lazy o una página sin cuotas visibles. Reintenta primero con --headed o conecta un Chrome real con BROWSER_WS_ENDPOINT=http://127.0.0.1:9222. Usa --debug-html para guardar lo que vio Playwright.",
    );
  }
  console.error(usage);
  process.exit(1);
}

function parseDateArg(value: string, key: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Argument --${key} must be a valid date.`);
  }
  return parsed;
}
