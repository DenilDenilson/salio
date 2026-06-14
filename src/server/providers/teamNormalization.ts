export const FIXTURE_KICKOFF_TOLERANCE_MINUTES = 120;

const teamAliases = new Map<string, string>([
  ["brasil", "brazil"],
  ["marruecos", "morocco"],
  ["catar", "qatar"],
  ["suiza", "switzerland"],
  ["haiti", "haiti"],
  ["escocia", "scotland"],
  ["canada", "canada"],
  ["bosnia y herzegovina", "bosnia and herzegovina"],
  ["australia", "australia"],
  ["turquia", "turkey"],
  ["turkiye", "turkey"],
  ["paises bajos", "netherlands"],
  ["japon", "japan"],
]);

export function normalizeProviderText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeProviderTeamName(value: string): string {
  const normalized = normalizeProviderText(value)
    .replace(/\b(fc|cf|sc|club|de|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return teamAliases.get(normalized) ?? normalized;
}

export function providerTeamNamesMatch(left: string, right: string): boolean {
  return normalizeProviderTeamName(left) === normalizeProviderTeamName(right);
}

export function providerNameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeProviderTeamName(left);
  const normalizedRight = normalizeProviderTeamName(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const leftTokens = new Set(normalizedLeft.split(" "));
  const rightTokens = new Set(normalizedRight.split(" "));
  const overlap = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size, 1);
}

export function playerIdFromName(value: string): string {
  const normalized = normalizeProviderText(value).replace(/[^a-z0-9]+/g, "-");
  return `player_${normalized.replace(/^-|-$/g, "")}`;
}

export function competitionLeagueSlugForName(
  competitionName: string | null | undefined,
): string | null {
  if (!competitionName) {
    return null;
  }
  const normalized = normalizeProviderText(competitionName);
  if (
    normalized.includes("fifa world cup") ||
    normalized.includes("world cup") ||
    normalized.includes("copa mundial") ||
    normalized.includes("mundial")
  ) {
    return "fifa.world";
  }
  return null;
}
