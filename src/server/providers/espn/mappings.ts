import { FixtureStatus } from "../../../domain/model";
import { AppError } from "../../errors";
import { type ProviderEvent, type TeamMatchStatistics } from "../types";
import {
  type EspnClock,
  type EspnCompetition,
  type EspnPlayType,
  type EspnStatistic,
  type EspnStatusType,
} from "./schemas";

export function mapEspnFixtureStatus(statusType?: EspnStatusType): {
  status: FixtureStatus;
  providerStatus: string;
  elapsedMinutes?: number;
} {
  const providerStatus =
    statusType?.shortDetail ??
    statusType?.detail ??
    statusType?.description ??
    statusType?.name ??
    "unknown";
  const normalized = normalizeStatusText(statusType);

  if (isPenaltyStatus(normalized) || isAfterExtraTimeStatus(normalized)) {
    throw new AppError(
      "SPORTS_FIXTURE_AMBIGUOUS",
      "ESPN returned an AET/PEN status that needs explicit score handling.",
    );
  }

  if (normalized.includes("postponed")) {
    return { status: FixtureStatus.POSTPONED, providerStatus };
  }
  if (normalized.includes("cancel")) {
    return { status: FixtureStatus.CANCELLED, providerStatus };
  }
  if (normalized.includes("abandon")) {
    return { status: FixtureStatus.ABANDONED, providerStatus };
  }
  if (normalized.includes("suspend")) {
    return { status: FixtureStatus.SUSPENDED, providerStatus };
  }
  if (normalized.includes("half time") || providerStatus === "HT") {
    return { status: FixtureStatus.HALFTIME, providerStatus };
  }
  if (statusType?.state === "pre" || normalized.includes("scheduled")) {
    return { status: FixtureStatus.NOT_STARTED, providerStatus };
  }
  if (statusType?.state === "in") {
    return { status: FixtureStatus.LIVE, providerStatus };
  }
  if (
    statusType?.completed === true ||
    statusType?.state === "post" ||
    normalized.includes("full time") ||
    providerStatus === "FT"
  ) {
    return {
      status: FixtureStatus.FINISHED,
      providerStatus,
      elapsedMinutes: 90,
    };
  }

  throw new AppError(
    "SPORTS_PROVIDER_INVALID_RESPONSE",
    `ESPN returned an unknown fixture status (${providerStatus}).`,
  );
}

export function assertNoAmbiguousExtraTimeOrPenalties(
  competition: EspnCompetition,
): void {
  const hasMoreThanRegulationLinescores = competition.competitors.some(
    (competitor) => (competitor.linescores?.length ?? 0) > 2,
  );
  if (!hasMoreThanRegulationLinescores) {
    return;
  }

  throw new AppError(
    "SPORTS_FIXTURE_AMBIGUOUS",
    "ESPN returned extra-time or penalty linescores that need explicit handling.",
  );
}

export function mapEspnEventType(
  type?: EspnPlayType,
): ProviderEvent["eventType"] | null {
  const raw = `${type?.type ?? ""} ${type?.text ?? ""}`.toLowerCase();
  const normalized = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) {
    return null;
  }
  if (normalized.includes("yellow-card")) {
    return "YELLOW_CARD";
  }
  if (normalized.includes("red-card")) {
    return "RED_CARD";
  }
  if (normalized.includes("substitution")) {
    return "SUBSTITUTION";
  }
  if (
    normalized === "goal" ||
    normalized.endsWith("-goal") ||
    normalized.includes("goal-")
  ) {
    return "GOAL";
  }
  return null;
}

export function parseEspnScore(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function readEspnStatistic(
  stats: EspnStatistic[],
  name: string,
): number | null {
  const value = stats.find((stat) => stat.name === name);
  return parseEspnStatValue(value);
}

export function parseEspnStatValue(
  stat: EspnStatistic | undefined,
): number | null {
  if (!stat) {
    return null;
  }
  if (typeof stat.value === "number") {
    return Number.isFinite(stat.value) ? stat.value : null;
  }
  if (typeof stat.value === "string") {
    const parsed = Number(stat.value.replace("%", "").trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof stat.displayValue === "string") {
    const parsed = Number(stat.displayValue.replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function mapEspnTeamStatistics(
  stats: EspnStatistic[],
): TeamMatchStatistics {
  return {
    fouls: readEspnStatistic(stats, "foulsCommitted"),
    yellowCards: readEspnStatistic(stats, "yellowCards"),
    redCards: readEspnStatistic(stats, "redCards"),
    offsides: readEspnStatistic(stats, "offsides"),
    corners: readEspnStatistic(stats, "wonCorners"),
    saves: readEspnStatistic(stats, "saves"),
    possessionPercent: readEspnStatistic(stats, "possessionPct"),
    totalShots: readEspnStatistic(stats, "totalShots"),
    shotsOnTarget: readEspnStatistic(stats, "shotsOnTarget"),
    blockedShots: readEspnStatistic(stats, "blockedShots"),
    accuratePasses: readEspnStatistic(stats, "accuratePasses"),
    totalPasses: readEspnStatistic(stats, "totalPasses"),
    accurateCrosses: readEspnStatistic(stats, "accurateCrosses"),
    totalCrosses: readEspnStatistic(stats, "totalCrosses"),
    totalLongBalls: readEspnStatistic(stats, "totalLongBalls"),
    accurateLongBalls: readEspnStatistic(stats, "accurateLongBalls"),
    tacklesWon: readEspnStatistic(stats, "effectiveTackles"),
    totalTackles: readEspnStatistic(stats, "totalTackles"),
    interceptions: readEspnStatistic(stats, "interceptions"),
    clearances:
      readEspnStatistic(stats, "totalClearance") ??
      readEspnStatistic(stats, "effectiveClearance"),
  };
}

export function emptyTeamMatchStatistics(): TeamMatchStatistics {
  return {
    fouls: null,
    yellowCards: null,
    redCards: null,
    offsides: null,
    corners: null,
    saves: null,
    possessionPercent: null,
    totalShots: null,
    shotsOnTarget: null,
    blockedShots: null,
    accuratePasses: null,
    totalPasses: null,
    accurateCrosses: null,
    totalCrosses: null,
    totalLongBalls: null,
    accurateLongBalls: null,
    tacklesWon: null,
    totalTackles: null,
    interceptions: null,
    clearances: null,
  };
}

export function readClock(clock?: EspnClock): {
  minute?: number;
  extraMinute?: number;
  sortSeconds: number;
} {
  const display = clock?.displayValue?.trim() ?? "";
  const parsedDisplay = parseClockDisplay(display);
  const rawSeconds =
    typeof clock?.value === "number" && Number.isFinite(clock.value)
      ? clock.value
      : null;

  if (parsedDisplay) {
    return {
      ...parsedDisplay,
      sortSeconds:
        rawSeconds ??
        parsedDisplay.minute * 60 + (parsedDisplay.extraMinute ?? 0),
    };
  }

  if (rawSeconds !== null && rawSeconds > 0) {
    return {
      minute: Math.ceil(rawSeconds / 60),
      sortSeconds: rawSeconds,
    };
  }

  return { sortSeconds: rawSeconds ?? 0 };
}

function parseClockDisplay(
  value: string,
): { minute: number; extraMinute?: number } | null {
  const match = /^(\d+)'(?:\+(\d+)')?$/.exec(value);
  if (!match) {
    return null;
  }
  const minute = Number(match[1]);
  const extraMinute = match[2] ? Number(match[2]) : undefined;
  if (!Number.isInteger(minute)) {
    return null;
  }
  return Number.isInteger(extraMinute) ? { minute, extraMinute } : { minute };
}

function normalizeStatusText(statusType?: EspnStatusType): string {
  return [
    statusType?.id,
    statusType?.name,
    statusType?.state,
    statusType?.description,
    statusType?.detail,
    statusType?.shortDetail,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function isAfterExtraTimeStatus(value: string): boolean {
  return /\baet\b/.test(value) || value.includes("after extra time");
}

function isPenaltyStatus(value: string): boolean {
  return (
    /\bpen\b/.test(value) ||
    value.includes("penalties") ||
    value.includes("penalty shootout") ||
    value.includes("shootout")
  );
}
