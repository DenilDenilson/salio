import { getConfig } from "../src/server/config";
import {
  booleanFlag,
  optionalStringArg,
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
import {
  assertFixtureIsFinalizable,
  assertRemoteFixtureMatchesSnapshot,
} from "../src/server/snapshots/fixtureValidation";
import { createSnapshotSportsProvider } from "../src/server/snapshots/providerFactory";
import { type MatchSnapshot } from "../src/server/snapshots/schema";

const args = parseCliArgs(process.argv.slice(2));

try {
  const slug = requireStringArg(args, "slug");
  const snapshot = await readSnapshot(slug);
  const config = getConfig();
  const eventId =
    optionalStringArg(args, "event-id") ?? snapshot.sportsData.eventId;

  if (!eventId) {
    throw new Error(
      "Missing --event-id and snapshot has no sportsData.eventId.",
    );
  }
  const originalFrozenOdds = snapshot.odds;
  const originalStake = snapshot.stake;
  const demoProvider = booleanFlag(args, "demo-provider");

  const provider = createSnapshotSportsProvider({
    config,
    homeTeamName: snapshot.homeTeamName,
    awayTeamName: snapshot.awayTeamName,
    demoProvider,
  });

  const fixture = await provider.getFixture(eventId);
  assertRemoteFixtureMatchesSnapshot(snapshot, fixture, eventId);
  assertFixtureIsFinalizable(fixture);

  const [events, teamStats, playerStats] = await Promise.all([
    provider.getEvents(eventId),
    provider.getTeamStatistics(eventId),
    provider.getPlayerStatistics(eventId),
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
    sportsData: {
      provider: demoProvider || config.DEMO_MODE ? "demo" : "espn",
      eventId: fixture.eventId,
      leagueSlug:
        fixture.leagueSlug ??
        snapshot.sportsData.leagueSlug ??
        config.ESPN_LEAGUE_SLUG,
      sourceUrl:
        fixture.sourceUrl ??
        fixture.evidence?.sourceUrl ??
        snapshot.sportsData.sourceUrl,
    },
  });
  assertStakeAndFrozenOddsPreserved({
    before: { stake: originalStake, odds: originalFrozenOdds },
    after: finalized,
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
    "Uso: pnpm match:finalize -- --slug=<slug> --event-id=<ESPN_EVENT_ID> [--demo-provider]",
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

export function assertStakeAndFrozenOddsPreserved(input: {
  before: Pick<MatchSnapshot, "stake" | "odds">;
  after: MatchSnapshot;
}): void {
  const before = immutableOddsSignature(input.before);
  const after = immutableOddsSignature(input.after);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      "Frozen odds/stake immutable fields changed; snapshot was not written.",
    );
  }
}

function immutableOddsSignature(input: Pick<MatchSnapshot, "stake" | "odds">) {
  return stripMutableSettlementFields({
    stake: input.stake,
    odds: input.odds,
  });
}

function stripMutableSettlementFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripMutableSettlementFields);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const mutable = new Set([
    "status",
    "resolvedAt",
    "resolvedMinute",
    "resolutionReason",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !mutable.has(key))
      .map(([key, nested]) => [key, stripMutableSettlementFields(nested)]),
  );
}
