import {
  FixtureStatus,
  OddsSnapshotStatus,
  SelectionStatus,
  type MatchSummary,
} from "../../domain/model";
import { AppError } from "../errors";
import { type ImportedEvent } from "../importers/stake/importer";
import {
  type AppStore,
  type CreateMatchInput,
  type StoredHistoryEntry,
  type StoredLiveState,
  type StoredSelection,
  type StoredSnapshot,
} from "./types";

export class MemoryAppStore implements AppStore {
  private readonly matches = new Map<string, MatchSummary>();
  private readonly snapshots = new Map<string, StoredSnapshot[]>();
  private readonly liveStates = new Map<string, StoredLiveState>();
  private readonly history = new Map<string, StoredHistoryEntry[]>();

  async listMatches(): Promise<MatchSummary[]> {
    return [...this.matches.values()].sort((a, b) =>
      a.kickoffAt.localeCompare(b.kickoffAt),
    );
  }

  async createMatch(input: CreateMatchInput): Promise<MatchSummary> {
    const existing = await this.getMatchBySlug(input.slug);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const match: MatchSummary = {
      id: crypto.randomUUID(),
      slug: input.slug,
      title: input.title,
      homeTeamName: input.homeTeamName,
      awayTeamName: input.awayTeamName,
      competitionName: input.competitionName ?? null,
      kickoffAt: new Date(input.kickoffAt).toISOString(),
      timezone: input.timezone,
      status: FixtureStatus.NOT_STARTED,
      stakeUrl: input.stakeUrl,
      stakeEventId: null,
      apiFootballFixtureId: null,
      oddsFreezeOffsetMinutes: input.oddsFreezeOffsetMinutes,
      published: false,
    };
    this.matches.set(match.id, match);
    await this.addHistory(match.id, "match.created", `Partido creado ${now}.`);
    return match;
  }

  async upsertMatchFromImport(
    slug: string,
    imported: ImportedEvent,
    fallback: CreateMatchInput,
  ): Promise<MatchSummary> {
    const existing = await this.getMatchBySlug(slug);
    if (existing) {
      const updated = {
        ...existing,
        homeTeamName: imported.homeTeamName,
        awayTeamName: imported.awayTeamName,
        competitionName: imported.competitionName,
        kickoffAt: imported.kickoffAt ?? existing.kickoffAt,
        stakeEventId: imported.stakeEventId,
      };
      this.matches.set(updated.id, updated);
      return updated;
    }

    const created = await this.createMatch({
      ...fallback,
      slug,
      title: `${imported.homeTeamName} vs ${imported.awayTeamName}`,
      homeTeamName: imported.homeTeamName,
      awayTeamName: imported.awayTeamName,
      competitionName: imported.competitionName,
      kickoffAt: imported.kickoffAt ?? fallback.kickoffAt,
    });
    const updated = { ...created, stakeEventId: imported.stakeEventId };
    this.matches.set(updated.id, updated);
    return updated;
  }

  async getMatchBySlug(slug: string): Promise<MatchSummary | null> {
    return (
      [...this.matches.values()].find((match) => match.slug === slug) ?? null
    );
  }

  async getMatchById(id: string): Promise<MatchSummary | null> {
    return this.matches.get(id) ?? null;
  }

  async getPublishedCurrentMatch(): Promise<MatchSummary | null> {
    return [...this.matches.values()].find((match) => match.published) ?? null;
  }

  async saveImportedSnapshot(
    matchId: string,
    imported: ImportedEvent,
  ): Promise<StoredSnapshot> {
    const match = await this.requireMatch(matchId);
    const existingSnapshots = this.snapshots.get(matchId) ?? [];
    if (
      existingSnapshots.some(
        (snapshot) => snapshot.status === OddsSnapshotStatus.FROZEN,
      )
    ) {
      throw new AppError(
        "STAKE_IMPORT_ALREADY_FROZEN",
        "Odds are already frozen.",
        409,
      );
    }

    const now = new Date().toISOString();
    for (const snapshot of existingSnapshots) {
      if (snapshot.status === OddsSnapshotStatus.ACTIVE) {
        snapshot.status = OddsSnapshotStatus.SUPERSEDED;
      }
    }

    const snapshotId = crypto.randomUUID();
    const snapshot: StoredSnapshot = {
      id: snapshotId,
      matchId,
      status: OddsSnapshotStatus.ACTIVE,
      capturedAt: imported.capturedAt,
      frozenAt: null,
      source: imported.source,
      sourcePayload: imported.rawFixture,
      importVersion: "2026-06-p0",
      errorMessage: null,
      createdAt: now,
      markets: imported.markets.map((market) => ({
        id: crypto.randomUUID(),
        snapshotId,
        matchId,
        marketType: market.marketType,
        rawMarketName: market.rawMarketName,
        sourceMarketId: market.sourceMarketId,
        displayOrder: market.displayOrder,
        supported: market.supported,
        metadata: {},
        selections: market.selections.map(
          (selection): StoredSelection => ({
            ...selection,
            id: crypto.randomUUID(),
            marketId: market.id,
            matchId,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      })),
    };

    this.snapshots.set(matchId, [...existingSnapshots, snapshot]);
    this.matches.set(matchId, {
      ...match,
      homeTeamName: imported.homeTeamName,
      awayTeamName: imported.awayTeamName,
      competitionName: imported.competitionName,
      kickoffAt: imported.kickoffAt ?? match.kickoffAt,
      stakeEventId: imported.stakeEventId,
    });
    await this.addHistory(
      matchId,
      "stake.imported",
      `Cuotas importadas con ${snapshot.markets.length} mercados.`,
    );
    return snapshot;
  }

  async getVisibleSnapshot(matchId: string): Promise<StoredSnapshot | null> {
    const snapshots = this.snapshots.get(matchId) ?? [];
    return (
      snapshots.find(
        (snapshot) => snapshot.status === OddsSnapshotStatus.FROZEN,
      ) ??
      snapshots.findLast(
        (snapshot) => snapshot.status === OddsSnapshotStatus.ACTIVE,
      ) ??
      null
    );
  }

  async freezeOdds(
    matchId: string,
    frozenAt: Date,
    manual: boolean,
  ): Promise<StoredSnapshot> {
    const snapshot = await this.getVisibleSnapshot(matchId);
    if (!snapshot) {
      throw new AppError(
        "STAKE_NO_MARKETS_FOUND",
        "No odds snapshot to freeze.",
        409,
      );
    }
    snapshot.status = OddsSnapshotStatus.FROZEN;
    snapshot.frozenAt = frozenAt.toISOString();
    await this.addHistory(
      matchId,
      "odds.frozen",
      manual
        ? "Cuotas congeladas manualmente."
        : "Cuotas congeladas por corte automatico.",
    );
    return snapshot;
  }

  async confirmFixture(
    matchId: string,
    fixtureId: number,
    confirmedBy: string,
  ): Promise<MatchSummary> {
    const match = await this.requireMatch(matchId);
    const updated = { ...match, apiFootballFixtureId: fixtureId };
    this.matches.set(matchId, updated);
    await this.addHistory(
      matchId,
      "fixture.confirmed",
      `Fixture ${fixtureId} confirmado por ${confirmedBy}.`,
    );
    return updated;
  }

  async publishMatch(matchId: string): Promise<MatchSummary> {
    const match = await this.requireMatch(matchId);
    const snapshot = await this.getVisibleSnapshot(matchId);
    if (!match.apiFootballFixtureId) {
      throw new AppError(
        "FIXTURE_MAPPING_REQUIRED",
        "Fixture mapping is required.",
        409,
      );
    }
    if (snapshot?.status !== OddsSnapshotStatus.FROZEN) {
      throw new AppError(
        "STAKE_IMPORT_ALREADY_FROZEN",
        "Odds must be frozen before publishing.",
        409,
      );
    }
    for (const existing of this.matches.values()) {
      if (existing.published && existing.id !== matchId) {
        this.matches.set(existing.id, { ...existing, published: false });
      }
    }
    const updated = { ...match, published: true };
    this.matches.set(matchId, updated);
    await this.addHistory(matchId, "match.published", "Partido publicado.");
    return updated;
  }

  async saveLiveState(liveState: StoredLiveState): Promise<void> {
    this.liveStates.set(liveState.matchId, liveState);
    const match = await this.getMatchById(liveState.matchId);
    if (match) {
      this.matches.set(match.id, { ...match, status: liveState.fixtureStatus });
    }
  }

  async getLiveState(matchId: string): Promise<StoredLiveState | null> {
    return this.liveStates.get(matchId) ?? null;
  }

  async updateSelectionEvaluations(
    matchId: string,
    evaluations: Array<{
      selectionId: string;
      status: StoredSelection["status"];
      resolvedAt?: string;
      resolvedMinute?: number;
      reason: string;
    }>,
  ): Promise<number> {
    const snapshot = await this.getVisibleSnapshot(matchId);
    if (!snapshot) {
      return 0;
    }

    let changes = 0;
    const bySelection = new Map(
      evaluations.map((evaluation) => [evaluation.selectionId, evaluation]),
    );
    const now = new Date().toISOString();
    for (const market of snapshot.markets) {
      for (const selection of market.selections) {
        const evaluation = bySelection.get(selection.id);
        if (!evaluation) {
          continue;
        }
        if (
          selection.status !== evaluation.status ||
          selection.resolutionReason !== evaluation.reason ||
          selection.resolvedMinute !== evaluation.resolvedMinute
        ) {
          changes += selection.status === SelectionStatus.PENDING ? 1 : 0;
          selection.status = evaluation.status;
          selection.resolvedAt = evaluation.resolvedAt;
          selection.resolvedMinute = evaluation.resolvedMinute;
          selection.resolutionReason = evaluation.reason;
          selection.updatedAt = now;
        }
      }
    }
    return changes;
  }

  async addHistory(
    matchId: string,
    operation: string,
    message: string,
  ): Promise<void> {
    const entries = this.history.get(matchId) ?? [];
    entries.unshift({
      id: crypto.randomUUID(),
      matchId,
      operation,
      message,
      createdAt: new Date().toISOString(),
    });
    this.history.set(matchId, entries.slice(0, 20));
  }

  async listHistory(matchId: string): Promise<StoredHistoryEntry[]> {
    return this.history.get(matchId) ?? [];
  }

  private async requireMatch(matchId: string): Promise<MatchSummary> {
    const match = await this.getMatchById(matchId);
    if (!match) {
      throw new AppError("MATCH_NOT_FOUND", "Match not found.", 404);
    }
    return match;
  }
}
