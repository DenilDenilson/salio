import { FixtureStatus } from "../../domain/model";
import {
  type FixtureCandidate,
  type LiveSportsProvider,
  type ProviderEvent,
  type ProviderFixture,
  type ProviderPlayerStats,
  type ProviderTeamStats,
} from "./types";

export class DemoSportsProvider implements LiveSportsProvider {
  readonly callCounts = {
    fixture: 0,
    events: 0,
    stats: 0,
    players: 0,
  };

  async getFixture(fixtureId: number): Promise<ProviderFixture> {
    this.callCounts.fixture += 1;
    return {
      fixtureId,
      status: FixtureStatus.FINISHED,
      elapsedMinutes: 90,
      score: { home: 1, away: 1, halftimeHome: 0, halftimeAway: 1 },
      kickoffAt: "2026-06-12T19:00:00.000Z",
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  async getEvents(_fixtureId?: number): Promise<ProviderEvent[]> {
    this.callCounts.events += 1;
    return [
      {
        providerEventId: "goal-bosnia-lukic-21",
        eventType: "GOAL",
        teamSide: "AWAY",
        playerName: "Jovo Lukic",
        minute: 21,
        isCancelled: false,
      },
      {
        providerEventId: "goal-canada-larin-79",
        eventType: "GOAL",
        teamSide: "HOME",
        playerName: "Cyle Larin",
        minute: 79,
        isCancelled: false,
      },
    ];
  }

  async getTeamStatistics(_fixtureId?: number): Promise<ProviderTeamStats> {
    this.callCounts.stats += 1;
    return {
      yellowCards: { home: 2, away: 1 },
      corners: { home: 8, away: 3 },
      shotsOnTarget: { home: 5, away: 2 },
    };
  }

  async getPlayerStatistics(
    _fixtureId?: number,
  ): Promise<ProviderPlayerStats[]> {
    this.callCounts.players += 1;
    return [
      {
        playerId: "player_cyle-larin",
        playerName: "Cyle Larin",
        goals: 1,
        shotsOnTarget: 1,
        appeared: true,
      },
    ];
  }

  async searchFixtureCandidates(input: {
    homeTeamName: string;
    awayTeamName: string;
    kickoffAt?: string | null;
    competitionName?: string | null;
  }): Promise<FixtureCandidate[]> {
    return [
      {
        fixtureId: 990001,
        homeTeamName: input.homeTeamName,
        awayTeamName: input.awayTeamName,
        competitionName: input.competitionName ?? "Copa Mundial 2026 · Grupo B",
        kickoffAt: input.kickoffAt ?? "2026-06-12T19:00:00.000Z",
        score: 0.99,
        reason: "Fixture demo construido desde fixtures locales.",
      },
    ];
  }
}
