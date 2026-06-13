import { FixtureStatus } from "../../../domain/model";
import { AppError } from "../../errors";
import {
  type FixtureCandidate,
  type LiveSportsProvider,
  type ProviderEvent,
  type ProviderFixture,
  type ProviderPlayerStats,
  type ProviderTeamStats,
} from "../types";
import {
  ApiFootballEventsResponseSchema,
  ApiFootballFixtureResponseSchema,
  ApiFootballPlayersResponseSchema,
  ApiFootballStatisticsResponseSchema,
} from "./schemas";

export class ApiFootballProvider implements LiveSportsProvider {
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey?: string;
      homeTeamName?: string;
      awayTeamName?: string;
    },
  ) {}

  async getFixture(fixtureId: number): Promise<ProviderFixture> {
    const payload = await this.request(`/fixtures?id=${fixtureId}`);
    const parsed = ApiFootballFixtureResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.response.length === 0) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "Invalid fixture response.",
      );
    }
    const fixture = parsed.data.response[0];
    return {
      fixtureId: fixture.fixture.id,
      status: mapFixtureStatus(fixture.fixture.status.short),
      elapsedMinutes: fixture.fixture.status.elapsed ?? undefined,
      score: {
        home: fixture.goals.home ?? 0,
        away: fixture.goals.away ?? 0,
        halftimeHome: fixture.score?.halftime?.home ?? undefined,
        halftimeAway: fixture.score?.halftime?.away ?? undefined,
      },
      kickoffAt: fixture.fixture.date,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  async getEvents(fixtureId: number): Promise<ProviderEvent[]> {
    const payload = await this.request(`/fixtures/events?fixture=${fixtureId}`);
    const parsed = ApiFootballEventsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "Invalid events response.",
      );
    }
    return parsed.data.response
      .map((event, index): ProviderEvent | null => {
        const eventType = mapEventType(event.type, event.detail ?? "");
        if (!eventType) {
          return null;
        }
        return {
          providerEventId: `${fixtureId}-${event.time.elapsed ?? "na"}-${event.team.id ?? event.team.name}-${index}`,
          eventType,
          teamSide: this.inferTeamSide(event.team.name ?? ""),
          playerProviderId: event.player?.id
            ? String(event.player.id)
            : undefined,
          playerName: event.player?.name ?? undefined,
          minute: event.time.elapsed ?? undefined,
          extraMinute: event.time.extra ?? undefined,
          isCancelled: (event.comments ?? "").toLowerCase().includes("cancel"),
        };
      })
      .filter((event): event is ProviderEvent => event !== null);
  }

  async getTeamStatistics(fixtureId: number): Promise<ProviderTeamStats> {
    const payload = await this.request(
      `/fixtures/statistics?fixture=${fixtureId}`,
    );
    const parsed = ApiFootballStatisticsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "Invalid statistics response.",
      );
    }
    const [home, away] = parsed.data.response;
    return {
      yellowCards: {
        home: readStat(home?.statistics ?? [], "Yellow Cards"),
        away: readStat(away?.statistics ?? [], "Yellow Cards"),
      },
      corners: {
        home: readStat(home?.statistics ?? [], "Corner Kicks"),
        away: readStat(away?.statistics ?? [], "Corner Kicks"),
      },
      shotsOnTarget: {
        home: readStat(home?.statistics ?? [], "Shots on Goal"),
        away: readStat(away?.statistics ?? [], "Shots on Goal"),
      },
    };
  }

  async getPlayerStatistics(fixtureId: number): Promise<ProviderPlayerStats[]> {
    const payload = await this.request(
      `/fixtures/players?fixture=${fixtureId}`,
    );
    const parsed = ApiFootballPlayersResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "Invalid players response.",
      );
    }
    return parsed.data.response.flatMap((team) =>
      team.players.map((player) => {
        const stats = player.statistics[0];
        const minutes = stats?.games?.minutes ?? 0;
        return {
          playerId: `player_${player.player.id}`,
          playerName: player.player.name,
          goals: stats?.goals?.total ?? 0,
          shotsOnTarget: stats?.shots?.on ?? 0,
          appeared: minutes > 0,
        };
      }),
    );
  }

  async searchFixtureCandidates(input: {
    homeTeamName: string;
    awayTeamName: string;
    kickoffAt?: string | null;
    competitionName?: string | null;
  }): Promise<FixtureCandidate[]> {
    const date =
      input.kickoffAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const payload = await this.request(`/fixtures?date=${date}`);
    const parsed = ApiFootballFixtureResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        "SPORTS_PROVIDER_INVALID_RESPONSE",
        "Invalid candidate response.",
      );
    }

    return parsed.data.response
      .map((fixture) => {
        const score =
          similarity(input.homeTeamName, fixture.teams.home.name) * 0.4 +
          similarity(input.awayTeamName, fixture.teams.away.name) * 0.4 +
          (input.competitionName && fixture.league?.name
            ? similarity(input.competitionName, fixture.league.name) * 0.2
            : 0.1);
        return {
          fixtureId: fixture.fixture.id,
          homeTeamName: fixture.teams.home.name,
          awayTeamName: fixture.teams.away.name,
          competitionName: fixture.league?.name ?? null,
          kickoffAt: fixture.fixture.date,
          score,
          reason: "Coincidencia por equipos, fecha y competicion.",
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private async request(path: string): Promise<unknown> {
    if (!this.options.apiKey) {
      throw new AppError(
        "SPORTS_PROVIDER_UNAUTHORIZED",
        "Missing API-Football key.",
        401,
      );
    }

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      headers: {
        "x-apisports-key": this.options.apiKey,
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        "SPORTS_PROVIDER_UNAUTHORIZED",
        "API-Football unauthorized.",
        response.status,
      );
    }
    if (response.status === 429) {
      throw new AppError(
        "SPORTS_PROVIDER_RATE_LIMITED",
        "API-Football rate limited.",
        429,
      );
    }
    if (!response.ok) {
      throw new AppError(
        "SPORTS_PROVIDER_TIMEOUT",
        "API-Football request failed.",
        response.status,
      );
    }
    return response.json();
  }

  private inferTeamSide(teamName: string): "HOME" | "AWAY" {
    const name = teamName.toLowerCase();
    if (
      this.options.awayTeamName &&
      name.includes(this.options.awayTeamName.toLowerCase())
    ) {
      return "AWAY";
    }
    return "HOME";
  }
}

export function mapFixtureStatus(status: string): FixtureStatus {
  switch (status) {
    case "NS":
    case "TBD":
      return FixtureStatus.NOT_STARTED;
    case "1H":
    case "2H":
    case "ET":
    case "BT":
    case "P":
      return FixtureStatus.LIVE;
    case "HT":
      return FixtureStatus.HALFTIME;
    case "FT":
      return FixtureStatus.FINISHED;
    case "AET":
      return FixtureStatus.AFTER_EXTRA_TIME;
    case "PEN":
      return FixtureStatus.PENALTIES;
    case "PST":
      return FixtureStatus.POSTPONED;
    case "CANC":
      return FixtureStatus.CANCELLED;
    case "ABD":
      return FixtureStatus.ABANDONED;
    case "SUSP":
      return FixtureStatus.SUSPENDED;
    default:
      return FixtureStatus.LIVE;
  }
}

function mapEventType(
  type: string,
  detail: string,
): ProviderEvent["eventType"] | null {
  if (type === "Goal") {
    return "GOAL";
  }
  if (type === "Card" && detail.toLowerCase().includes("yellow")) {
    return "YELLOW_CARD";
  }
  if (type === "subst") {
    return "SUBSTITUTION";
  }
  return null;
}

function readStat(
  stats: Array<{ type: string; value: string | number | null }>,
  type: string,
): number {
  const value = stats.find((stat) => stat.type === type)?.value;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) {
    return 1;
  }
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const overlap = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size, 1);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
