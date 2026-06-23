import { existsSync } from "node:fs";
import { getConfig } from "../src/server/config";
import { StakeImporter } from "../src/server/importers/stake/importer";
import { buildOddsCapturedSnapshot } from "../src/server/snapshots/logic";
import {
  readSnapshotIfExists,
  snapshotPathForSlug,
  writeSnapshot,
} from "../src/server/snapshots/io";
import { assertOddsCaptureCanWriteSnapshot } from "../src/server/snapshots/captureSafety";
import {
  optionalStringArg,
  parseCliArgs,
  parseMatchTitleTeams,
  requireStringArg,
} from "../src/server/snapshots/cli";

const STAKE_API_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];
const STAKE_API_MAX_ATTEMPTS = 13;

type StakeImportInput = Parameters<StakeImporter["importEvent"]>[0];
type StakeImportResult = Awaited<ReturnType<StakeImporter["importEvent"]>>;

const args = parseCliArgs(process.argv.slice(2));

const usage =
  'Uso: pnpm odds:capture -- --slug=equipo-a-vs-equipo-b --stake-url="https://stake.pe/..." --stake-api-url="https://.../single-pre-event.json?hidenseek=..." --kickoff="2026-06-13T22:00:00.000Z" --title="Equipo A vs Equipo B" [--save-raw-api="./data/evidence/stake-api/event.json"]';

try {
  const config = getConfig();

  const slug = requireStringArg(args, "slug");
  const stakeUrl = requireStringArg(args, "stake-url");
  const stakeApiUrl = requireStringArg(args, "stake-api-url");

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

  assertOddsCaptureCanWriteSnapshot(slug, previous);

  const importer = new StakeImporter({
    allowedHosts: config.stakeAllowedHosts,
    timeoutMs: config.STAKE_API_TIMEOUT_MS,
    stakeApiAllowedHosts: config.stakeApiAllowedHosts,
    stakeApiTimeoutMs: config.STAKE_API_TIMEOUT_MS,
    stakeApiSaveRawPath: optionalStringArg(args, "save-raw-api"),
    stakeApiSaveRawResponses: config.STAKE_SAVE_RAW_RESPONSES,
  });

  const imported = await importStakeEventWithRetries(importer, {
    url: stakeUrl,
    stakeApiUrl,
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
        stakeEventId: imported.stakeEventId,
        homeTeamName: imported.homeTeamName,
        awayTeamName: imported.awayTeamName,
        kickoffAt: imported.kickoffAt,
        competitionName: imported.competitionName,
        markets: snapshot.odds.markets.length,
        selections: snapshot.odds.markets.reduce(
          (total, market) => total + market.selections.length,
          0,
        ),
        supportedSelections: snapshot.odds.markets
          .flatMap((market) => market.selections)
          .filter((selection) => selection.status !== "unsupported").length,
        unsupportedSelections: snapshot.odds.markets
          .flatMap((market) => market.selections)
          .filter((selection) => selection.status === "unsupported").length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage);
  process.exit(1);
}

async function importStakeEventWithRetries(
  importer: StakeImporter,
  input: StakeImportInput,
): Promise<StakeImportResult> {
  const maxAttempts = STAKE_API_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await importer.importEvent(input);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryableStakeApiError(error)) {
        throw error;
      }

      const delayMs = STAKE_API_RETRY_DELAYS_MS[attempt - 1] ?? 30_000;

      console.error(
        `⚠️ Stake API falló en intento ${attempt}/${maxAttempts}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      console.error(
        `⏳ Reintentando Stake API en ${Math.round(delayMs / 1000)}s...`,
      );

      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isRetryableStakeApiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  if (
    /Stake API returned HTTP (406|408|425|429|500|502|503|504)\b/.test(message)
  ) {
    return true;
  }

  return /fetch failed|network|timeout|timed out|AbortError|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(
    message,
  );
}

function parseDateArg(value: string, key: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Argument --${key} must be a valid date.`);
  }

  return parsed;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
