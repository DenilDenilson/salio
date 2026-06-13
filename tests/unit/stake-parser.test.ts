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

  it("uses explicit fallbacks when Stake omits event metadata", () => {
    const parsed = parseStakeEventHtml(
      `
        <section class="wol-market" data-market-id="m1" data-market-name="Resultado">
          <button data-odd-value="1.80" data-selection-name="Catar">Catar</button>
          <button data-odd-value="3.40" data-selection-name="Empate">Empate</button>
          <button data-odd-value="4.20" data-selection-name="Suiza">Suiza</button>
        </section>
      `,
      {
        homeTeamName: "Catar",
        awayTeamName: "Suiza",
        competitionName: "Mundial 2026",
        kickoffAt: "2026-06-13T19:00:00.000Z",
        eventId: "21798324",
      },
    );

    expect(parsed).toMatchObject({
      eventId: "21798324",
      homeTeamName: "Catar",
      awayTeamName: "Suiza",
      competitionName: "Mundial 2026",
      kickoffAt: "2026-06-13T19:00:00.000Z",
    });
    expect(parsed.markets[0]?.selections).toHaveLength(3);
  });

  it("infers visible Stake event metadata when explicit fallbacks are omitted", () => {
    const parsed = parseStakeEventHtml(`
      <ol class="wbc-breadcrumbs">
        <li class="wbc-breadcrumb">
          <div class="wbc-breadcrumb__toggle">
            <div class="wbc-breadcrumb__typography">Mundial 2026</div>
          </div>
        </li>
      </ol>
      <section class="wpet">
        <div class="wpet-teams__team__text"><span>Países Bajos vs. Japón</span></div>
      </section>
      <div class="wol-market" data-market-id="1">
        <header class="wol-market__header">
          <div class="wol-market__header__title">Resultado del Partido</div>
        </header>
        <div class="wol-odd" data-event-odd-id="home" data-event-id="21798328" data-odd-value="1.65">
          <span class="wol-odd__info">Países Bajos <b class="purple"></b></span>
        </div>
        <div class="wol-odd" data-event-odd-id="away" data-event-id="21798328" data-odd-value="5.20">
          <span class="wol-odd__info">Japón <b class="purple"></b></span>
        </div>
      </div>
    `);

    expect(parsed).toMatchObject({
      eventId: "21798328",
      homeTeamName: "Países Bajos",
      awayTeamName: "Japón",
      competitionName: "Mundial 2026",
    });
  });

  it("extracts real Stake WOL market titles and odd labels", () => {
    const parsed = parseStakeEventHtml(
      `
        <div class="wol-market" data-market-id="1">
          <header class="wol-market__header">
            <div class="wol-market__header__title">Resultado del Partido</div>
          </header>
          <div class="wol-market__body show">
            <div class="wol-odd" data-event-odd-id="3133857683" data-event-id="21798324" data-odd-value="15.25" data-odd-id="1">
              <div class="wol-odd-changer"><span class="wol-odd__info">Catar <b class="purple"></b></span><span class="wol-odd__value">15.25</span></div>
            </div>
            <div class="wol-odd" data-event-odd-id="3133857682" data-event-id="21798324" data-odd-value="1.17" data-odd-id="2">
              <div class="wol-odd-changer"><span class="wol-odd__info">Suiza <b class="purple"></b></span><span class="wol-odd__value">1.17</span></div>
            </div>
          </div>
        </div>
        <div class="wol-market" data-market-id="6">
          <header class="wol-market__header">
            <div class="wol-market__header__title">Total</div>
          </header>
          <div class="wol-market__body show">
            <div class="wol-odd" data-event-odd-id="3133857871" data-event-id="21798324" data-additional-value="2.5" data-odd-value="1.6" data-odd-id="35" data-odd-ttl="_OVR">
              <div class="wol-odd-changer"><span class="wol-odd__info">Más de <b class="purple"> 2.5</b></span><span class="wol-odd__value">1.60</span></div>
            </div>
          </div>
        </div>
      `,
      {
        homeTeamName: "Catar",
        awayTeamName: "Suiza",
        competitionName: "Mundial 2026",
        kickoffAt: "2026-06-13T19:00:00.000Z",
      },
    );

    expect(parsed.markets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMarketId: "1",
          rawMarketName: "Resultado del Partido",
          selections: expect.arrayContaining([
            expect.objectContaining({
              rawSelectionName: "Catar",
              oddDecimal: 15.25,
            }),
          ]),
        }),
        expect.objectContaining({
          sourceMarketId: "6",
          rawMarketName: "Total",
          selections: expect.arrayContaining([
            expect.objectContaining({
              rawSelectionName: "Más de  2.5",
              additionalValue: "2.5",
              ttl: "_OVR",
            }),
          ]),
        }),
      ]),
    );
  });
});
