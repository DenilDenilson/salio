import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { FixtureStatus } from "../../../domain/model";
import { AppError } from "../../errors";
import { playerIdFromName, providerNameSimilarity } from "../teamNormalization";
import {
  type LiveSportsProvider,
  type ProviderEvent,
  type ProviderFixture,
  type ProviderPlayerStats,
  type ProviderTeamStats,
  type ResultEvidence,
} from "../types";
import {
  assertNoAmbiguousExtraTimeOrPenalties,
  emptyTeamMatchStatistics,
  mapEspnEventType,
  mapEspnFixtureStatus,
  mapEspnTeamStatistics,
  parseEspnScore,
  readClock,
  readEspnStatistic,
} from "./mappings";
import {
  EspnSummarySchema,
  type EspnBoxscoreTeam,
  type EspnClock,
  type EspnCommentaryItem,
  type EspnCompetitor,
  type EspnCompetition,
  type EspnPlay,
  type EspnRoster,
  type EspnSummary,
  type EspnTeam,
} from "./schemas";

const DEFAULT_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const DEFAULT_LEAGUE_SLUG = "fifa.world";
const DEFAULT_USER_AGENT = "stake-match-tracker/0.1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

type TeamSide = "HOME" | "AWAY";

export interface EspnSportsProviderOptions {
  baseUrl?: string;
  leagueSlug?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  rawArtifactDirectory?: string;
  evidenceDirectory?: string | null;
  fetchFn?: typeof fetch;
}

interface SummaryArtifact {
  data: EspnSummary;
  evidence: ResultEvidence;
}

interface TeamIdentity {
  id?: string;
  names: string[];
}

interface TeamIndex {
  home: TeamIdentity;
  away: TeamIdentity;
}

interface EventCandidate {
  play: EspnPlay;
  fallbackClock?: EspnClock;
  fallbackText?: string;
  sequence?: number;
  sourceIndex: number;
  sourceRank: number;
}

interface MappedEvent {
  event: ProviderEvent;
  rawEventId: string;
  sortSeconds: number;
  sequence: number;
  sourceRank: number;
  sourceIndex: number;
}

export class EspnSportsProvider implements LiveSportsProvider {
  private readonly summaryCache = new Map<string, Promise<SummaryArtifact>>();

  constructor(private readonly options: EspnSportsProviderOptions = {}) {}

  async getFixture(eventId: string): Promise<ProviderFixture> {
    const artifact = await this.getSummaryArtifact(eventId);
    const competition = primaryCompetition(artifact.data);
    assertNoAmbiguousExtraTimeOrPenalties(competition);
    const home = requireCompetitor(competition, "home");
    const away = requireCompetitor(competition, "away");
    const status = mapEspnFixtureStatus(competition.status?.type);
    const homeScore = parseEspnScore(home.score);
    const awayScore = parseEspnScore(away.score);
    const halftimeHome = parseEspnScore(home.linescores?.[0]?.displayValue);
    const halftimeAway = parseEspnScore(away.linescores?.[0]?.displayValue);

    if (
      status.status === FixtureStatus.FINISHED &&
      (homeScore === null || awayScore === null)
    ) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "ESPN finished fixture is missing final score.",
      );
    }

    return {
      eventId: artifact.data.header.id,
      sourceUrl: artifact.evidence.sourceUrl,
      evidence: artifact.evidence,
      status: status.status,
      providerStatus: status.providerStatus,
      elapsedMinutes: status.elapsedMinutes,
      homeTeamId: home.id ?? home.team?.id,
      awayTeamId: away.id ?? away.team?.id,
      homeTeamName: teamDisplayName(home),
      awayTeamName: teamDisplayName(away),
      competitionName: artifact.data.header.league?.name ?? null,
      leagueSlug: artifact.data.header.league?.slug ?? null,
      score: {
        home: homeScore,
        away: awayScore,
        halftimeHome,
        halftimeAway,
      },
      regulationScore: {
        home: homeScore,
        away: awayScore,
      },
      finalScore: {
        home: homeScore,
        away: awayScore,
      },
      shootoutScore: null,
      kickoffAt: isoDateString(competition.date),
      lastUpdatedAt:
        artifact.data.meta?.lastUpdatedAt ?? artifact.evidence.fetchedAt,
    };
  }

  async getEvents(eventId: string): Promise<ProviderEvent[]> {
    const artifact = await this.getSummaryArtifact(eventId);
    const competition = primaryCompetition(artifact.data);
    const teams = teamIndexFromCompetition(competition);
    const mapped = collectEventCandidates(artifact.data)
      .map((candidate) => this.mapEventCandidate(eventId, teams, candidate))
      .filter((event): event is MappedEvent => event !== null);

    const seen = new Set<string>();
    return mapped
      .filter((event) => {
        if (seen.has(event.rawEventId)) {
          return false;
        }
        seen.add(event.rawEventId);
        return true;
      })
      .sort(compareMappedEvents)
      .map((event) => event.event);
  }

  async getTeamStatistics(eventId: string): Promise<ProviderTeamStats> {
    const artifact = await this.getSummaryArtifact(eventId);
    const competition = primaryCompetition(artifact.data);
    const teams = teamIndexFromCompetition(competition);
    const home = findBoxscoreTeam(artifact.data, "HOME", teams);
    const away = findBoxscoreTeam(artifact.data, "AWAY", teams);
    const homeStats = home?.statistics
      ? mapEspnTeamStatistics(home.statistics)
      : emptyTeamMatchStatistics();
    const awayStats = away?.statistics
      ? mapEspnTeamStatistics(away.statistics)
      : emptyTeamMatchStatistics();

    return {
      home: homeStats,
      away: awayStats,
      yellowCards: {
        home: homeStats.yellowCards,
        away: awayStats.yellowCards,
      },
      corners: {
        home: homeStats.corners,
        away: awayStats.corners,
      },
      shotsOnTarget: {
        home: homeStats.shotsOnTarget,
        away: awayStats.shotsOnTarget,
      },
    };
  }

  async getPlayerStatistics(eventId: string): Promise<ProviderPlayerStats[]> {
    const artifact = await this.getSummaryArtifact(eventId);
    const competition = primaryCompetition(artifact.data);
    const teams = teamIndexFromCompetition(competition);
    const players = (artifact.data.rosters ?? []).flatMap((roster) =>
      mapRosterPlayers(roster, teams),
    );
    return dedupePlayers(players);
  }

  private async getSummaryArtifact(eventId: string): Promise<SummaryArtifact> {
    const normalizedEventId = normalizeEventId(eventId);
    const cached = this.summaryCache.get(normalizedEventId);
    if (cached) {
      return cached;
    }

    const request = this.fetchSummaryArtifact(normalizedEventId);
    this.summaryCache.set(normalizedEventId, request);
    request.catch(() => this.summaryCache.delete(normalizedEventId));
    return request;
  }

  private async fetchSummaryArtifact(
    eventId: string,
  ): Promise<SummaryArtifact> {
    const sourceUrl = this.summaryUrl(eventId).toString();
    const { rawText, fetchedAt } = await this.fetchRawSummary(sourceUrl);
    const payload = parseJson(rawText);
    const parsed = EspnSummarySchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "Invalid ESPN summary response.",
      );
    }
    const competition = primaryCompetition(parsed.data);
    if (parsed.data.header.id !== eventId || competition.id !== eventId) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "ESPN summary event id does not match request.",
      );
    }

    const rawArtifactPath = await this.writeRawArtifact(eventId, rawText);

    return {
      data: parsed.data,
      evidence: {
        provider: "espn",
        eventId,
        sourceUrl,
        fetchedAt,
        payloadSha256: sha256(rawText),
        rawArtifactPath,
      },
    };
  }

  private async fetchRawSummary(
    sourceUrl: string,
  ): Promise<{ rawText: string; fetchedAt: string }> {
    const maxRetries = this.options.maxRetries ?? DEFAULT_MAX_RETRIES;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await (this.options.fetchFn ?? fetch)(sourceUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": this.options.userAgent ?? DEFAULT_USER_AGENT,
          },
          signal: AbortSignal.timeout(
            this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          ),
        });

        if (shouldRetryStatus(response.status) && attempt < maxRetries) {
          await delay(retryDelayMs(attempt));
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          throw new AppError(
            "SPORTS_PROVIDER_UNAUTHORIZED",
            "ESPN summary request was unauthorized.",
            response.status,
          );
        }
        if (response.status === 404) {
          throw new AppError(
            "SPORTS_FIXTURE_NOT_FOUND",
            "ESPN summary event not found.",
            404,
          );
        }
        if (response.status === 429) {
          throw new AppError(
            "SPORTS_PROVIDER_RATE_LIMITED",
            "ESPN summary request was rate limited.",
            429,
          );
        }
        if (!response.ok) {
          throw new AppError(
            "SPORTS_PROVIDER_TIMEOUT",
            "ESPN summary request failed.",
            response.status,
          );
        }

        return {
          rawText: await response.text(),
          fetchedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        lastError = error;
        if (attempt < maxRetries && isTransientFetchError(error)) {
          await delay(retryDelayMs(attempt));
          continue;
        }
        break;
      }
    }

    throw new AppError(
      "SPORTS_PROVIDER_TIMEOUT",
      isTimeoutError(lastError)
        ? "ESPN summary request timed out."
        : "ESPN summary request failed.",
      503,
    );
  }

  private summaryUrl(eventId: string): URL {
    const url = new URL(this.options.baseUrl ?? DEFAULT_BASE_URL);
    const leagueSlug = this.options.leagueSlug ?? DEFAULT_LEAGUE_SLUG;
    if (!url.pathname.endsWith("/summary")) {
      const path = url.pathname.replace(/\/$/, "");
      url.pathname = path.endsWith(`/${leagueSlug}`)
        ? `${path}/summary`
        : `${path}/${leagueSlug}/summary`;
    }
    const params = new URLSearchParams(url.search);
    params.set("event", eventId);
    url.search = params.toString();
    return url;
  }

  private async writeRawArtifact(
    eventId: string,
    rawText: string,
  ): Promise<string | null> {
    const evidenceDirectory =
      this.options.rawArtifactDirectory ??
      (Object.prototype.hasOwnProperty.call(this.options, "evidenceDirectory")
        ? this.options.evidenceDirectory
        : "data/evidence");
    if (!evidenceDirectory) {
      return null;
    }
    const eventDirectory = join(evidenceDirectory, "espn");
    await mkdir(eventDirectory, { recursive: true });
    const artifactPath = await nextEvidencePath(eventDirectory, eventId);
    const tempPath = `${artifactPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(tempPath, rawText, "utf8");
      const saved = await readFile(tempPath, "utf8");
      if (sha256(saved) !== sha256(rawText)) {
        throw new AppError(
          "SPORTS_PROVIDER_INVALID_RESPONSE",
          "Could not verify written ESPN evidence.",
        );
      }
      await rename(tempPath, artifactPath);
      return relativeToProject(artifactPath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  private mapEventCandidate(
    eventId: string,
    teams: TeamIndex,
    candidate: EventCandidate,
  ): MappedEvent | null {
    const eventType = mapEspnEventType(candidate.play.type);
    if (!eventType) {
      return null;
    }

    const text = candidate.play.text ?? candidate.fallbackText ?? "";
    const teamSide = inferTeamSide(candidate.play.team, text, teams);
    if (!teamSide) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "Could not infer ESPN event team side.",
      );
    }

    const clock = readClock(candidate.play.clock ?? candidate.fallbackClock);
    const firstParticipant = candidate.play.participants?.[0]?.athlete;
    const playerName =
      firstParticipant?.displayName ??
      firstParticipant?.fullName ??
      firstParticipant?.shortName;
    const rawEventId =
      candidate.play.id ??
      fallbackEventId(eventId, eventType, teamSide, playerName, clock);

    return {
      rawEventId,
      sortSeconds: clock.sortSeconds,
      sequence: candidate.sequence ?? candidate.play.sequence ?? 0,
      sourceRank: candidate.sourceRank,
      sourceIndex: candidate.sourceIndex,
      event: {
        providerEventId: `espn:${eventId}:${rawEventId}`,
        eventType,
        originalType:
          candidate.play.type?.type ?? candidate.play.type?.text ?? null,
        teamSide,
        playerProviderId: firstParticipant?.id,
        playerName,
        period: candidate.play.period?.number,
        minute: clock.minute,
        extraMinute: clock.extraMinute,
        text: text || undefined,
        isCancelled: isCancelledEvent(text),
      },
    };
  }
}

export { EspnSportsProvider as EspnSummaryProvider };

function normalizeEventId(eventId: string): string {
  const normalized = eventId.trim();
  if (!normalized) {
    throw new AppError("VALIDATION_FAILED", "ESPN event id is required.");
  }
  return normalized;
}

function primaryCompetition(summary: EspnSummary): EspnCompetition {
  const competition = summary.header.competitions[0];
  if (!competition) {
    throw new AppError(
      "SPORTS_PROVIDER_INVALID_RESPONSE",
      "ESPN summary is missing competition data.",
    );
  }
  return competition;
}

function requireCompetitor(
  competition: EspnCompetition,
  homeAway: "home" | "away",
): EspnCompetitor {
  const competitor = competition.competitors.find(
    (entry) => entry.homeAway === homeAway,
  );
  if (!competitor) {
    throw new AppError(
      "SPORTS_PROVIDER_INVALID_RESPONSE",
      `ESPN summary is missing ${homeAway} competitor.`,
    );
  }
  return competitor;
}

function isoDateString(value: string | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function teamIndexFromCompetition(competition: EspnCompetition): TeamIndex {
  const home = requireCompetitor(competition, "home");
  const away = requireCompetitor(competition, "away");
  return {
    home: identityFromCompetitor(home),
    away: identityFromCompetitor(away),
  };
}

function identityFromCompetitor(competitor: EspnCompetitor): TeamIdentity {
  return {
    id: competitor.id ?? competitor.team?.id,
    names: [
      competitor.team?.displayName,
      competitor.team?.name,
      competitor.team?.shortDisplayName,
      competitor.team?.abbreviation,
    ].filter((value): value is string => typeof value === "string"),
  };
}

function teamDisplayName(competitor: EspnCompetitor): string | undefined {
  return (
    competitor.team?.displayName ??
    competitor.team?.name ??
    competitor.team?.shortDisplayName
  );
}

function collectEventCandidates(summary: EspnSummary): EventCandidate[] {
  const candidates: EventCandidate[] = [];
  const keyEvents = summary.keyEvents ?? [];
  if (keyEvents.length > 0) {
    for (const [index, play] of keyEvents.entries()) {
      candidates.push({
        play,
        sourceIndex: index,
        sourceRank: 0,
        sequence: play.sequence,
      });
    }
    return candidates;
  }

  const commentary = summary.commentary ?? [];
  if (commentary.length > 0) {
    for (const [index, item] of commentary.entries()) {
      const play = playFromCommentary(item);
      if (!play) {
        continue;
      }
      candidates.push({
        play,
        fallbackClock: item.time,
        fallbackText: item.text,
        sourceIndex: index,
        sourceRank: 1,
        sequence: item.sequence,
      });
    }
    return candidates;
  }

  for (const [index, play] of (summary.plays ?? []).entries()) {
    candidates.push({
      play,
      sourceIndex: index,
      sourceRank: 2,
      sequence: play.sequence,
    });
  }
  return candidates;
}

function playFromCommentary(item: EspnCommentaryItem): EspnPlay | null {
  if (item.play) {
    return item.play;
  }
  return null;
}

function findBoxscoreTeam(
  summary: EspnSummary,
  side: TeamSide,
  teams: TeamIndex,
): EspnBoxscoreTeam | null {
  const homeAway = side === "HOME" ? "home" : "away";
  const byHomeAway = summary.boxscore?.teams?.find(
    (team) => team.homeAway === homeAway,
  );
  if (byHomeAway) {
    return byHomeAway;
  }

  const target = side === "HOME" ? teams.home : teams.away;
  return (
    summary.boxscore?.teams?.find((team) =>
      team.team ? inferTeamSide(team.team, "", teams) === side : false,
    ) ??
    summary.boxscore?.teams?.find((team) => team.team?.id === target.id) ??
    null
  );
}

function mapRosterPlayers(
  roster: EspnRoster,
  teams: TeamIndex,
): ProviderPlayerStats[] {
  const side = inferRosterSide(roster, teams);
  return (roster.roster ?? [])
    .map((player): ProviderPlayerStats | null => {
      const name =
        player.athlete?.displayName ??
        player.athlete?.fullName ??
        player.athlete?.shortName;
      if (!name) {
        return null;
      }
      const stats = player.stats ?? [];
      const appearances = readEspnStatistic(stats, "appearances");
      const subIns = readEspnStatistic(stats, "subIns");
      const subbedIn = player.subbedIn === true || (subIns ?? 0) > 0;
      const minutes =
        readEspnStatistic(stats, "minutes") ??
        readEspnStatistic(stats, "minutesPlayed");
      return {
        playerId: playerIdFromName(name),
        playerName: name,
        teamSide: side ?? undefined,
        starter: player.starter ?? false,
        substitute: subbedIn,
        minutes,
        goals: readEspnStatistic(stats, "totalGoals"),
        shots: readEspnStatistic(stats, "totalShots"),
        shotsOnTarget: readEspnStatistic(stats, "shotsOnTarget"),
        yellowCards: readEspnStatistic(stats, "yellowCards"),
        redCards: readEspnStatistic(stats, "redCards"),
        assists: readEspnStatistic(stats, "goalAssists"),
        appeared:
          appearances !== null
            ? appearances > 0
            : player.starter === true || subbedIn || player.subbedOut === true,
      };
    })
    .filter((player): player is ProviderPlayerStats => player !== null);
}

function inferRosterSide(
  roster: EspnRoster,
  teams: TeamIndex,
): TeamSide | null {
  if (roster.homeAway === "home") {
    return "HOME";
  }
  if (roster.homeAway === "away") {
    return "AWAY";
  }
  return inferTeamSide(roster.team, "", teams);
}

function inferTeamSide(
  team: EspnTeam | undefined,
  text: string,
  teams: TeamIndex,
): TeamSide | null {
  if (team?.id) {
    if (team.id === teams.home.id) {
      return "HOME";
    }
    if (team.id === teams.away.id) {
      return "AWAY";
    }
  }

  const names = [
    team?.displayName,
    team?.name,
    team?.shortDisplayName,
    team?.abbreviation,
    text,
  ].filter((value): value is string => typeof value === "string");

  const homeScore = Math.max(
    ...names.map((name) => bestSimilarity(name, teams.home.names)),
  );
  const awayScore = Math.max(
    ...names.map((name) => bestSimilarity(name, teams.away.names)),
  );

  if (homeScore > awayScore && homeScore >= 0.5) {
    return "HOME";
  }
  if (awayScore > homeScore && awayScore >= 0.5) {
    return "AWAY";
  }
  return null;
}

function bestSimilarity(value: string, candidates: string[]): number {
  return Math.max(
    0,
    ...candidates.map((candidate) => providerNameSimilarity(value, candidate)),
  );
}

function dedupePlayers(players: ProviderPlayerStats[]): ProviderPlayerStats[] {
  const seen = new Set<string>();
  const deduped: ProviderPlayerStats[] = [];
  for (const player of players) {
    if (seen.has(player.playerId)) {
      continue;
    }
    seen.add(player.playerId);
    deduped.push(player);
  }
  return deduped;
}

function compareMappedEvents(left: MappedEvent, right: MappedEvent): number {
  if (left.sortSeconds !== right.sortSeconds) {
    return left.sortSeconds - right.sortSeconds;
  }
  const leftExtra = left.event.extraMinute ?? 0;
  const rightExtra = right.event.extraMinute ?? 0;
  if (leftExtra !== rightExtra) {
    return leftExtra - rightExtra;
  }
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  if (left.sourceRank !== right.sourceRank) {
    return left.sourceRank - right.sourceRank;
  }
  return left.sourceIndex - right.sourceIndex;
}

function fallbackEventId(
  eventId: string,
  eventType: ProviderEvent["eventType"],
  teamSide: TeamSide,
  playerName: string | undefined,
  clock: { minute?: number; extraMinute?: number },
): string {
  return [
    eventId,
    eventType,
    teamSide,
    clock.minute ?? "na",
    clock.extraMinute ?? 0,
    playerName ? playerIdFromName(playerName) : "player",
  ].join(":");
}

function isCancelledEvent(text: string): boolean {
  return /\b(cancelled|canceled|disallowed|overturned)\b/i.test(text);
}

function parseJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new AppError(
      "SPORTS_PROVIDER_INVALID_RESPONSE",
      "ESPN summary response was not valid JSON.",
    );
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTransientFetchError(error: unknown): boolean {
  if (isTimeoutError(error)) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const code = errorCode(error);
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED"
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

function retryDelayMs(attempt: number): number {
  return 150 * (attempt + 1);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function nextEvidencePath(
  directory: string,
  eventId: string,
): Promise<string> {
  const primary = join(directory, `${eventId}.json`);
  try {
    await readFile(primary, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return primary;
    }
    throw error;
  }

  let version = 2;
  while (true) {
    const candidate = join(directory, `${eventId}.v${version}.json`);
    try {
      await readFile(candidate, "utf8");
      version += 1;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return candidate;
      }
      throw error;
    }
  }
}

function relativeToProject(path: string): string {
  return path.startsWith(process.cwd())
    ? path.slice(process.cwd().length + 1)
    : path;
}
