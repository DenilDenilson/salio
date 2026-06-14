import {
  FixtureStatus,
  StateResponseSchema,
  type MarketState,
  type RuleEvaluationContext,
  type StateResponse,
} from "../../domain/model";
import {
  displayNameForMarket,
  normalizeText,
  type NormalizedMarket,
} from "../../domain/markets/normalization";
import { evaluateSelection } from "../../domain/rules";
import { AppError } from "../errors";
import {
  type ProviderEvent,
  type ProviderFixture,
  type ProviderPlayerStats,
  type ProviderTeamStats,
  type SportsDataSource,
} from "../providers/types";
import {
  MatchSnapshotSchema,
  type MatchSnapshot,
  type SnapshotResult,
} from "./schema";

export function normalizedMarketsToState(
  markets: NormalizedMarket[],
): MarketState[] {
  return markets.map((market) => ({
    id: market.id,
    marketType: market.marketType,
    rawMarketName: market.rawMarketName,
    displayName: displayNameForMarket(market.marketType, market.rawMarketName),
    displayOrder: market.displayOrder,
    supported: market.supported,
    selections: market.selections,
  }));
}

export function buildResultSnapshot(input: {
  fixture: ProviderFixture;
  events: ProviderEvent[];
  teamStats: ProviderTeamStats;
  playerStats: ProviderPlayerStats[];
}): SnapshotResult {
  if (input.fixture.score.home === null || input.fixture.score.away === null) {
    throw new AppError(
      "SPORTS_PROVIDER_INVALID_RESPONSE",
      "Finalizable fixture is missing final score.",
    );
  }
  const events = dedupeEvents(input.events);
  const sortedEvents = events.sort(compareEventsByMinute);
  const scoringEvent = events
    .filter((event) => event.eventType === "GOAL" && !event.isCancelled)
    .sort(compareEventsByMinute)[0];

  return {
    evidence: input.fixture.evidence ?? null,
    status: input.fixture.status,
    elapsedMinutes: input.fixture.elapsedMinutes ?? null,
    score: {
      home: input.fixture.score.home,
      away: input.fixture.score.away,
      halftimeHome: input.fixture.score.halftimeHome ?? null,
      halftimeAway: input.fixture.score.halftimeAway ?? null,
    },
    firstScoringTeam: scoringEvent?.teamSide ?? null,
    yellowCards: input.teamStats.yellowCards,
    corners: input.teamStats.corners,
    teamStatistics: {
      home: input.teamStats.home,
      away: input.teamStats.away,
    },
    events: sortedEvents
      .filter((event) => !event.isCancelled)
      .map((event) => ({
        type: event.eventType,
        originalType: event.originalType,
        teamSide: event.teamSide,
        period: event.period ?? null,
        minute: event.minute ?? null,
        extraMinute: event.extraMinute ?? null,
        playerName: event.playerName ?? null,
        providerEventId: event.providerEventId ?? null,
        text: event.text ?? null,
      })),
    playerStats: playerStatsRecord(input.playerStats),
  };
}

export function evaluateSnapshot(input: {
  snapshot: MatchSnapshot;
  result: SnapshotResult;
  evaluatedAt: Date;
  sportsData: SportsDataSource;
}): MatchSnapshot {
  const context = resultToRuleContext(input.result, input.evaluatedAt);
  const markets = input.snapshot.odds.markets.map((market) => ({
    ...market,
    selections: market.selections.map((selection) => {
      const evaluation = evaluateSelection(selection, context);
      return {
        ...selection,
        status: evaluation.status,
        resolvedAt: evaluation.resolvedAt?.toISOString(),
        resolvedMinute: evaluation.resolvedMinute,
        resolutionReason: evaluation.reason,
      };
    }),
  }));

  return MatchSnapshotSchema.parse({
    ...input.snapshot,
    phase: "finalized",
    sportsData: input.sportsData,
    odds: {
      ...input.snapshot.odds,
      markets,
    },
    result: input.result,
    metadata: {
      ...input.snapshot.metadata,
      finalizedAt: input.evaluatedAt.toISOString(),
      lastEvaluatedAt: input.evaluatedAt.toISOString(),
    },
  });
}

export function snapshotToStateResponse(
  snapshot: MatchSnapshot,
): StateResponse {
  const result = snapshot.result;
  const lastUpdatedAt =
    snapshot.metadata.lastEvaluatedAt ??
    snapshot.metadata.finalizedAt ??
    snapshot.odds.capturedAt;

  return StateResponseSchema.parse({
    match: {
      id: snapshot.slug,
      slug: snapshot.slug,
      title: snapshot.title,
      homeTeamName: snapshot.homeTeamName,
      awayTeamName: snapshot.awayTeamName,
      competitionName: snapshot.competitionName,
      status: result?.status ?? FixtureStatus.NOT_STARTED,
      elapsedMinutes: result?.elapsedMinutes ?? null,
      score: {
        home: result?.score.home ?? 0,
        away: result?.score.away ?? 0,
      },
      kickoffAt: snapshot.kickoffAt,
    },
    odds: {
      capturedAt: snapshot.odds.capturedAt,
      frozen: snapshot.odds.frozen,
      frozenAt: snapshot.odds.capturedAt,
      source: snapshot.odds.source,
      timezone: snapshot.timezone,
      notice:
        snapshot.phase === "finalized"
          ? "Cuotas congeladas prepartido; resultado final agregado desde snapshot versionado."
          : "Cuotas congeladas prepartido; pendiente de resultado oficial.",
    },
    markets: snapshot.odds.markets,
    lastUpdatedAt,
    stale: false,
    nextSuggestedPollMs: 60_000,
    errors: [],
  });
}

export function buildOddsCapturedSnapshot(input: {
  slug: string;
  title: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionName: string | null;
  timezone: string;
  kickoffAt: string;
  stakeUrl: string;
  stakeEventId: string | null;
  capturedAt: string;
  markets: NormalizedMarket[];
  previous?: MatchSnapshot | null;
}): MatchSnapshot {
  return MatchSnapshotSchema.parse({
    schemaVersion: "2.0",
    slug: input.slug,
    title: input.title,
    competitionName: input.competitionName,
    timezone: input.timezone,
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
    kickoffAt: input.kickoffAt,
    phase: "odds_captured",
    stake: {
      eventUrl: input.stakeUrl,
      eventId: input.stakeEventId,
    },
    sportsData: input.previous?.sportsData ?? {
      provider: "espn",
      eventId: null,
      leagueSlug: null,
      sourceUrl: null,
    },
    odds: {
      source: "stake",
      capturedAt: input.capturedAt,
      frozen: true,
      markets: normalizedMarketsToState(input.markets),
    },
    result: null,
    metadata: {
      createdAt: input.previous?.metadata.createdAt ?? input.capturedAt,
      finalizedAt: null,
      lastEvaluatedAt: null,
    },
  });
}

function resultToRuleContext(
  result: SnapshotResult,
  evaluatedAt: Date,
): RuleEvaluationContext {
  return {
    now: evaluatedAt,
    fixtureStatus: result.status,
    elapsedMinutes: result.elapsedMinutes ?? undefined,
    score: {
      home: result.score.home,
      away: result.score.away,
      halftimeHome: result.score.halftimeHome ?? undefined,
      halftimeAway: result.score.halftimeAway ?? undefined,
    },
    firstScoringTeam: result.firstScoringTeam,
    yellowCards: result.yellowCards,
    corners: result.corners,
    playerStats: result.playerStats,
  };
}

function playerStatsRecord(
  playerStats: ProviderPlayerStats[],
): SnapshotResult["playerStats"] {
  const record: SnapshotResult["playerStats"] = {};
  for (const stats of playerStats) {
    const value = {
      playerName: stats.playerName,
      teamSide: stats.teamSide ?? null,
      starter: stats.starter,
      substitute: stats.substitute,
      minutes: stats.minutes,
      goals: stats.goals,
      shots: stats.shots,
      shotsOnTarget: stats.shotsOnTarget,
      yellowCards: stats.yellowCards,
      redCards: stats.redCards,
      assists: stats.assists,
      appeared: stats.appeared,
    };
    record[stats.playerId || playerIdFromName(stats.playerName)] = value;
  }
  return record;
}

function dedupeEvents(events: ProviderEvent[]): ProviderEvent[] {
  const seen = new Set<string>();
  const deduped: ProviderEvent[] = [];
  for (const event of events) {
    if (seen.has(event.providerEventId)) {
      continue;
    }
    seen.add(event.providerEventId);
    deduped.push(event);
  }
  return deduped;
}

function playerIdFromName(value: string): string {
  return `player_${normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function compareEventsByMinute(
  left: ProviderEvent,
  right: ProviderEvent,
): number {
  const leftMinute = left.minute ?? 999;
  const rightMinute = right.minute ?? 999;
  if (leftMinute !== rightMinute) {
    return leftMinute - rightMinute;
  }
  return (left.extraMinute ?? 0) - (right.extraMinute ?? 0);
}
