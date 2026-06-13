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

  it("drops markets without selections", () => {
    const markets = normalizeStakeMarkets({
      matchId: "empty-market",
      homeTeamName: "Haití",
      awayTeamName: "Escocia",
      markets: [
        {
          rawMarketName: "Resultado del Partido",
          displayOrder: 0,
          selections: [],
        },
        {
          rawMarketName: "Resultado del Partido",
          displayOrder: 1,
          selections: [
            {
              rawSelectionName: "Escocia",
              oddDecimal: 1.52,
              locked: false,
            },
          ],
        },
      ],
    });

    expect(markets).toHaveLength(1);
    expect(markets[0]?.selections).toHaveLength(1);
  });

  it("handles accents, casing and spaces", () => {
    expect(normalizeText("  TÓtal   de Córners ")).toBe("total de corners");
    expect(detectMarketType("TOTAL DE CÓRNERS")).toBe(MarketType.TOTAL_CORNERS);
    expect(detectMarketType("Total de esquinas")).toBe(
      MarketType.TOTAL_CORNERS,
    );
    expect(detectMarketType("Total tarjetas amarillas")).toBe(
      MarketType.TOTAL_YELLOW_CARDS,
    );
    expect(detectMarketType("Total")).toBe(MarketType.TOTAL_GOALS);
    expect(detectMarketType(" ambos   equipos MARCAN ")).toBe(
      MarketType.BOTH_TEAMS_TO_SCORE,
    );
    expect(detectMarketType("Ambos equipos anotan")).toBe(
      MarketType.BOTH_TEAMS_TO_SCORE,
    );
    expect(detectMarketType("Total del Local")).toBe(
      MarketType.TEAM_TOTAL_GOALS,
    );
    expect(detectMarketType("Total de Goles del Visitante")).toBe(
      MarketType.TEAM_TOTAL_GOALS,
    );
    expect(detectMarketType("1er mitad - Total de goles")).toBe(
      MarketType.FIRST_HALF_TOTAL_GOALS,
    );
    expect(detectMarketType("Equipo - Primer gol")).toBe(
      MarketType.FIRST_TEAM_TO_SCORE,
    );
  });

  it("normalizes real Stake WOL labels", () => {
    const markets = normalizeStakeMarkets({
      matchId: "catar-suiza",
      homeTeamName: "Catar",
      awayTeamName: "Suiza",
      markets: [
        {
          sourceMarketId: "222",
          rawMarketName: "Ambos equipos anotan",
          displayOrder: 0,
          selections: [
            {
              sourceSelectionId: "yes",
              rawSelectionName: "Ambos equipos marcan - SÍ",
              oddDecimal: 2.35,
              locked: false,
            },
            {
              sourceSelectionId: "no",
              rawSelectionName: "Ambos equipos marcan - NO",
              oddDecimal: 1.55,
              locked: false,
            },
          ],
        },
        {
          sourceMarketId: "6",
          rawMarketName: "Total",
          displayOrder: 1,
          selections: [
            {
              sourceSelectionId: "over",
              rawSelectionName: "Más de  2.5",
              oddDecimal: 1.6,
              additionalValue: "2.5",
              ttl: "_OVR",
              locked: false,
            },
          ],
        },
      ],
    });

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
      markets.find((market) => market.marketType === MarketType.TOTAL_GOALS)
        ?.selections[0],
    ).toEqual(
      expect.objectContaining({
        operator: SelectionOperator.OVER,
        line: 2.5,
      }),
    );
  });

  it("normalizes real Stake team totals with compound and accented team names", () => {
    const markets = normalizeStakeMarkets({
      matchId: "paises-bajos-japon",
      homeTeamName: "Países Bajos",
      awayTeamName: "Japón",
      markets: [
        {
          sourceMarketId: "426",
          rawMarketName: "Total del Local",
          displayOrder: 0,
          selections: [
            {
              sourceSelectionId: "home-over",
              rawSelectionName: "Países Bajos total SUPERIOR 1.5",
              oddDecimal: 2,
              additionalValue: "1.5",
              teamSide: "1",
              ttl: "_OVR",
              locked: false,
            },
            {
              sourceSelectionId: "home-under",
              rawSelectionName: "Total INFERIOR 1.5",
              oddDecimal: 1.8,
              additionalValue: "1.5",
              teamSide: "1",
              ttl: "_UND",
              locked: false,
            },
          ],
        },
        {
          sourceMarketId: "427",
          rawMarketName: "Total de Goles del Visitante",
          displayOrder: 1,
          selections: [
            {
              sourceSelectionId: "away-under",
              rawSelectionName: "Japón total INFERIOR 0.5",
              oddDecimal: 2.75,
              additionalValue: "0.5",
              teamSide: "2",
              ttl: "_UND",
              locked: false,
            },
          ],
        },
      ],
    });

    const teamTotals = markets.filter(
      (market) => market.marketType === MarketType.TEAM_TOTAL_GOALS,
    );

    expect(teamTotals).toHaveLength(2);
    expect(teamTotals.flatMap((market) => market.selections)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operator: SelectionOperator.OVER,
          participantType: ParticipantType.HOME_TEAM,
          participantName: "Países Bajos",
          line: 1.5,
        }),
        expect.objectContaining({
          operator: SelectionOperator.UNDER,
          participantType: ParticipantType.HOME_TEAM,
          participantName: "Países Bajos",
          line: 1.5,
        }),
        expect.objectContaining({
          operator: SelectionOperator.UNDER,
          participantType: ParticipantType.AWAY_TEAM,
          participantName: "Japón",
          line: 0.5,
        }),
      ]),
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
