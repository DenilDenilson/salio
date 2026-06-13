import {
  MarketType,
  ParticipantType,
  SelectionOperator,
  SelectionStatus,
  type NormalizedSelection,
} from "../model";

export interface RawStakeSelection {
  sourceSelectionId?: string;
  oddId?: string;
  rawSelectionName: string;
  oddDecimal: number;
  additionalValue?: string;
  teamSide?: string;
  ttl?: string;
  locked: boolean;
}

export interface RawStakeMarket {
  sourceMarketId?: string;
  rawMarketName: string;
  displayOrder: number;
  selections: RawStakeSelection[];
}

export interface NormalizationInput {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  markets: RawStakeMarket[];
}

export interface NormalizedMarket {
  id: string;
  matchId: string;
  marketType: MarketType;
  rawMarketName: string;
  sourceMarketId?: string;
  displayOrder: number;
  supported: boolean;
  selections: NormalizedSelection[];
}

const MARKET_PRIORITY: Record<MarketType, number> = {
  [MarketType.MATCH_RESULT]: 10,
  [MarketType.DOUBLE_CHANCE]: 20,
  [MarketType.DRAW_NO_BET]: 30,
  [MarketType.TOTAL_GOALS]: 40,
  [MarketType.BOTH_TEAMS_TO_SCORE]: 50,
  [MarketType.FIRST_TEAM_TO_SCORE]: 60,
  [MarketType.TOTAL_YELLOW_CARDS]: 70,
  [MarketType.TOTAL_CORNERS]: 80,
  [MarketType.TEAM_TOTAL_GOALS]: 90,
  [MarketType.HANDICAP]: 100,
  [MarketType.EXACT_SCORE]: 110,
  [MarketType.FIRST_HALF_TOTAL_GOALS]: 120,
  [MarketType.ANYTIME_GOALSCORER]: 130,
  [MarketType.PLAYER_SHOTS_ON_TARGET]: 140,
  [MarketType.UNSUPPORTED]: 900,
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function detectMarketType(rawName: string): MarketType {
  const name = normalizeText(rawName);

  if (/^(resultado|resultado del partido|match result|1x2)$/.test(name)) {
    return MarketType.MATCH_RESULT;
  }
  if (name.includes("doble oportunidad") || name === "double chance") {
    return MarketType.DOUBLE_CHANCE;
  }
  if (name.includes("ganador sin empate") || name.includes("draw no bet")) {
    return MarketType.DRAW_NO_BET;
  }
  if (
    name.includes("ambos equipos marcan") ||
    name.includes("ambos equipos anotan") ||
    name.includes("both teams to score")
  ) {
    return MarketType.BOTH_TEAMS_TO_SCORE;
  }
  if (
    name.includes("equipo que marca primero") ||
    name.includes("primer equipo en marcar") ||
    name.includes("equipo - primer gol")
  ) {
    return MarketType.FIRST_TEAM_TO_SCORE;
  }
  if (
    name.includes("total tarjetas amarillas") ||
    name.includes("total de tarjetas amarillas") ||
    name.includes("total yellow cards")
  ) {
    return MarketType.TOTAL_YELLOW_CARDS;
  }
  if (
    name.includes("total de corners") ||
    name.includes("total de corn") ||
    name.includes("total de esquinas") ||
    name.includes("total corners")
  ) {
    return MarketType.TOTAL_CORNERS;
  }
  if (
    name.includes("total de goles por equipo") ||
    name.includes("team total goals") ||
    name.includes("total del local") ||
    name.includes("total del visitante") ||
    name.includes("total de goles del local") ||
    name.includes("total de goles del visitante")
  ) {
    return MarketType.TEAM_TOTAL_GOALS;
  }
  if (name.includes("handicap") || name.includes("handicap")) {
    return MarketType.HANDICAP;
  }
  if (name.includes("marcador exacto") || name.includes("correct score")) {
    return MarketType.EXACT_SCORE;
  }
  if (
    name.includes("total") &&
    (name.includes("primer tiempo") ||
      name.includes("primera mitad") ||
      name.includes("1er tiempo") ||
      name.includes("1er mitad") ||
      name.includes("1ra mitad") ||
      name.includes("first half"))
  ) {
    return MarketType.FIRST_HALF_TOTAL_GOALS;
  }
  if (
    name.includes("goleador") ||
    name.includes("jugador que marca") ||
    name.includes("anytime goalscorer")
  ) {
    return MarketType.ANYTIME_GOALSCORER;
  }
  if (name.includes("tiros a puerta") || name.includes("shots on target")) {
    return MarketType.PLAYER_SHOTS_ON_TARGET;
  }
  if (
    name.includes("total de goles") ||
    name === "total goals" ||
    name === "total"
  ) {
    return MarketType.TOTAL_GOALS;
  }

  return MarketType.UNSUPPORTED;
}

export function displayNameForMarket(
  type: MarketType,
  rawName: string,
): string {
  switch (type) {
    case MarketType.MATCH_RESULT:
      return "Resultado";
    case MarketType.DOUBLE_CHANCE:
      return "Doble oportunidad";
    case MarketType.DRAW_NO_BET:
      return "Ganador sin empate";
    case MarketType.TOTAL_GOALS:
      return "Total de goles";
    case MarketType.BOTH_TEAMS_TO_SCORE:
      return "Ambos equipos marcan";
    case MarketType.FIRST_TEAM_TO_SCORE:
      return "Equipo que marca primero";
    case MarketType.TOTAL_YELLOW_CARDS:
      return "Total de tarjetas amarillas";
    case MarketType.TOTAL_CORNERS:
      return "Total de corners";
    case MarketType.TEAM_TOTAL_GOALS:
      return "Total de goles por equipo";
    case MarketType.HANDICAP:
      return "Handicap";
    case MarketType.EXACT_SCORE:
      return "Marcador exacto";
    case MarketType.FIRST_HALF_TOTAL_GOALS:
      return "Primer tiempo: total de goles";
    case MarketType.ANYTIME_GOALSCORER:
      return "Jugador que marca";
    case MarketType.PLAYER_SHOTS_ON_TARGET:
      return "Tiros a puerta por jugador";
    case MarketType.UNSUPPORTED:
      return rawName;
  }
}

export function normalizeStakeMarkets(
  input: NormalizationInput,
): NormalizedMarket[] {
  return input.markets
    .map((market, marketIndex) => {
      const marketType = detectMarketType(market.rawMarketName);
      const marketId = stableId(
        "market",
        market.sourceMarketId ?? `${market.rawMarketName}-${marketIndex}`,
      );
      const selections = market.selections.map((selection, selectionIndex) =>
        normalizeSelection({
          selection,
          selectionIndex,
          market,
          marketId,
          marketType,
          input,
        }),
      );

      return {
        id: marketId,
        matchId: input.matchId,
        marketType,
        rawMarketName: market.rawMarketName,
        sourceMarketId: market.sourceMarketId,
        displayOrder: MARKET_PRIORITY[marketType] + market.displayOrder,
        supported: marketType !== MarketType.UNSUPPORTED,
        selections,
      };
    })
    .filter((market) => market.selections.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

function normalizeSelection(args: {
  selection: RawStakeSelection;
  selectionIndex: number;
  market: RawStakeMarket;
  marketId: string;
  marketType: MarketType;
  input: NormalizationInput;
}): NormalizedSelection {
  const { selection, selectionIndex, market, marketId, marketType, input } =
    args;
  const parsed = inferSelection(
    selection,
    marketType,
    input.homeTeamName,
    input.awayTeamName,
  );

  return {
    id: stableId(
      "selection",
      `${marketId}-${selection.sourceSelectionId ?? selection.oddId ?? selection.rawSelectionName}-${selectionIndex}`,
    ),
    matchId: input.matchId,
    marketType,
    operator: parsed.operator,
    participantType: parsed.participantType,
    participantId: parsed.participantId,
    participantName: parsed.participantName,
    line: parsed.line,
    exactHomeScore: parsed.exactHomeScore,
    exactAwayScore: parsed.exactAwayScore,
    oddDecimal: selection.oddDecimal,
    status:
      marketType === MarketType.UNSUPPORTED
        ? SelectionStatus.UNSUPPORTED
        : SelectionStatus.PENDING,
    resolutionReason:
      marketType === MarketType.UNSUPPORTED
        ? "Este mercado todavia no puede evaluarse automaticamente."
        : undefined,
    sourceMarketId: market.sourceMarketId,
    sourceSelectionId: selection.sourceSelectionId ?? selection.oddId,
    rawMarketName: market.rawMarketName,
    rawSelectionName: selection.rawSelectionName,
  };
}

function inferSelection(
  selection: RawStakeSelection,
  marketType: MarketType,
  homeTeamName: string,
  awayTeamName: string,
): Pick<
  NormalizedSelection,
  | "operator"
  | "participantType"
  | "participantId"
  | "participantName"
  | "line"
  | "exactHomeScore"
  | "exactAwayScore"
> {
  const text = normalizeText(selection.rawSelectionName);
  const home = normalizeText(homeTeamName);
  const away = normalizeText(awayTeamName);
  const token = normalizeText(
    `${selection.sourceSelectionId ?? ""} ${selection.oddId ?? ""} ${selection.ttl ?? ""}`,
  );
  const line = parseLine(
    selection.additionalValue ?? selection.rawSelectionName,
  );

  if (marketType === MarketType.MATCH_RESULT) {
    if (isTeamNameMatch(text, home)) {
      return team(
        SelectionOperator.HOME,
        ParticipantType.HOME_TEAM,
        homeTeamName,
      );
    }
    if (isTeamNameMatch(text, away)) {
      return team(
        SelectionOperator.AWAY,
        ParticipantType.AWAY_TEAM,
        awayTeamName,
      );
    }
    return base(SelectionOperator.DRAW);
  }

  if (marketType === MarketType.DOUBLE_CHANCE) {
    if (
      text.includes("1x") ||
      text.includes("local o empate") ||
      text.includes("empate o local")
    ) {
      return base(SelectionOperator.HOME_OR_DRAW);
    }
    if (
      text.includes("12") ||
      text.includes("local o visitante") ||
      text.includes("visitante o local")
    ) {
      return base(SelectionOperator.HOME_OR_AWAY);
    }
    return base(SelectionOperator.DRAW_OR_AWAY);
  }

  if (marketType === MarketType.DRAW_NO_BET) {
    return isTeamNameMatch(text, away)
      ? team(SelectionOperator.AWAY, ParticipantType.AWAY_TEAM, awayTeamName)
      : team(SelectionOperator.HOME, ParticipantType.HOME_TEAM, homeTeamName);
  }

  if (
    [
      MarketType.TOTAL_GOALS,
      MarketType.TOTAL_YELLOW_CARDS,
      MarketType.TOTAL_CORNERS,
      MarketType.FIRST_HALF_TOTAL_GOALS,
      MarketType.TEAM_TOTAL_GOALS,
      MarketType.PLAYER_SHOTS_ON_TARGET,
    ].includes(marketType)
  ) {
    const operator =
      text.includes("menos") ||
      text.includes("inferior") ||
      text.includes("abajo de") ||
      text.includes("debajo de") ||
      text.includes("under") ||
      token.includes("_und")
        ? SelectionOperator.UNDER
        : SelectionOperator.OVER;
    const participant =
      marketType === MarketType.PLAYER_SHOTS_ON_TARGET
        ? {
            participantType: ParticipantType.PLAYER,
            participantName: stripLineWords(selection.rawSelectionName),
            participantId: playerId(stripLineWords(selection.rawSelectionName)),
          }
        : teamTotalParticipant(
            text,
            home,
            away,
            homeTeamName,
            awayTeamName,
            selection.teamSide,
          );

    return {
      operator,
      participantType: participant.participantType,
      participantName: participant.participantName,
      participantId: participant.participantId,
      line,
    };
  }

  if (marketType === MarketType.BOTH_TEAMS_TO_SCORE) {
    return base(
      /\b(si|yes|s)\b/.test(text)
        ? SelectionOperator.YES
        : SelectionOperator.NO,
    );
  }

  if (marketType === MarketType.FIRST_TEAM_TO_SCORE) {
    if (text.includes("ninguno") || text.includes("no goal")) {
      return base(SelectionOperator.NO);
    }
    if (isTeamNameMatch(text, away)) {
      return team(
        SelectionOperator.AWAY,
        ParticipantType.AWAY_TEAM,
        awayTeamName,
      );
    }
    return team(
      SelectionOperator.HOME,
      ParticipantType.HOME_TEAM,
      homeTeamName,
    );
  }

  if (marketType === MarketType.EXACT_SCORE) {
    const [exactHomeScore, exactAwayScore] = parseExactScore(text);
    return {
      ...base(SelectionOperator.EXACT),
      exactHomeScore,
      exactAwayScore,
    };
  }

  if (marketType === MarketType.ANYTIME_GOALSCORER) {
    const playerName = selection.rawSelectionName.trim();
    return {
      operator: SelectionOperator.PLAYER,
      participantType: ParticipantType.PLAYER,
      participantName: playerName,
      participantId: playerId(playerName),
    };
  }

  if (marketType === MarketType.HANDICAP) {
    const participant = isTeamNameMatch(text, away)
      ? team(SelectionOperator.AWAY, ParticipantType.AWAY_TEAM, awayTeamName)
      : team(SelectionOperator.HOME, ParticipantType.HOME_TEAM, homeTeamName);
    return { ...participant, line };
  }

  return base(SelectionOperator.EXACT);
}

function base(
  operator: SelectionOperator,
): Pick<NormalizedSelection, "operator" | "participantType"> {
  return { operator, participantType: ParticipantType.MATCH };
}

function team(
  operator: SelectionOperator,
  participantType: ParticipantType.HOME_TEAM | ParticipantType.AWAY_TEAM,
  participantName: string,
): Pick<
  NormalizedSelection,
  "operator" | "participantType" | "participantName"
> {
  return { operator, participantType, participantName };
}

function teamTotalParticipant(
  text: string,
  home: string,
  away: string,
  homeTeamName: string,
  awayTeamName: string,
  teamSide?: string,
): Pick<
  NormalizedSelection,
  "participantType" | "participantName" | "participantId"
> {
  if (isTeamNameMatch(text, home)) {
    return {
      participantType: ParticipantType.HOME_TEAM,
      participantName: homeTeamName,
    };
  }
  if (isTeamNameMatch(text, away)) {
    return {
      participantType: ParticipantType.AWAY_TEAM,
      participantName: awayTeamName,
    };
  }
  if (teamSide === "1") {
    return {
      participantType: ParticipantType.HOME_TEAM,
      participantName: homeTeamName,
    };
  }
  if (teamSide === "2") {
    return {
      participantType: ParticipantType.AWAY_TEAM,
      participantName: awayTeamName,
    };
  }
  return { participantType: ParticipantType.MATCH };
}

function parseLine(value: string): number | undefined {
  const match = value.replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function parseExactScore(
  text: string,
): [number | undefined, number | undefined] {
  const match = text.match(/(\d+)\s*[-:]\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : [undefined, undefined];
}

function stripLineWords(value: string): string {
  return value
    .replace(/(?:m[aá]s|menos)\s+de\s+[-+]?\d+(?:[.,]\d+)?/gi, "")
    .replace(/(?:over|under)\s+[-+]?\d+(?:[.,]\d+)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTeamNameMatch(candidate: string, team: string): boolean {
  return (
    candidate === team ||
    candidate.startsWith(`${team} `) ||
    candidate.endsWith(` ${team}`)
  );
}

function stableId(prefix: string, value: string): string {
  const normalized = normalizeText(value);
  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `${prefix}_${hash.toString(36)}`;
}

function playerId(value: string): string {
  return `player_${normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}
