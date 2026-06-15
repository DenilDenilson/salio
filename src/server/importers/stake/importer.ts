import {
  type NormalizedMarket,
  normalizeStakeMarkets,
} from "../../../domain/markets/normalization";
import { AppError } from "../../errors";
import { StakeApiClient } from "./apiClient";
import { stakeApiPayloadToImportedEvent } from "./apiNormalizer";
import { parseStakeEventHtml } from "./domParser";
import { requireStakeEventId, stakeEventIdFromUrl } from "./endpoint";

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
    stakeApi?: {
      source: "stake-api";
      apiUrlSanitized: string;
      eventId: string;
      fetchedAt: string;
      payloadSha256: string;
      rawArtifactPath?: string;
      payload?: unknown;
    };
  };
}

export interface OddsImporter {
  importEvent(input: {
    url: string;
    stakeApiUrl?: string;
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
  stakeApiAllowedHosts?: string[];
  stakeApiTimeoutMs?: number;
  stakeApiFetchFn?: typeof fetch;
  stakeApiSaveRawPath?: string | null;
  stakeApiSaveRawResponses?: boolean;
  stakeApiMaxResponseBytes?: number;
}

export class StakeImporter implements OddsImporter {
  constructor(private readonly options: StakeImporterOptions) {}

  async importEvent(input: {
    url: string;
    stakeApiUrl?: string;
    capturedAt: Date;
    matchId: string;
    fallbackHomeTeamName?: string;
    fallbackAwayTeamName?: string;
    fallbackCompetitionName?: string | null;
    fallbackKickoffAt?: string | null;
  }): Promise<ImportedEvent> {
    validateStakeUrl(input.url, this.options.allowedHosts);
    const eventId = requireStakeEventId(input.url);
    if (!input.stakeApiUrl) {
      throw new AppError(
        "STAKE_API_URL_NOT_RESOLVED",
        "Missing required --stake-api-url. Provide the complete Stake internal API URL for this event.",
      );
    }

    const savePath =
      this.options.stakeApiSaveRawPath ??
      (this.options.stakeApiSaveRawResponses
        ? `data/evidence/stake-api/${eventId}.json`
        : null);
    const client = new StakeApiClient({
      allowedHosts: this.stakeApiAllowedHosts(),
      timeoutMs: this.options.stakeApiTimeoutMs ?? this.options.timeoutMs,
      fetchFn: this.options.stakeApiFetchFn,
      saveRawApiPath: savePath,
      maxResponseBytes: this.options.stakeApiMaxResponseBytes,
    });
    const fetched = await client.fetchEvent({
      apiUrl: input.stakeApiUrl,
      expectedEventId: eventId,
    });
    const payload = parseJson(fetched.rawText);

    return stakeApiPayloadToImportedEvent({
      payload,
      rawText: fetched.rawText,
      apiUrl: input.stakeApiUrl,
      apiUrlSanitized: fetched.apiUrlSanitized,
      fetchedAt: fetched.fetchedAt,
      payloadSha256: fetched.payloadSha256,
      rawArtifactPath: fetched.rawArtifactPath,
      expectedEventId: eventId,
      sourceUrl: input.url,
      capturedAt: input.capturedAt,
      matchId: input.matchId,
      fallbackHomeTeamName: input.fallbackHomeTeamName,
      fallbackAwayTeamName: input.fallbackAwayTeamName,
      fallbackCompetitionName: input.fallbackCompetitionName,
      fallbackKickoffAt: input.fallbackKickoffAt,
    });
  }

  private stakeApiAllowedHosts(): string[] {
    return this.options.stakeApiAllowedHosts?.length
      ? this.options.stakeApiAllowedHosts
      : [".websbkt.com"];
  }
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

function sanitizeHtmlForDebug(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new AppError(
      "STAKE_API_INVALID_PAYLOAD",
      "Stake API response was not valid JSON.",
    );
  }
}
