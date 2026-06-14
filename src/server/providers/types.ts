import { FixtureStatus } from "../../domain/model";

export type SportsDataProvider = "espn" | "demo";

export interface SportsDataSource {
  provider: SportsDataProvider;
  eventId: string | null;
  leagueSlug: string | null;
  sourceUrl: string | null;
}

export interface ResultEvidence {
  provider: SportsDataProvider;
  eventId: string;
  sourceUrl: string;
  fetchedAt: string;
  payloadSha256: string;
  rawArtifactPath: string | null;
}

export interface TeamMatchStatistics {
  fouls: number | null;
  yellowCards: number | null;
  redCards: number | null;
  offsides: number | null;
  corners: number | null;
  saves: number | null;
  possessionPercent: number | null;
  totalShots: number | null;
  shotsOnTarget: number | null;
  blockedShots: number | null;
  accuratePasses: number | null;
  totalPasses: number | null;
  accurateCrosses: number | null;
  totalCrosses: number | null;
  totalLongBalls: number | null;
  accurateLongBalls: number | null;
  tacklesWon: number | null;
  totalTackles: number | null;
  interceptions: number | null;
  clearances: number | null;
}

export interface ProviderFixture {
  eventId: string;
  sourceUrl?: string | null;
  evidence?: ResultEvidence | null;
  status: FixtureStatus;
  providerStatus?: string;
  elapsedMinutes?: number;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  competitionName?: string | null;
  leagueSlug?: string | null;
  score: {
    home: number | null;
    away: number | null;
    halftimeHome?: number | null;
    halftimeAway?: number | null;
  };
  regulationScore?: {
    home: number | null;
    away: number | null;
  } | null;
  finalScore?: {
    home: number | null;
    away: number | null;
  } | null;
  shootoutScore?: {
    home: number | null;
    away: number | null;
  } | null;
  kickoffAt: string;
  lastUpdatedAt: string;
}

export interface ProviderEvent {
  providerEventId: string;
  eventType: "GOAL" | "YELLOW_CARD" | "RED_CARD" | "SUBSTITUTION";
  originalType: string | null;
  teamSide: "HOME" | "AWAY";
  playerProviderId?: string;
  playerName?: string;
  period?: number;
  minute?: number;
  extraMinute?: number;
  text?: string;
  isCancelled: boolean;
}

export interface ProviderTeamStats {
  home: TeamMatchStatistics;
  away: TeamMatchStatistics;
  yellowCards: { home: number | null; away: number | null };
  corners: { home: number | null; away: number | null };
  shotsOnTarget: { home: number | null; away: number | null };
}

export interface ProviderPlayerStats {
  playerId: string;
  playerName: string;
  teamSide?: "HOME" | "AWAY";
  starter: boolean;
  substitute: boolean;
  minutes: number | null;
  goals: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  yellowCards: number | null;
  redCards: number | null;
  assists: number | null;
  appeared: boolean;
}

export interface LiveSportsProvider {
  getFixture(eventId: string): Promise<ProviderFixture>;
  getEvents(eventId: string): Promise<ProviderEvent[]>;
  getTeamStatistics(eventId: string): Promise<ProviderTeamStats>;
  getPlayerStatistics(eventId: string): Promise<ProviderPlayerStats[]>;
}
