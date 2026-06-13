import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MarketType,
  ParticipantType,
  SelectionOperator,
  SelectionStatus,
} from "../../src/domain/model";
import {
  detectMarketType,
  normalizeStakeMarkets,
  normalizeText,
} from "../../src/domain/markets/normalization";
import { parseStakeEventHtml } from "../../src/server/importers/stake/domParser";

function normalized() {
  const parsed = parseStakeEventHtml(
    readFileSync(
      join(
        process.cwd(),
        "tests/fixtures/stake/event-21798323-main-markets.html",
      ),
      "utf8",
    ),
  );
  return normalizeStakeMarkets({
    matchId: "match-1",
    homeTeamName: parsed.homeTeamName,
    awayTeamName: parsed.awayTeamName,
    markets: parsed.markets,
  });
}

describe("Stake normalization", () => {
  it("normalizes P0 markets and expected fixture values", () => {
    const markets = normalized();
    const result = markets.find(
      (market) => market.marketType === MarketType.MATCH_RESULT,
    );
    const goals = markets.find(
      (market) => market.marketType === MarketType.TOTAL_GOALS,
    );

    expect(result?.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operator: SelectionOperator.HOME,
          oddDecimal: 2.1,
        }),
        expect.objectContaining({
          operator: SelectionOperator.DRAW,
          oddDecimal: 3.15,
        }),
        expect.objectContaining({
          operator: SelectionOperator.AWAY,
          oddDecimal: 3.75,
        }),
      ]),
    );
    expect(goals?.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operator: SelectionOperator.OVER,
          line: 2.5,
          oddDecimal: 2.45,
        }),
        expect.objectContaining({
          operator: SelectionOperator.UNDER,
          line: 2.5,
          oddDecimal: 1.55,
        }),
      ]),
    );
  });

  it("normalizes double chance, draw no bet, btts, first goal, cards and corners", () => {
    const markets = normalized();
    expect(
      markets.find((market) => market.marketType === MarketType.DOUBLE_CHANCE)
        ?.selections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: SelectionOperator.HOME_OR_DRAW }),
        expect.objectContaining({ operator: SelectionOperator.HOME_OR_AWAY }),
        expect.objectContaining({ operator: SelectionOperator.DRAW_OR_AWAY }),
      ]),
    );
    expect(
      markets.find((market) => market.marketType === MarketType.DRAW_NO_BET)
        ?.selections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: SelectionOperator.HOME }),
        expect.objectContaining({ operator: SelectionOperator.AWAY }),
      ]),
    );
    expect(
      markets.find(
        (market) => market.marketType === MarketType.BOTH_TEAMS_TO_SCORE,
      )?.selections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: SelectionOperator.YES }),
        expect.objectContaining({ operator: SelectionOperator.NO }),
      ]),
    );
    expect(
      markets.find(
        (market) => market.marketType === MarketType.FIRST_TEAM_TO_SCORE,
      )?.selections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: SelectionOperator.HOME }),
        expect.objectContaining({ operator: SelectionOperator.AWAY }),
        expect.objectContaining({ operator: SelectionOperator.NO }),
      ]),
    );
    expect(
      markets.find(
        (market) => market.marketType === MarketType.TOTAL_YELLOW_CARDS,
      )?.selections[0]?.line,
    ).toBe(4.5);
    expect(
      markets.find((market) => market.marketType === MarketType.TOTAL_CORNERS)
        ?.selections[0]?.line,
    ).toBe(8.5);
  });

  it("keeps raw fields and marks unknown commercial markets as unsupported", () => {
    const unsupported = normalized().find(
      (market) => market.marketType === MarketType.UNSUPPORTED,
    );
    expect(unsupported?.supported).toBe(false);
    expect(unsupported?.selections[0]).toEqual(
      expect.objectContaining({
        status: SelectionStatus.UNSUPPORTED,
        rawMarketName: "Early Payout por ventaja",
        rawSelectionName: "Promoción especial",
      }),
    );
  });

  it("handles accents, casing and spaces", () => {
    expect(normalizeText("  TÓtal   de Córners ")).toBe("total de corners");
    expect(detectMarketType("TOTAL DE CÓRNERS")).toBe(MarketType.TOTAL_CORNERS);
    expect(detectMarketType(" ambos   equipos MARCAN ")).toBe(
      MarketType.BOTH_TEAMS_TO_SCORE,
    );
  });

  it("does not confuse partial team names", () => {
    const markets = normalizeStakeMarkets({
      matchId: "partial",
      homeTeamName: "Estados Unidos",
      awayTeamName: "Paraguay",
      markets: [
        {
          rawMarketName: "Resultado",
          displayOrder: 0,
          selections: [
            { rawSelectionName: "Estados", oddDecimal: 2, locked: false },
          ],
        },
      ],
    });
    expect(markets[0]?.selections[0]?.participantType).toBe(
      ParticipantType.MATCH,
    );
    expect(markets[0]?.selections[0]?.operator).toBe(SelectionOperator.DRAW);
  });
});
