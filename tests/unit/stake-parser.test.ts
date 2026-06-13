import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStakeEventHtml } from "../../src/server/importers/stake/domParser";
import { AppError } from "../../src/server/errors";

const fixturePath = join(
  process.cwd(),
  "tests/fixtures/stake/event-21798323-main-markets.html",
);

describe("Stake DOM parser", () => {
  it("extracts market names, ids, selections and decimal odds", () => {
    const parsed = parseStakeEventHtml(readFileSync(fixturePath, "utf8"));
    const result = parsed.markets.find(
      (market) => market.sourceMarketId === "m-result",
    );

    expect(parsed.eventId).toBe("21798323");
    expect(parsed.homeTeamName).toBe("Estados Unidos");
    expect(result?.rawMarketName).toBe("Resultado");
    expect(result?.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSelectionId: "s-home",
          rawSelectionName: "Estados Unidos",
          oddDecimal: 2.1,
        }),
        expect.objectContaining({
          sourceSelectionId: "s-draw",
          rawSelectionName: "Empate",
          oddDecimal: 3.15,
        }),
        expect.objectContaining({
          sourceSelectionId: "s-away",
          rawSelectionName: "Paraguay",
          oddDecimal: 3.75,
        }),
      ]),
    );
  });

  it("extracts data-additional-value and _OVR/_UND tokens", () => {
    const parsed = parseStakeEventHtml(readFileSync(fixturePath, "utf8"));
    const totals = parsed.markets.find(
      (market) => market.sourceMarketId === "m-total-goals",
    );

    expect(totals?.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawSelectionName: "Más de 2.5",
          additionalValue: "2.5",
          ttl: "_OVR",
        }),
        expect.objectContaining({
          rawSelectionName: "Menos de 2.5",
          additionalValue: "2.5",
          ttl: "_UND",
        }),
      ]),
    );
  });

  it("skips locked selections without ids and keeps deterministic output", () => {
    const html = readFileSync(fixturePath, "utf8");
    const first = parseStakeEventHtml(html);
    const second = parseStakeEventHtml(html);
    const locked = first.markets.find(
      (market) => market.sourceMarketId === "m-locked",
    );

    expect(locked?.selections).toHaveLength(0);
    expect(second).toEqual(first);
  });

  it("detects HTML without markets", () => {
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/stake/no-markets.html"),
      "utf8",
    );
    expect(() => parseStakeEventHtml(html)).toThrow(AppError);
    try {
      parseStakeEventHtml(html);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("STAKE_NO_MARKETS_FOUND");
    }
  });

  it("detects schema changes", () => {
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/stake/schema-changed.html"),
      "utf8",
    );
    expect(() => parseStakeEventHtml(html)).toThrow(AppError);
  });

  it("merges duplicated market rows and rejects incomplete selections", () => {
    const duplicateHtml = `
      <html><head>
        <meta name="stake:home-team" content="Estados Unidos" />
        <meta name="stake:away-team" content="Paraguay" />
      </head><body>
        <section class="wol-market" data-market-id="dup" data-market-name="Resultado">
          <button data-event-odd-id="a" data-selection-name="Estados Unidos" data-odd-value="2.10">Estados Unidos</button>
        </section>
        <section class="wol-market" data-market-id="dup" data-market-name="Resultado">
          <button data-event-odd-id="b" data-selection-name="Empate" data-odd-value="3.10">Empate</button>
        </section>
      </body></html>`;
    const parsed = parseStakeEventHtml(duplicateHtml);
    expect(parsed.markets).toHaveLength(1);
    expect(parsed.markets[0]?.selections).toHaveLength(2);

    const brokenSelection = duplicateHtml.replace(
      '<button data-event-odd-id="b" data-selection-name="Empate" data-odd-value="3.10">Empate</button>',
      '<button data-event-odd-id="b" data-odd-value="3.10"></button>',
    );
    expect(() => parseStakeEventHtml(brokenSelection)).toThrow(AppError);
  });
});
