import {
  FixtureStatus,
  OddsSnapshotStatus,
  type MatchSummary,
  type NormalizedSelection,
  type RuleEvaluationContext,
} from "../../domain/model";
import { type ImportedEvent } from "../importers/stake/importer";

export interface StoredSelection extends NormalizedSelection {
  marketId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMarket {
  id: string;
  snapshotId: string;
  matchId: string;
  marketType: NormalizedSelection["marketType"];
  rawMarketName: string;
  sourceMarketId?: string;
  displayOrder: number;
  supported: boolean;
  metadata: Record<string, unknown>;
  selections: StoredSelection[];
}

export interface StoredSnapshot {
  id: string;
  matchId: string;
  status: OddsSnapshotStatus;
  capturedAt: string;
  frozenAt: string | null;
  source: string;
  sourcePayload: unknown;
  importVersion: string;
  errorMessage: string | null;
  createdAt: string;
  markets: StoredMarket[];
}

export interface StoredLiveState {
  matchId: string;
  provider: string;
  fixtureStatus: FixtureStatus;
  elapsedMinutes: number | null;
  scoreHome: number;
  scoreAway: number;
  context: RuleEvaluationContext;
  capturedAt: string;
  fixtureLastRefreshAt: string | null;
  statsLastRefreshAt: string | null;
  playersLastRefreshAt: string | null;
  errors: string[];
}

export interface StoredHistoryEntry {
  id: string;
  matchId: string;
  operation: string;
  message: string;
  createdAt: string;
}

export interface CreateMatchInput {
  slug: string;
  title: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionName?: string | null;
  kickoffAt: string;
  timezone: string;
  stakeUrl: string;
  oddsFreezeOffsetMinutes: number;
}

export interface AppStore {
  listMatches(): Promise<MatchSummary[]>;
  createMatch(input: CreateMatchInput): Promise<MatchSummary>;
  upsertMatchFromImport(
    slug: string,
    imported: ImportedEvent,
    fallback: CreateMatchInput,
  ): Promise<MatchSummary>;
  getMatchBySlug(slug: string): Promise<MatchSummary | null>;
  getMatchById(id: string): Promise<MatchSummary | null>;
  getPublishedCurrentMatch(): Promise<MatchSummary | null>;
  saveImportedSnapshot(
    matchId: string,
    imported: ImportedEvent,
  ): Promise<StoredSnapshot>;
  getVisibleSnapshot(matchId: string): Promise<StoredSnapshot | null>;
  freezeOdds(
    matchId: string,
    frozenAt: Date,
    manual: boolean,
  ): Promise<StoredSnapshot>;
  confirmFixture(
    matchId: string,
    eventId: string,
    confirmedBy: string,
  ): Promise<MatchSummary>;
  publishMatch(matchId: string): Promise<MatchSummary>;
  saveLiveState(liveState: StoredLiveState): Promise<void>;
  getLiveState(matchId: string): Promise<StoredLiveState | null>;
  updateSelectionEvaluations(
    matchId: string,
    evaluations: Array<{
      selectionId: string;
      status: NormalizedSelection["status"];
      resolvedAt?: string;
      resolvedMinute?: number;
      reason: string;
    }>,
  ): Promise<number>;
  addHistory(
    matchId: string,
    operation: string,
    message: string,
  ): Promise<void>;
  listHistory(matchId: string): Promise<StoredHistoryEntry[]>;
}
