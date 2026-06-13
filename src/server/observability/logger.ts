export interface LogFields {
  requestId?: string;
  matchId?: string;
  fixtureId?: number;
  operation: string;
  provider?: string;
  durationMs?: number;
  cacheHit?: boolean;
  stale?: boolean;
  lockAcquired?: boolean;
  selectionChanges?: number;
  errorCode?: string;
}

export function logInfo(fields: LogFields): void {
  console.info(
    JSON.stringify({ level: "info", ts: new Date().toISOString(), ...fields }),
  );
}

export function logError(fields: LogFields, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(
    JSON.stringify({
      level: "error",
      ts: new Date().toISOString(),
      message,
      ...fields,
    }),
  );
}
