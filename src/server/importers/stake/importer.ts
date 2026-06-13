import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  type NormalizedMarket,
  normalizeStakeMarkets,
} from "../../../domain/markets/normalization";
import { AppError } from "../../errors";
import { parseStakeEventHtml } from "./domParser";

type PlaywrightModule = typeof import("playwright");

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
    fallbackHomeTeamName?: string;
    fallbackAwayTeamName?: string;
    fallbackCompetitionName?: string | null;
    fallbackKickoffAt?: string | null;
  }): Promise<ImportedEvent>;
}

export interface StakeImporterOptions {
  allowedHosts: string[];
  timeoutMs: number;
  browserWsEndpoint?: string;
  headless?: boolean;
  fixtureHtmlPath?: string;
  debugHtmlPath?: string;
}

export class StakeImporter implements OddsImporter {
  constructor(private readonly options: StakeImporterOptions) {}

  async importEvent(input: {
    url: string;
    capturedAt: Date;
    matchId: string;
    fallbackHomeTeamName?: string;
    fallbackAwayTeamName?: string;
    fallbackCompetitionName?: string | null;
    fallbackKickoffAt?: string | null;
  }): Promise<ImportedEvent> {
    validateStakeUrl(input.url, this.options.allowedHosts);

    if (this.options.fixtureHtmlPath) {
      const html = await readFile(this.options.fixtureHtmlPath, "utf8");
      return importStakeHtml({
        html,
        url: input.url,
        capturedAt: input.capturedAt,
        matchId: input.matchId,
        fallbackHomeTeamName: input.fallbackHomeTeamName,
        fallbackAwayTeamName: input.fallbackAwayTeamName,
        fallbackCompetitionName: input.fallbackCompetitionName,
        fallbackKickoffAt: input.fallbackKickoffAt,
      });
    }

    return this.importWithPlaywright(input);
  }

  /* v8 ignore start */
  private async importWithPlaywright(input: {
    url: string;
    capturedAt: Date;
    matchId: string;
    fallbackHomeTeamName?: string;
    fallbackAwayTeamName?: string;
    fallbackCompetitionName?: string | null;
    fallbackKickoffAt?: string | null;
  }): Promise<ImportedEvent> {
    const timeoutMs = this.options.timeoutMs;
    const payloads: unknown[] = [];
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let shouldCloseBrowser = false;
    let shouldCloseContext = false;

    try {
      const playwright = await import("playwright");
      const session = await openBrowserSession(
        playwright,
        this.options,
        timeoutMs,
      );
      browser = session.browser;
      context =
        session.context ??
        (await browser.newContext({
          locale: "es-PE",
          timezoneId: "America/Lima",
          viewport: { width: 1640, height: 950 },
        }));
      shouldCloseBrowser = session.shouldCloseBrowser;
      shouldCloseContext = session.context === null;
      page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      await page.setViewportSize({ width: 1640, height: 950 }).catch(() => {
        return undefined;
      });

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
      await dismissStakeOverlays(page);
      await page
        .waitForLoadState("networkidle", { timeout: timeoutMs })
        .catch(() => undefined);
      await dismissStakeOverlays(page);
      await page
        .waitForSelector(".wol-market, [data-market-id][data-market-name]", {
          timeout: timeoutMs,
        })
        .catch(() => undefined);
      const html = await page.content();
      if (this.options.debugHtmlPath) {
        await mkdir(dirname(this.options.debugHtmlPath), { recursive: true });
        await writeFile(this.options.debugHtmlPath, html, "utf8");
      }

      if (payloads.length > 0) {
        const fromHtml = importStakeHtml({
          html,
          url: input.url,
          capturedAt: input.capturedAt,
          matchId: input.matchId,
          fallbackHomeTeamName: input.fallbackHomeTeamName,
          fallbackAwayTeamName: input.fallbackAwayTeamName,
          fallbackCompetitionName: input.fallbackCompetitionName,
          fallbackKickoffAt: input.fallbackKickoffAt,
        });
        return { ...fromHtml, rawFixture: { html, networkPayloads: payloads } };
      }

      return importStakeHtml({
        html,
        url: input.url,
        capturedAt: input.capturedAt,
        matchId: input.matchId,
        fallbackHomeTeamName: input.fallbackHomeTeamName,
        fallbackAwayTeamName: input.fallbackAwayTeamName,
        fallbackCompetitionName: input.fallbackCompetitionName,
        fallbackKickoffAt: input.fallbackKickoffAt,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        "STAKE_PAGE_TIMEOUT",
        error instanceof Error ? error.message : "Stake import timed out.",
      );
    } finally {
      await page?.close().catch(() => undefined);
      if (shouldCloseContext) {
        await context?.close().catch(() => undefined);
      }
      if (shouldCloseBrowser) {
        await browser?.close().catch(() => undefined);
      }
    }
  }
  /* v8 ignore stop */
}

/* v8 ignore start */
async function openBrowserSession(
  playwright: PlaywrightModule,
  options: StakeImporterOptions,
  timeoutMs: number,
): Promise<{
  browser: Browser;
  context: BrowserContext | null;
  shouldCloseBrowser: boolean;
}> {
  if (!options.browserWsEndpoint) {
    const browser = await playwright.chromium.launch({
      headless: options.headless ?? true,
    });
    return { browser, context: null, shouldCloseBrowser: true };
  }

  if (isCdpEndpoint(options.browserWsEndpoint)) {
    const browser = await playwright.chromium.connectOverCDP(
      options.browserWsEndpoint,
      { timeout: timeoutMs },
    );
    return {
      browser,
      context: browser.contexts()[0] ?? null,
      shouldCloseBrowser: true,
    };
  }

  const browser = await playwright.chromium.connect(options.browserWsEndpoint, {
    timeout: timeoutMs,
  });
  return { browser, context: null, shouldCloseBrowser: true };
}

function isCdpEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith("http://") ||
    endpoint.startsWith("https://") ||
    endpoint.includes("/devtools/browser/")
  );
}
/* v8 ignore stop */

type PlaywrightPage = {
  locator: (selector: string) => {
    first: () => {
      click: (options?: { timeout?: number }) => Promise<unknown>;
    };
  };
  waitForTimeout: (timeout: number) => Promise<unknown>;
};

async function dismissStakeOverlays(page: PlaywrightPage): Promise<void> {
  for (const selector of [
    "#gdpr-snackbar-accept",
    'button:has-text("Aceptar")',
    '[data-testid="styled-banner"] [aria-label="Cerrar"]',
    '[aria-label="Cerrar"][role="button"]',
  ]) {
    await page
      .locator(selector)
      .first()
      .click({ timeout: 800 })
      .catch(() => undefined);
  }
  await page.waitForTimeout(250).catch(() => undefined);
}

export function importStakeHtml(input: {
  html: string;
  url: string;
  capturedAt: Date;
  matchId: string;
  fallbackHomeTeamName?: string;
  fallbackAwayTeamName?: string;
  fallbackCompetitionName?: string | null;
  fallbackKickoffAt?: string | null;
}): ImportedEvent {
  const parsed = parseStakeEventHtml(input.html, {
    homeTeamName: input.fallbackHomeTeamName,
    awayTeamName: input.fallbackAwayTeamName,
    competitionName: input.fallbackCompetitionName,
    kickoffAt: input.fallbackKickoffAt,
    eventId: stakeEventIdFromUrl(input.url),
  });
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

function stakeEventIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const eventIndex = segments.lastIndexOf("event");
    return eventIndex >= 0 ? (segments[eventIndex + 1] ?? null) : null;
  } catch {
    return null;
  }
}
