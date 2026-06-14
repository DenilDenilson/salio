import { FixtureStatus } from "../../domain/model";
import {
  type LiveSportsProvider,
  type ProviderEvent,
  type ProviderFixture,
  type ProviderPlayerStats,
  type ProviderTeamStats,
  type TeamMatchStatistics,
} from "./types";

const demoSourceUrl = "demo://canada-vs-bosnia";
const demoStatsHome: TeamMatchStatistics = {
  fouls: 11,
  yellowCards: 2,
  redCards: 0,
  offsides: 1,
  corners: 8,
  saves: 1,
  possessionPercent: 54,
  totalShots: 12,
  shotsOnTarget: 5,
  blockedShots: 2,
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
const demoStatsAway: TeamMatchStatistics = {
  fouls: 13,
  yellowCards: 1,
  redCards: 0,
  offsides: 2,
  corners: 3,
  saves: 4,
  possessionPercent: 46,
  totalShots: 7,
  shotsOnTarget: 2,
  blockedShots: 1,
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

export class DemoSportsProvider implements LiveSportsProvider {
  readonly callCounts = {
    fixture: 0,
    events: 0,
    stats: 0,
    players: 0,
  };

  async getFixture(eventId = "demo-canada-bosnia"): Promise<ProviderFixture> {
    this.callCounts.fixture += 1;
    return {
      eventId,
      sourceUrl: demoSourceUrl,
      evidence: {
        provider: "demo",
        eventId,
        sourceUrl: demoSourceUrl,
        fetchedAt: new Date().toISOString(),
        payloadSha256:
          "0000000000000000000000000000000000000000000000000000000000000000",
        rawArtifactPath: null,
      },
      status: FixtureStatus.FINISHED,
      providerStatus: "FT",
      elapsedMinutes: 90,
      homeTeamId: "1001",
      awayTeamId: "1002",
      homeTeamName: "Canadá",
      awayTeamName: "Bosnia y Herzegovina",
      competitionName: "Copa Mundial 2026 · Grupo B",
      leagueSlug: "fifa.world",
      score: { home: 1, away: 1, halftimeHome: 0, halftimeAway: 1 },
      regulationScore: { home: 1, away: 1 },
      finalScore: { home: 1, away: 1 },
      shootoutScore: null,
      kickoffAt: "2026-06-12T19:00:00.000Z",
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  async getEvents(_eventId?: string): Promise<ProviderEvent[]> {
    this.callCounts.events += 1;
    return [
      {
        providerEventId: "goal-bosnia-lukic-21",
        eventType: "GOAL",
        originalType: "demo-goal",
        teamSide: "AWAY",
        playerName: "Jovo Lukic",
        playerProviderId: "demo-lukic",
        period: 1,
        minute: 21,
        extraMinute: 0,
        text: "Goal by Jovo Lukic.",
        isCancelled: false,
      },
      {
        providerEventId: "goal-canada-larin-79",
        eventType: "GOAL",
        originalType: "demo-goal",
        teamSide: "HOME",
        playerName: "Cyle Larin",
        playerProviderId: "demo-larin",
        period: 2,
        minute: 79,
        extraMinute: 0,
        text: "Goal by Cyle Larin.",
        isCancelled: false,
      },
    ];
  }

  async getTeamStatistics(_eventId?: string): Promise<ProviderTeamStats> {
    this.callCounts.stats += 1;
    return {
      home: demoStatsHome,
      away: demoStatsAway,
      yellowCards: { home: 2, away: 1 },
      corners: { home: 8, away: 3 },
      shotsOnTarget: { home: 5, away: 2 },
    };
  }

  async getPlayerStatistics(_eventId?: string): Promise<ProviderPlayerStats[]> {
    this.callCounts.players += 1;
    return [
      {
        playerId: "player_cyle-larin",
        playerName: "Cyle Larin",
        teamSide: "HOME",
        starter: true,
        substitute: false,
        minutes: null,
        goals: 1,
        shots: null,
        shotsOnTarget: 1,
        yellowCards: 0,
        redCards: 0,
        assists: null,
        appeared: true,
      },
    ];
  }
}
