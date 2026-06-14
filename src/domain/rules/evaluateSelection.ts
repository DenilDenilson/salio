import {
  FixtureStatus,
  MarketType,
  ParticipantType,
  SelectionOperator,
  SelectionStatus,
  isFinalStatus,
  isUnresolvableStatus,
  type NormalizedSelection,
  type RuleEvaluation,
  type RuleEvaluationContext,
} from "../model";

type Strategy = (
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
) => RuleEvaluation;

const strategies: Partial<Record<MarketType, Strategy>> = {
  [MarketType.MATCH_RESULT]: evaluateMatchResult,
  [MarketType.DOUBLE_CHANCE]: evaluateDoubleChance,
  [MarketType.DRAW_NO_BET]: evaluateDrawNoBet,
  [MarketType.TOTAL_GOALS]: (selection, context) =>
    evaluateTotal(
      selection,
      context,
      context.score.home + context.score.away,
      "goles",
    ),
  [MarketType.TEAM_TOTAL_GOALS]: evaluateTeamTotalGoals,
  [MarketType.BOTH_TEAMS_TO_SCORE]: evaluateBothTeamsToScore,
  [MarketType.EXACT_SCORE]: evaluateExactScore,
  [MarketType.FIRST_TEAM_TO_SCORE]: evaluateFirstTeamToScore,
  [MarketType.FIRST_HALF_TOTAL_GOALS]: evaluateFirstHalfTotalGoals,
  [MarketType.TOTAL_YELLOW_CARDS]: (selection, context) =>
    evaluateNullableTotal(
      selection,
      context,
      addKnownValues(context.yellowCards.home, context.yellowCards.away),
      "tarjetas amarillas",
    ),
  [MarketType.TOTAL_CORNERS]: (selection, context) =>
    evaluateNullableTotal(
      selection,
      context,
      addKnownValues(context.corners.home, context.corners.away),
      "corners",
    ),
  [MarketType.ANYTIME_GOALSCORER]: evaluateAnytimeGoalscorer,
  [MarketType.PLAYER_SHOTS_ON_TARGET]: evaluatePlayerShotsOnTarget,
};

export function evaluateSelection(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  if (isUnresolvableStatus(context.fixtureStatus)) {
    return preserveResolved(
      selection,
      pending("Partido sin estado final liquidable."),
    );
  }

  if (selection.marketType === MarketType.UNSUPPORTED) {
    return unsupported(
      "Este mercado todavia no puede evaluarse automaticamente.",
    );
  }

  const strategy = strategies[selection.marketType];
  if (!strategy) {
    return unsupported("No hay regla implementada para este mercado.");
  }

  return preserveResolved(selection, strategy(selection, context));
}

function evaluateMatchResult(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  if (!isFinalStatus(context.fixtureStatus)) {
    return pending("El resultado se liquida cuando termina el partido.");
  }

  const winner = matchWinner(context.score.home, context.score.away);
  const won =
    (winner === "HOME" && selection.operator === SelectionOperator.HOME) ||
    (winner === "DRAW" && selection.operator === SelectionOperator.DRAW) ||
    (winner === "AWAY" && selection.operator === SelectionOperator.AWAY);

  return resolved(
    won ? SelectionStatus.WON : SelectionStatus.LOST,
    context,
    `Resultado final ${scoreText(context)}.`,
  );
}

function evaluateDoubleChance(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  if (!isFinalStatus(context.fixtureStatus)) {
    return pending(
      "La doble oportunidad se liquida cuando termina el partido.",
    );
  }

  const winner = matchWinner(context.score.home, context.score.away);
  const won =
    (selection.operator === SelectionOperator.HOME_OR_DRAW &&
      (winner === "HOME" || winner === "DRAW")) ||
    (selection.operator === SelectionOperator.HOME_OR_AWAY &&
      (winner === "HOME" || winner === "AWAY")) ||
    (selection.operator === SelectionOperator.DRAW_OR_AWAY &&
      (winner === "DRAW" || winner === "AWAY"));

  return resolved(
    won ? SelectionStatus.WON : SelectionStatus.LOST,
    context,
    `Resultado final ${scoreText(context)}.`,
  );
}

function evaluateDrawNoBet(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  if (!isFinalStatus(context.fixtureStatus)) {
    return pending("Ganador sin empate se liquida cuando termina el partido.");
  }

  const winner = matchWinner(context.score.home, context.score.away);
  if (winner === "DRAW") {
    return resolved(
      SelectionStatus.VOID,
      context,
      "Empate final: seleccion anulada.",
    );
  }

  const won =
    (winner === "HOME" && selection.operator === SelectionOperator.HOME) ||
    (winner === "AWAY" && selection.operator === SelectionOperator.AWAY);
  return resolved(
    won ? SelectionStatus.WON : SelectionStatus.LOST,
    context,
    `Resultado final ${scoreText(context)}.`,
  );
}

function evaluateTotal(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
  total: number,
  label: string,
): RuleEvaluation {
  if (selection.line === undefined) {
    return unsupported(`Falta la linea para evaluar ${label}.`);
  }

  if (selection.operator === SelectionOperator.OVER) {
    if (total > selection.line) {
      return resolved(
        SelectionStatus.WON,
        context,
        `El total llego a ${total} ${label}.`,
      );
    }
    if (isFinalStatus(context.fixtureStatus)) {
      return resolved(
        SelectionStatus.LOST,
        context,
        `El total termino en ${total} ${label}.`,
      );
    }
    return pending(`El total actual es ${total} ${label}.`);
  }

  if (selection.operator === SelectionOperator.UNDER) {
    if (total > selection.line) {
      return resolved(
        SelectionStatus.LOST,
        context,
        `El total llego a ${total} ${label}.`,
      );
    }
    if (isFinalStatus(context.fixtureStatus)) {
      if (Number.isInteger(selection.line) && total === selection.line) {
        return resolved(
          SelectionStatus.VOID,
          context,
          `El total termino exactamente en la linea ${selection.line}.`,
        );
      }
      return resolved(
        SelectionStatus.WON,
        context,
        `El total termino en ${total} ${label}.`,
      );
    }
    return pending(`El total actual es ${total} ${label}.`);
  }

  return unsupported(`Operador no soportado para ${label}.`);
}

function evaluateNullableTotal(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
  total: number | null,
  label: string,
): RuleEvaluation {
  if (total === null) {
    return unsupported(`Faltan datos confiables de ${label}.`);
  }
  return evaluateTotal(selection, context, total, label);
}

function addKnownValues(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left + right;
}

function evaluateTeamTotalGoals(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  const total =
    selection.participantType === ParticipantType.HOME_TEAM
      ? context.score.home
      : selection.participantType === ParticipantType.AWAY_TEAM
        ? context.score.away
        : undefined;
  if (total === undefined) {
    return unsupported("Falta el equipo para evaluar el total.");
  }
  return evaluateTotal(selection, context, total, "goles del equipo");
}

function evaluateBothTeamsToScore(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  const bothScored = context.score.home > 0 && context.score.away > 0;

  if (selection.operator === SelectionOperator.YES) {
    if (bothScored) {
      return resolved(
        SelectionStatus.WON,
        context,
        "Ambos equipos ya marcaron.",
      );
    }
    if (isFinalStatus(context.fixtureStatus)) {
      return resolved(
        SelectionStatus.LOST,
        context,
        `Resultado final ${scoreText(context)}.`,
      );
    }
    return pending("Todavia falta que ambos equipos marquen.");
  }

  if (selection.operator === SelectionOperator.NO) {
    if (bothScored) {
      return resolved(
        SelectionStatus.LOST,
        context,
        "Ambos equipos ya marcaron.",
      );
    }
    if (isFinalStatus(context.fixtureStatus)) {
      return resolved(
        SelectionStatus.WON,
        context,
        `Resultado final ${scoreText(context)}.`,
      );
    }
    return pending("Al menos un equipo sigue sin marcar.");
  }

  return unsupported("Operador no soportado para ambos marcan.");
}

function evaluateFirstTeamToScore(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  if (
    context.firstScoringTeam === "HOME" ||
    context.firstScoringTeam === "AWAY"
  ) {
    const won =
      (context.firstScoringTeam === "HOME" &&
        selection.operator === SelectionOperator.HOME) ||
      (context.firstScoringTeam === "AWAY" &&
        selection.operator === SelectionOperator.AWAY);
    return resolved(
      won ? SelectionStatus.WON : SelectionStatus.LOST,
      context,
      context.firstScoringTeam === "HOME"
        ? "El local marco primero."
        : "El visitante marco primero.",
    );
  }

  if (
    isFinalStatus(context.fixtureStatus) &&
    context.score.home === 0 &&
    context.score.away === 0
  ) {
    return resolved(
      selection.operator === SelectionOperator.NO
        ? SelectionStatus.WON
        : SelectionStatus.LOST,
      context,
      "El partido termino sin goles.",
    );
  }

  return pending("Aun no hay primer gol confirmado.");
}

function evaluateExactScore(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  if (
    selection.exactHomeScore === undefined ||
    selection.exactAwayScore === undefined
  ) {
    return unsupported("Falta el marcador exacto importado.");
  }

  if (
    context.score.home > selection.exactHomeScore ||
    context.score.away > selection.exactAwayScore
  ) {
    return resolved(
      SelectionStatus.LOST,
      context,
      `El marcador actual ${scoreText(context)} excede la seleccion.`,
    );
  }

  if (!isFinalStatus(context.fixtureStatus)) {
    return pending(`Marcador actual ${scoreText(context)}.`);
  }

  const won =
    context.score.home === selection.exactHomeScore &&
    context.score.away === selection.exactAwayScore;
  return resolved(
    won ? SelectionStatus.WON : SelectionStatus.LOST,
    context,
    `Resultado final ${scoreText(context)}.`,
  );
}

function evaluateFirstHalfTotalGoals(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  const halftimeHome = context.score.halftimeHome;
  const halftimeAway = context.score.halftimeAway;
  if (halftimeHome === undefined || halftimeAway === undefined) {
    if (
      [FixtureStatus.NOT_STARTED, FixtureStatus.LIVE].includes(
        context.fixtureStatus,
      )
    ) {
      return pending("El primer tiempo todavia no esta cerrado.");
    }
    return unsupported("Falta el marcador del primer tiempo.");
  }
  return evaluateTotal(
    selection,
    { ...context, fixtureStatus: FixtureStatus.FINISHED },
    halftimeHome + halftimeAway,
    "goles del primer tiempo",
  );
}

function evaluateAnytimeGoalscorer(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  const stats = selection.participantId
    ? context.playerStats[selection.participantId]
    : undefined;
  if (!stats) {
    return unsupported("No hay estadisticas confiables para este jugador.");
  }
  if (stats.goals === null) {
    return unsupported("Faltan goles confiables para este jugador.");
  }
  if (stats.goals > 0) {
    return resolved(
      SelectionStatus.WON,
      context,
      `${selection.participantName ?? "El jugador"} ya marco.`,
    );
  }
  if (isFinalStatus(context.fixtureStatus)) {
    return resolved(
      stats.appeared ? SelectionStatus.LOST : SelectionStatus.VOID,
      context,
      stats.appeared
        ? "El jugador participo y no marco."
        : "El jugador no participo.",
    );
  }
  return pending("El jugador aun puede marcar.");
}

function evaluatePlayerShotsOnTarget(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation {
  const stats = selection.participantId
    ? context.playerStats[selection.participantId]
    : undefined;
  if (!stats) {
    return unsupported(
      "No hay estadisticas de tiros a puerta para este jugador.",
    );
  }
  if (stats.shotsOnTarget === null) {
    return unsupported(
      "Faltan estadisticas confiables de tiros a puerta para este jugador.",
    );
  }
  return evaluateTotal(
    selection,
    context,
    stats.shotsOnTarget,
    "tiros a puerta del jugador",
  );
}

function preserveResolved(
  selection: NormalizedSelection,
  next: RuleEvaluation,
): RuleEvaluation {
  const resolvedStatuses = [
    SelectionStatus.WON,
    SelectionStatus.LOST,
    SelectionStatus.VOID,
  ];
  if (
    next.status === SelectionStatus.PENDING &&
    resolvedStatuses.includes(selection.status)
  ) {
    return {
      status: selection.status,
      resolvedAt: selection.resolvedAt
        ? new Date(selection.resolvedAt)
        : undefined,
      resolvedMinute: selection.resolvedMinute,
      reason:
        selection.resolutionReason ??
        "Estado resuelto preservado hasta reconstruccion oficial.",
    };
  }
  return next;
}

function pending(reason: string): RuleEvaluation {
  return { status: SelectionStatus.PENDING, reason };
}

function unsupported(reason: string): RuleEvaluation {
  return { status: SelectionStatus.UNSUPPORTED, reason };
}

function resolved(
  status: SelectionStatus,
  context: RuleEvaluationContext,
  reason: string,
): RuleEvaluation {
  return {
    status,
    resolvedAt: context.now,
    resolvedMinute: context.elapsedMinutes,
    reason,
  };
}

function matchWinner(home: number, away: number): "HOME" | "DRAW" | "AWAY" {
  if (home > away) {
    return "HOME";
  }
  if (away > home) {
    return "AWAY";
  }
  return "DRAW";
}

function scoreText(context: RuleEvaluationContext): string {
  return `${context.score.home}-${context.score.away}`;
}
