import { readFile } from "node:fs/promises";
import {
  type NormalizedMarket,
  normalizeStakeMarkets,
} from "../../../domain/markets/normalization";
import { AppError } from "../../errors";
import { parseStakeEventHtml } from "./domParser";

export interface ImportedEvent {
  source: "stake";
  sourceUrl: string;
  stakeEventId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  competitionName: string | null;
  kickoffAt: string | null;
  capturedAt: string;
  markets: NormalizedMarket[];
  rawFixture: {
    html?: string;
    networkPayloads?: unknown[];
  };
}

export interface OddsImporter {
  importEvent(input: {
    url: string;
    capturedAt: Date;
    matchId: string;
  }): Promise<ImportedEvent>;
}

export interface StakeImporterOptions {
  allowedHosts: string[];
  timeoutMs: number;
  browserWsEndpoint?: string;
  fixtureHtmlPath?: string;
}

export class StakeImporter implements OddsImporter {
  constructor(private readonly options: StakeImporterOptions) {}

  async importEvent(input: {
    url: string;
    capturedAt: Date;
    matchId: string;
  }): Promise<ImportedEvent> {
    validateStakeUrl(input.url, this.options.allowedHosts);

    if (this.options.fixtureHtmlPath) {
      const html = await readFile(this.options.fixtureHtmlPath, "utf8");
      return importStakeHtml({
        html,
        url: input.url,
        capturedAt: input.capturedAt,
        matchId: input.matchId,
      });
    }

    return this.importWithPlaywright(input);
  }

  /* v8 ignore start */
  private async importWithPlaywright(input: {
    url: string;
    capturedAt: Date;
    matchId: string;
  }): Promise<ImportedEvent> {
    const timeoutMs = this.options.timeoutMs;
    const payloads: unknown[] = [];

    try {
      const playwright = await import("playwright");
      const browser = this.options.browserWsEndpoint
        ? await playwright.chromium.connect(this.options.browserWsEndpoint, {
            timeout: timeoutMs,
          })
        : await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.setDefaultTimeout(timeoutMs);

      page.on("response", (response) => {
        const request = response.request();
        if (!["xhr", "fetch"].includes(request.resourceType())) {
          return;
        }
        response
          .json()
          .then((payload: unknown) => {
            if (looksLikeStakeMarkets(payload)) {
              payloads.push(payload);
            }
          })
          .catch(() => undefined);
      });

      await page.goto(input.url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await page
        .waitForLoadState("networkidle", { timeout: timeoutMs })
        .catch(() => undefined);
      const html = await page.content();
      await browser.close();

      if (payloads.length > 0) {
        const fromHtml = importStakeHtml({
          html,
          url: input.url,
          capturedAt: input.capturedAt,
          matchId: input.matchId,
        });
        return { ...fromHtml, rawFixture: { html, networkPayloads: payloads } };
      }

      return importStakeHtml({
        html,
        url: input.url,
        capturedAt: input.capturedAt,
        matchId: input.matchId,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        "STAKE_PAGE_TIMEOUT",
        error instanceof Error ? error.message : "Stake import timed out.",
      );
    }
  }
  /* v8 ignore stop */
}

export function importStakeHtml(input: {
  html: string;
  url: string;
  capturedAt: Date;
  matchId: string;
}): ImportedEvent {
  const parsed = parseStakeEventHtml(input.html);
  return {
    source: "stake",
    sourceUrl: input.url,
    stakeEventId: parsed.eventId,
    homeTeamName: parsed.homeTeamName,
    awayTeamName: parsed.awayTeamName,
    competitionName: parsed.competitionName,
    kickoffAt: parsed.kickoffAt,
    capturedAt: input.capturedAt.toISOString(),
    markets: normalizeStakeMarkets({
      matchId: input.matchId,
      homeTeamName: parsed.homeTeamName,
      awayTeamName: parsed.awayTeamName,
      markets: parsed.markets,
    }),
    rawFixture: { html: sanitizeHtmlForDebug(input.html) },
  };
}

export function validateStakeUrl(url: string, allowedHosts: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("STAKE_INVALID_URL", "Invalid Stake URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new AppError("STAKE_INVALID_URL", "Stake imports require HTTPS.");
  }

  if (!allowedHosts.includes(parsed.hostname)) {
    throw new AppError("STAKE_INVALID_URL", "Stake host is not allowed.");
  }

  return parsed;
}

/* v8 ignore start */
function looksLikeStakeMarkets(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const json = JSON.stringify(payload).toLowerCase();
  return json.includes("market") && json.includes("odd");
}
/* v8 ignore stop */

function sanitizeHtmlForDebug(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
