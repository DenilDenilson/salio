import {
  MarketType,
  SelectionOperator,
  type NormalizedSelection,
} from "../model";

export function selectionDisplayName(selection: NormalizedSelection): string {
  const rawName = selection.rawSelectionName.trim();

  if (selection.marketType === MarketType.EXACT_SCORE) {
    return exactScoreName(selection, rawName);
  }

  if (
    [
      MarketType.TOTAL_GOALS,
      MarketType.TEAM_TOTAL_GOALS,
      MarketType.FIRST_HALF_TOTAL_GOALS,
      MarketType.TOTAL_YELLOW_CARDS,
      MarketType.TOTAL_CORNERS,
      MarketType.PLAYER_SHOTS_ON_TARGET,
      MarketType.HANDICAP,
    ].includes(selection.marketType)
  ) {
    return lineSelectionName(selection, rawName);
  }

  return rawName;
}

function exactScoreName(
  selection: NormalizedSelection,
  rawName: string,
): string {
  if (/\d+\s*[-:]\s*\d+/.test(rawName)) {
    return rawName;
  }
  if (
    selection.exactHomeScore !== undefined &&
    selection.exactAwayScore !== undefined
  ) {
    return `${selection.exactHomeScore} - ${selection.exactAwayScore}`;
  }
  return rawName;
}

function lineSelectionName(
  selection: NormalizedSelection,
  rawName: string,
): string {
  if (selection.line === undefined || /[-+]?\d+(?:[.,]\d+)?/.test(rawName)) {
    return rawName;
  }

  const operator = lineOperatorLabel(selection.operator);
  if (!operator) {
    return rawName;
  }

  const cleanedName = rawName
    .replace(/\b(SUPERIOR|INFERIOR|OVER|UNDER)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const line = formatLine(selection.line);

  if (!cleanedName || /^(m[aá]s|menos)\s+de$/i.test(cleanedName)) {
    return `${operator} ${line}`;
  }

  return `${cleanedName} ${operator.toLowerCase()} ${line}`;
}

function lineOperatorLabel(operator: SelectionOperator): string | null {
  if (operator === SelectionOperator.OVER) {
    return "Más de";
  }
  if (operator === SelectionOperator.UNDER) {
    return "Menos de";
  }
  return null;
}

function formatLine(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}
