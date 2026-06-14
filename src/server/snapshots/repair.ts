import { MarketType, SelectionStatus } from "../../domain/model";
import { MatchSnapshotSchema, type MatchSnapshot } from "./schema";

export function resetContaminatedSnapshot(
  snapshot: MatchSnapshot,
): MatchSnapshot {
  return MatchSnapshotSchema.parse({
    ...snapshot,
    phase: "odds_captured",
    sportsData: {
      provider: "espn",
      eventId: null,
      leagueSlug: null,
      sourceUrl: null,
    },
    result: null,
    metadata: {
      ...snapshot.metadata,
      finalizedAt: null,
      lastEvaluatedAt: null,
    },
    odds: {
      ...snapshot.odds,
      markets: snapshot.odds.markets.map((market) => ({
        ...market,
        selections: market.selections.map((selection) => {
          const unsupported =
            selection.status === SelectionStatus.UNSUPPORTED ||
            selection.marketType === MarketType.UNSUPPORTED ||
            !market.supported;
          const cleaned = {
            ...selection,
            status: unsupported
              ? SelectionStatus.UNSUPPORTED
              : SelectionStatus.PENDING,
          };
          delete cleaned.resolvedAt;
          delete cleaned.resolvedMinute;
          if (!unsupported) {
            delete cleaned.resolutionReason;
          }
          return cleaned;
        }),
      })),
    },
  });
}
