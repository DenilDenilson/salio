import {
  FixtureStatus,
  StateResponseSchema,
  isFinalStatus,
  type RuleEvaluationContext,
  type StateResponse,
} from "../../domain/model";
import { displayNameForMarket } from "../../domain/markets/normalization";
import { evaluateSelection } from "../../domain/rules";
import { type CacheClient } from "../cache/cache";
import { AppError } from "../errors";
import { logError, logInfo } from "../observability/logger";
import {
  type LiveSportsProvider,
  type ProviderEvent,
} from "../providers/types";
import { type AppStore, type StoredLiveState } from "../repositories/types";

export interface RefreshOptions {
  pollMs: number;
  eventsRefreshMs: number;
  statsRefreshMs: number;
  playerStatsRefreshMs: number;
}

export async function refreshMatchIfStale(input: {
  slug: string;
  store: AppStore;
  cache: CacheClient;
  provider: LiveSportsProvider;
  options: RefreshOptions;
  force?: boolean;
}): Promise<StateResponse> {
  const match = await input.store.getMatchBySlug(input.slug);
  if (!match) {
    throw new AppError("MATCH_NOT_FOUND", "Match not found.", 404);
  }
  if (!match.published) {
    throw new AppError("MATCH_NOT_PUBLISHED", "Match is not published.", 404);
  }
  if (!match.apiFootballFixtureId) {
    throw new AppError(
      "FIXTURE_MAPPING_REQUIRED",
      "Fixture mapping required.",
      409,
    );
  }

  const snapshot = await input.store.getVisibleSnapshot(match.id);
  if (!snapshot) {
    throw new AppError(
      "STAKE_NO_MARKETS_FOUND",
      "No odds snapshot found.",
      409,
    );
  }

  const stateKey = `match:${match.id}:state`;
  const cached = await input.cache.get<StateResponse>(stateKey);
  const live = await input.store.getLiveState(match.id);
  const now = new Date();

  if (!input.force && cached && live && isFinalStatus(live.fixtureStatus)) {
    return StateResponseSchema.parse(cached);
  }

  const needsRefresh =
    input.force ||
    !live ||
    isLiveStateStale(live, now, input.options.eventsRefreshMs);
  if (!needsRefresh && cached) {
    return StateResponseSchema.parse({ ...cached, stale: false });
  }

  const lockKey = `match:${match.id}:refresh-lock`;
  const lockToken = await input.cache.acquireLock(lockKey, 12);
  if (!lockToken) {
    if (cached) {
      return StateResponseSchema.parse({
        ...cached,
        stale: true,
        errors: ["STALE_DATA_RETURNED"],
      });
    }
    throw new AppError("LOCK_NOT_ACQUIRED", "Refresh lock not acquired.", 503);
  }

  const startedAt = Date.now();
  try {
    const previous = await input.store.getLiveState(match.id);
    const nextLive = await buildLiveState({
      matchId: match.id,
      fixtureId: match.apiFootballFixtureId,
      provider: input.provider,
      previous,
      options: input.options,
      now,
      force: input.force ?? false,
    });

    await input.store.saveLiveState(nextLive);
    const evaluations = snapshot.markets.flatMap((market) =>
      market.selections.map((selection) => {
        const evaluation = evaluateSelection(selection, nextLive.context);
        return {
          selectionId: selection.id,
          status: evaluation.status,
          resolvedAt: evaluation.resolvedAt?.toISOString(),
          resolvedMinute: evaluation.resolvedMinute,
          reason: evaluation.reason,
        };
      }),
    );
    const selectionChanges = await input.store.updateSelectionEvaluations(
      match.id,
      evaluations,
    );
    const freshSnapshot = await input.store.getVisibleSnapshot(match.id);
    if (!freshSnapshot) {
      throw new AppError(
        "STAKE_NO_MARKETS_FOUND",
        "Snapshot disappeared during refresh.",
        500,
      );
    }

    const response = StateResponseSchema.parse({
      match: {
        id: match.id,
        slug: match.slug,
        title: match.title,
        homeTeamName: match.homeTeamName,
        awayTeamName: match.awayTeamName,
        competitionName: match.competitionName,
        status: nextLive.fixtureStatus,
        elapsedMinutes: nextLive.elapsedMinutes,
        score: { home: nextLive.scoreHome, away: nextLive.scoreAway },
        kickoffAt: match.kickoffAt,
      },
      odds: {
        capturedAt: freshSnapshot.capturedAt,
        frozen: freshSnapshot.status === "frozen",
        frozenAt: freshSnapshot.frozenAt,
        source: freshSnapshot.source,
        timezone: match.timezone,
        notice:
          "Captura historica de cuotas prepartido; puede diferir de la cuota actual.",
      },
      markets: freshSnapshot.markets.map((market) => ({
        id: market.id,
        marketType: market.marketType,
        rawMarketName: market.rawMarketName,
        displayName: displayNameForMarket(
          market.marketType,
          market.rawMarketName,
        ),
        displayOrder: market.displayOrder,
        supported: market.supported,
        selections: market.selections,
      })),
      lastUpdatedAt: nextLive.capturedAt,
      stale: false,
      nextSuggestedPollMs: isFinalStatus(nextLive.fixtureStatus)
        ? 60_000
        : input.options.pollMs,
      errors: nextLive.errors,
    });

    await input.cache.set(stateKey, response, 30);
    logInfo({
      operation: "match.refresh",
      matchId: match.id,
      fixtureId: match.apiFootballFixtureId,
      durationMs: Date.now() - startedAt,
      cacheHit: false,
      lockAcquired: true,
      stale: false,
      selectionChanges,
    });
    return response;
  } catch (error) {
    logError(
      {
        operation: "match.refresh",
        matchId: match.id,
        errorCode: "SPORTS_PROVIDER_INVALID_RESPONSE",
      },
      error,
    );
    if (cached) {
      return StateResponseSchema.parse({
        ...cached,
        stale: true,
        errors: ["STALE_DATA_RETURNED"],
      });
    }
    throw error;
  } finally {
    await input.cache.releaseLock(lockKey, lockToken);
  }
}

async function buildLiveState(input: {
  matchId: string;
  fixtureId: number;
  provider: LiveSportsProvider;
  previous: StoredLiveState | null;
  options: RefreshOptions;
  now: Date;
  force: boolean;
}): Promise<StoredLiveState> {
  const fixture = await input.provider.getFixture(input.fixtureId);
  const shouldRefreshStats =
    input.force ||
    !input.previous?.statsLastRefreshAt ||
    isTimestampStale(
      input.previous.statsLastRefreshAt,
      input.now,
      input.options.statsRefreshMs,
    );
  const shouldRefreshPlayers =
    input.force ||
    !input.previous?.playersLastRefreshAt ||
    isTimestampStale(
      input.previous.playersLastRefreshAt,
      input.now,
      input.options.playerStatsRefreshMs,
    );

  const [events, teamStats, playerStats] = await Promise.all([
    input.provider.getEvents(input.fixtureId),
    shouldRefreshStats
      ? input.provider.getTeamStatistics(input.fixtureId)
      : Promise.resolve({
          yellowCards: input.previous?.context.yellowCards ?? {
            home: 0,
            away: 0,
          },
          corners: input.previous?.context.corners ?? { home: 0, away: 0 },
          shotsOnTarget: { home: 0, away: 0 },
        }),
    shouldRefreshPlayers
      ? input.provider.getPlayerStatistics(input.fixtureId)
      : Promise.resolve([]),
  ]);

  const firstScoringTeam = firstGoal(events);
  const playerStatsById = Object.fromEntries(
    playerStats.map((player) => [
      player.playerId,
      {
        goals: player.goals,
        shotsOnTarget: player.shotsOnTarget,
        appeared: player.appeared,
      },
    ]),
  );
  const context: RuleEvaluationContext = {
    now: input.now,
    fixtureStatus: fixture.status,
    elapsedMinutes: fixture.elapsedMinutes,
    score: fixture.score,
    firstScoringTeam,
    yellowCards: teamStats.yellowCards,
    corners: teamStats.corners,
    playerStats:
      Object.keys(playerStatsById).length > 0
        ? playerStatsById
        : (input.previous?.context.playerStats ?? {}),
  };

  return {
    matchId: input.matchId,
    provider: "api-football",
    fixtureStatus: fixture.status,
    elapsedMinutes: fixture.elapsedMinutes ?? null,
    scoreHome: fixture.score.home,
    scoreAway: fixture.score.away,
    context,
    capturedAt: input.now.toISOString(),
    fixtureLastRefreshAt: input.now.toISOString(),
    statsLastRefreshAt: shouldRefreshStats
      ? input.now.toISOString()
      : (input.previous?.statsLastRefreshAt ?? null),
    playersLastRefreshAt: shouldRefreshPlayers
      ? input.now.toISOString()
      : (input.previous?.playersLastRefreshAt ?? null),
    errors: [],
  };
}

function isLiveStateStale(
  live: StoredLiveState,
  now: Date,
  refreshMs: number,
): boolean {
  if (live.fixtureStatus === FixtureStatus.NOT_STARTED) {
    return isTimestampStale(live.fixtureLastRefreshAt, now, refreshMs);
  }
  if (isFinalStatus(live.fixtureStatus)) {
    return false;
  }
  return isTimestampStale(live.fixtureLastRefreshAt, now, refreshMs);
}

function isTimestampStale(
  timestamp: string | null,
  now: Date,
  refreshMs: number,
): boolean {
  if (!timestamp) {
    return true;
  }
  return now.getTime() - new Date(timestamp).getTime() >= refreshMs;
}

function firstGoal(events: ProviderEvent[]): "HOME" | "AWAY" | null {
  const goal = events
    .filter((event) => event.eventType === "GOAL" && !event.isCancelled)
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999))[0];
  return goal?.teamSide ?? null;
}
