import { createHash } from "node:crypto";
import { MarketType } from "../../../domain/model";
import {
  classifyStakeOddCode,
  normalizeStakeMarkets,
  type RawStakeMarket,
  type RawStakeSelection,
} from "../../../domain/markets/normalization";
import { AppError } from "../../errors";
import { type ImportedEvent } from "./importer";
import {
  StakeApiPayloadSchema,
  type StakeApiOdd,
  type StakeApiPayload,
} from "./apiSchema";
import { redactStakeApiUrl } from "./endpoint";

export interface StakeApiImportInput {
  payload: unknown;
  rawText: string;
  apiUrl: string;
  apiUrlSanitized?: string;
  fetchedAt: string;
  payloadSha256?: string;
  rawArtifactPath?: string;
  expectedEventId: string;
  sourceUrl: string;
  capturedAt: Date;
  matchId: string;
  fallbackHomeTeamName?: string;
  fallbackAwayTeamName?: string;
  fallbackCompetitionName?: string | null;
  fallbackKickoffAt?: string | null;
}

export function stakeApiPayloadToImportedEvent(
  input: StakeApiImportInput,
): ImportedEvent {
  const payload = parseStakeApiPayload(input.payload);
  assertStakeApiPayloadConsistency(payload, input.expectedEventId);
  const markets = stakeApiPayloadToRawMarkets(payload);
  if (markets.length === 0) {
    throw new AppError("STAKE_API_NO_ODDS", "Stake API returned no odds.");
  }

  const homeTeamName = input.fallbackHomeTeamName ?? payload.info.teams.home;
  const awayTeamName = input.fallbackAwayTeamName ?? payload.info.teams.away;

  return {
    source: "stake",
    sourceUrl: input.sourceUrl,
    stakeEventId: String(payload.info.id),
    homeTeamName,
    awayTeamName,
    competitionName:
      input.fallbackCompetitionName ?? payload.info.tournament_name ?? null,
    kickoffAt:
      input.fallbackKickoffAt ??
      new Date(payload.info.date_start).toISOString(),
    capturedAt: input.capturedAt.toISOString(),
    markets: normalizeStakeMarkets({
      matchId: input.matchId,
      homeTeamName,
      awayTeamName,
      markets,
    }),
    rawFixture: {
      stakeApi: {
        source: "stake-api",
        apiUrlSanitized:
          input.apiUrlSanitized ?? redactStakeApiUrl(input.apiUrl),
        eventId: String(payload.info.id),
        fetchedAt: input.fetchedAt,
        payloadSha256: input.payloadSha256 ?? sha256(input.rawText),
        rawArtifactPath: input.rawArtifactPath,
        payload,
      },
    },
  };
}

export function parseStakeApiPayload(payload: unknown): StakeApiPayload {
  const parsed = StakeApiPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(
      "STAKE_API_INVALID_PAYLOAD",
      "Stake API payload does not match the expected schema.",
    );
  }
  return parsed.data;
}

export function assertStakeApiPayloadConsistency(
  payload: StakeApiPayload,
  expectedEventId: string,
): void {
  if (String(payload.info.id) !== expectedEventId) {
    throw new AppError(
      "STAKE_API_EVENT_ID_MISMATCH",
      `Stake API payload event id ${payload.info.id} does not match ${expectedEventId}.`,
    );
  }
  const odds = Object.values(payload.odds);
  if (odds.length === 0) {
    throw new AppError("STAKE_API_NO_ODDS", "Stake API payload has no odds.");
  }
  const inconsistent = odds.filter(
    (odd) => String(odd.event_id) !== expectedEventId,
  );
  if (inconsistent.length > 0) {
    throw new AppError(
      "STAKE_API_EVENT_ID_MISMATCH",
      `Stake API payload contains odds for a different event.`,
    );
  }
}

export function stakeApiPayloadToRawMarkets(
  payload: StakeApiPayload,
): RawStakeMarket[] {
  const groups = new Map<number, StakeApiOdd[]>();
  for (const odd of Object.values(payload.odds)) {
    const existing = groups.get(odd.union_id) ?? [];
    existing.push(odd);
    groups.set(odd.union_id, existing);
  }

  return [...groups.entries()]
    .map(([unionId, odds], index): RawStakeMarket => {
      const sorted = [...odds].sort(
        (left, right) =>
          (left.order_num ?? left.id) - (right.order_num ?? right.id),
      );
      const marketType = classifyStakeOddCode(sorted[0]?.odd_code ?? "");
      return {
        sourceMarketId: `${payload.info.id}:${unionId}`,
        rawMarketName: marketNameForType(marketType, sorted[0]?.team_name),
        displayOrder: index,
        marketType,
        metadata: marketMetadata(sorted),
        selections: sorted.map(stakeApiOddToRawSelection),
      };
    })
    .filter((market) => market.selections.length > 0);
}

export function stakeApiOddToRawSelection(odd: StakeApiOdd): RawStakeSelection {
  const playerName = structuredPlayerName(odd);
  return {
    sourceSelectionId: odd.unique_id ?? String(odd.id),
    oddId: String(odd.odd_id),
    oddCode: odd.odd_code,
    rawSelectionName: playerName ?? odd.team_name,
    oddDecimal: odd.odd_value,
    additionalValue:
      odd.additional_value_raw === null ||
      odd.additional_value_raw === undefined
        ? undefined
        : String(odd.additional_value_raw),
    teamSide: odd.team_side === undefined ? undefined : String(odd.team_side),
    locked: odd.frozen === true,
    metadata: {
      odd_id: odd.odd_id,
      odd_code: odd.odd_code,
      union_id: odd.union_id,
      group_id: odd.group_id,
      filter_id: odd.filter_id,
      variation_id: odd.variation_id,
      additional_value_raw: odd.additional_value_raw,
      team_players_id: odd.team_players_id,
      racing_team_players_id: odd.racing_team_players_id,
      player_tag: odd.player_tag,
    },
  };
}

export function realStakeApiOddsCount(payload: StakeApiPayload): number {
  return Object.keys(payload.odds).length;
}

function marketMetadata(odds: StakeApiOdd[]): Record<string, unknown> {
  const first = odds[0];
  return {
    union_id: first?.union_id,
    group_id: first?.group_id,
    filter_id: first?.filter_id,
    variation_id: first?.variation_id,
    row_id: first?.row_id,
  };
}

function structuredPlayerName(odd: StakeApiOdd): string | null {
  return (
    odd.team_player_1_name?.es ??
    odd.team_player_1_name?.en ??
    odd.team_player_2_name?.es ??
    odd.team_player_2_name?.en ??
    null
  );
}

function marketNameForType(type: MarketType, fallback?: string): string {
  switch (type) {
    case MarketType.MATCH_RESULT:
      return "Resultado del Partido";
    case MarketType.DOUBLE_CHANCE:
      return "Doble Oportunidad";
    case MarketType.DRAW_NO_BET:
      return "Ganador sin empate";
    case MarketType.TOTAL_GOALS:
      return "Total de goles";
    case MarketType.TEAM_TOTAL_GOALS:
      return "Total de goles por equipo";
    case MarketType.FIRST_HALF_TOTAL_GOALS:
      return "Primer tiempo: total de goles";
    case MarketType.BOTH_TEAMS_TO_SCORE:
      return "Ambos equipos marcan";
    case MarketType.EXACT_SCORE:
      return "Marcador exacto";
    case MarketType.HANDICAP:
      return "Handicap";
    case MarketType.TOTAL_YELLOW_CARDS:
      return "Total de tarjetas amarillas";
    case MarketType.TOTAL_CORNERS:
      return "Total de corners";
    case MarketType.PLAYER_SHOTS_ON_TARGET:
      return "Tiros a puerta por jugador";
    case MarketType.ANYTIME_GOALSCORER:
      return "Jugador que marca";
    case MarketType.UNSUPPORTED:
      return fallback ?? "Mercado no soportado";
    default:
      return fallback ?? "Mercado no soportado";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
