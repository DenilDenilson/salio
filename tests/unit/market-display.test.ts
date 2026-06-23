import { describe, expect, it } from "vitest";
import {
  MarketType,
  ParticipantType,
  SelectionOperator,
  SelectionStatus,
  type NormalizedSelection,
} from "../../src/domain/model";
import { selectionDisplayName } from "../../src/domain/markets/display";

function selection(
  overrides: Partial<NormalizedSelection>,
): NormalizedSelection {
  return {
    id: "selection",
    matchId: "match",
    marketType: MarketType.TOTAL_GOALS,
    operator: SelectionOperator.OVER,
    participantType: ParticipantType.MATCH,
    oddDecimal: 2,
    status: SelectionStatus.PENDING,
    rawMarketName: "Total de goles",
    rawSelectionName: "Más de",
    ...overrides,
  };
}

describe("market display labels", () => {
  it("adds missing lines to over/under totals from Stake API snapshots", () => {
    expect(
      selectionDisplayName(
        selection({
          rawSelectionName: "Más de",
          line: 2.5,
        }),
      ),
    ).toBe("Más de 2.5");
    expect(
      selectionDisplayName(
        selection({
          rawSelectionName: "Menos de",
          operator: SelectionOperator.UNDER,
          line: 1.5,
        }),
      ),
    ).toBe("Menos de 1.5");
  });

  it("makes corners, cards and team totals readable when raw names omit lines", () => {
    expect(
      selectionDisplayName(
        selection({
          marketType: MarketType.TOTAL_CORNERS,
          rawSelectionName: "Córners totales SUPERIOR",
          line: 7.5,
        }),
      ),
    ).toBe("Córners totales más de 7.5");
    expect(
      selectionDisplayName(
        selection({
          marketType: MarketType.TOTAL_YELLOW_CARDS,
          rawSelectionName: "Total de cartas amarillas INFERIOR",
          operator: SelectionOperator.UNDER,
          line: 3.5,
        }),
      ),
    ).toBe("Total de cartas amarillas menos de 3.5");
    expect(
      selectionDisplayName(
        selection({
          marketType: MarketType.TEAM_TOTAL_GOALS,
          rawSelectionName: "España total SUPERIOR",
          line: 1.5,
        }),
      ),
    ).toBe("España total más de 1.5");
  });

  it("keeps raw labels that already include the line", () => {
    expect(
      selectionDisplayName(
        selection({
          rawSelectionName: "Más de 2.5",
          line: 2.5,
        }),
      ),
    ).toBe("Más de 2.5");
  });
});
