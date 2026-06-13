import { FixtureStatus } from "../../domain/model";

export interface ProviderFixture {
  fixtureId: number;
  status: FixtureStatus;
  elapsedMinutes?: number;
  score: {
    home: number;
    away: number;
    halftimeHome?: number;
    halftimeAway?: number;
  };
  kickoffAt: string;
  lastUpdatedAt: string;
}

export interface ProviderEvent {
  providerEventId: string;
  eventType: "GOAL" | "YELLOW_CARD" | "SUBSTITUTION";
  teamSide: "HOME" | "AWAY";
  playerProviderId?: string;
  playerName?: string;
  minute?: number;
  extraMinute?: number;
  isCancelled: boolean;
}

export interface ProviderTeamStats {
  yellowCards: { home: number; away: number };
  corners: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
}

export interface ProviderPlayerStats {
  playerId: string;
  playerName: string;
  goals: number;
  shotsOnTarget: number;
  appeared: boolean;
}

export interface FixtureCandidate {
  fixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
  competitionName: string | null;
  kickoffAt: string;
  score: number;
  reason: string;
}

export interface LiveSportsProvider {
  getFixture(fixtureId: number): Promise<ProviderFixture>;
  getEvents(fixtureId: number): Promise<ProviderEvent[]>;
  getTeamStatistics(fixtureId: number): Promise<ProviderTeamStats>;
  getPlayerStatistics(fixtureId: number): Promise<ProviderPlayerStats[]>;
  searchFixtureCandidates(input: {
    homeTeamName: string;
    awayTeamName: string;
    kickoffAt?: string | null;
    competitionName?: string | null;
  }): Promise<FixtureCandidate[]>;
}
