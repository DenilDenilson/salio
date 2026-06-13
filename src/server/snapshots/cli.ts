export type CliArgs = Record<string, string | true>;

export function parseCliArgs(values: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const body = value.slice(2);
    const equalsIndex = body.indexOf("=");
    if (equalsIndex >= 0) {
      args[body.slice(0, equalsIndex)] = body.slice(equalsIndex + 1);
      continue;
    }

    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      args[body] = next;
      index += 1;
      continue;
    }
    args[body] = true;
  }
  return args;
}

export function requireStringArg(args: CliArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required argument --${key}.`);
  }
  return value;
}

export function optionalStringArg(args: CliArgs, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function parseMatchTitleTeams(
  title: string | null,
): { home: string; away: string } | null {
  if (!title) {
    return null;
  }
  const [home, away] = title
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+vs\.?\s+/i);
  return home && away ? { home, away } : null;
}

export function optionalNumberArg(args: CliArgs, key: string): number | null {
  const value = optionalStringArg(args, key);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Argument --${key} must be an integer.`);
  }
  return parsed;
}

export function booleanFlag(args: CliArgs, key: string): boolean {
  const value = args[key];
  return value === true || value === "true" || value === "1";
}
