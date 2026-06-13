import { parse } from "node-html-parser";
import { z } from "zod";
import {
  type RawStakeMarket,
  type RawStakeSelection,
} from "../../../domain/markets/normalization";
import { AppError } from "../../errors";

const StakeSelectionSchema = z.object({
  sourceSelectionId: z.string().optional(),
  oddId: z.string().optional(),
  rawSelectionName: z.string().min(1),
  oddDecimal: z.number().positive(),
  additionalValue: z.string().optional(),
  teamSide: z.string().optional(),
  ttl: z.string().optional(),
  locked: z.boolean(),
});

const StakeMarketSchema = z.object({
  sourceMarketId: z.string().optional(),
  rawMarketName: z.string().min(1),
  displayOrder: z.number().int(),
  selections: z.array(StakeSelectionSchema),
});

export const StakeDomParseResultSchema = z.object({
  eventId: z.string().nullable(),
  homeTeamName: z.string().min(1),
  awayTeamName: z.string().min(1),
  competitionName: z.string().nullable(),
  kickoffAt: z.string().datetime().nullable(),
  markets: z.array(StakeMarketSchema),
});

export type StakeDomParseResult = z.infer<typeof StakeDomParseResultSchema>;

export function parseStakeEventHtml(html: string): StakeDomParseResult {
  const root = parse(html);
  const homeTeamName =
    readMeta(root, "home-team") ??
    root.querySelector("[data-home-team]")?.getAttribute("data-home-team");
  const awayTeamName =
    readMeta(root, "away-team") ??
    root.querySelector("[data-away-team]")?.getAttribute("data-away-team");
  const competitionName =
    readMeta(root, "competition") ??
    root
      .querySelector("[data-competition]")
      ?.getAttribute("data-competition") ??
    null;
  const kickoffAt = readMeta(root, "kickoff-at");
  const eventId =
    readMeta(root, "event-id") ??
    root.querySelector("[data-event-id]")?.getAttribute("data-event-id") ??
    null;

  if (!homeTeamName || !awayTeamName) {
    throw new AppError(
      "STAKE_SCHEMA_CHANGED",
      "Stake HTML does not expose home and away teams.",
    );
  }

  const marketNodes = root.querySelectorAll(
    ".wol-market, [data-market-id][data-market-name]",
  );
  if (marketNodes.length === 0) {
    throw new AppError(
      "STAKE_NO_MARKETS_FOUND",
      "No market nodes found in Stake HTML.",
    );
  }

  const markets: RawStakeMarket[] = marketNodes.map((marketNode, index) => {
    const rawMarketName =
      marketNode.getAttribute("data-market-name") ??
      marketNode
        .querySelector(".market-title, [data-market-title]")
        ?.text.trim() ??
      "";
    if (!rawMarketName) {
      throw new AppError(
        "STAKE_SCHEMA_CHANGED",
        "Market node is missing a name.",
      );
    }

    const selectionNodes = marketNode.querySelectorAll("[data-odd-value]");
    const selections = selectionNodes
      .map((selectionNode): RawStakeSelection | null => {
        const oddValue = selectionNode.getAttribute("data-odd-value");
        const rawSelectionName =
          selectionNode.getAttribute("data-selection-name") ??
          selectionNode
            .querySelector(".selection-name, [data-selection-title]")
            ?.text.trim() ??
          selectionNode.text.trim();
        const sourceSelectionId =
          selectionNode.getAttribute("data-event-odd-id") ??
          selectionNode.getAttribute("data-selection-id") ??
          undefined;
        const oddId = selectionNode.getAttribute("data-odd-id") ?? undefined;
        const locked =
          selectionNode.getAttribute("data-locked") === "true" ||
          selectionNode.getAttribute("aria-disabled") === "true" ||
          selectionNode.classList.contains("locked");

        if (locked && !sourceSelectionId && !oddId) {
          return null;
        }

        if (!oddValue || !rawSelectionName) {
          throw new AppError(
            "STAKE_SCHEMA_CHANGED",
            "Selection node is missing a name or odd value.",
          );
        }

        return StakeSelectionSchema.parse({
          sourceSelectionId,
          oddId,
          rawSelectionName,
          oddDecimal: Number(oddValue.replace(",", ".")),
          additionalValue:
            selectionNode.getAttribute("data-additional-value") ?? undefined,
          teamSide:
            selectionNode.getAttribute("data-odd-team_side") ?? undefined,
          ttl: selectionNode.getAttribute("data-odd-ttl") ?? undefined,
          locked,
        });
      })
      .filter(
        (selection): selection is RawStakeSelection => selection !== null,
      );

    return StakeMarketSchema.parse({
      sourceMarketId: marketNode.getAttribute("data-market-id") ?? undefined,
      rawMarketName,
      displayOrder: index,
      selections: dedupeSelections(selections),
    });
  });

  const parsed = StakeDomParseResultSchema.parse({
    eventId,
    homeTeamName,
    awayTeamName,
    competitionName,
    kickoffAt: kickoffAt ? new Date(kickoffAt).toISOString() : null,
    markets: mergeMarkets(markets),
  });

  if (parsed.markets.every((market) => market.selections.length === 0)) {
    throw new AppError(
      "STAKE_NO_MARKETS_FOUND",
      "Stake HTML did not contain usable selections.",
    );
  }

  return parsed;
}

function readMeta(
  root: ReturnType<typeof parse>,
  key: string,
): string | undefined {
  return (
    root.querySelector(`meta[name="stake:${key}"]`)?.getAttribute("content") ??
    root.querySelector(`[data-${key}]`)?.getAttribute(`data-${key}`) ??
    undefined
  );
}

function mergeMarkets(markets: RawStakeMarket[]): RawStakeMarket[] {
  const merged = new Map<string, RawStakeMarket>();

  for (const market of markets) {
    const key = `${market.sourceMarketId ?? market.rawMarketName}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...market, selections: [...market.selections] });
      continue;
    }
    existing.selections = dedupeSelections([
      ...existing.selections,
      ...market.selections,
    ]);
  }

  return [...merged.values()];
}

function dedupeSelections(
  selections: RawStakeSelection[],
): RawStakeSelection[] {
  const seen = new Set<string>();
  return selections.filter((selection) => {
    const key = `${selection.sourceSelectionId ?? selection.oddId ?? selection.rawSelectionName}-${selection.oddDecimal}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
