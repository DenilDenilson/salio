export type AppErrorCode =
  | "STAKE_INVALID_URL"
  | "STAKE_EVENT_NOT_FOUND"
  | "STAKE_PAGE_TIMEOUT"
  | "STAKE_BLOCKED_OR_CHALLENGED"
  | "STAKE_NO_MARKETS_FOUND"
  | "STAKE_SCHEMA_CHANGED"
  | "STAKE_IMPORT_ALREADY_FROZEN"
  | "SPORTS_PROVIDER_UNAUTHORIZED"
  | "SPORTS_PROVIDER_RATE_LIMITED"
  | "SPORTS_FIXTURE_NOT_FOUND"
  | "SPORTS_PROVIDER_TIMEOUT"
  | "SPORTS_PROVIDER_INVALID_RESPONSE"
  | "MATCH_NOT_FOUND"
  | "MATCH_NOT_PUBLISHED"
  | "FIXTURE_MAPPING_REQUIRED"
  | "LOCK_NOT_ACQUIRED"
  | "STALE_DATA_RETURNED"
  | "ADMIN_UNAUTHORIZED"
  | "VALIDATION_FAILED";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function publicErrorMessage(code: AppErrorCode): string {
  if (code.startsWith("STAKE_")) {
    return "No se pudo importar el evento de Stake.";
  }
  if (code.startsWith("SPORTS_")) {
    return "No se pudo actualizar el proveedor deportivo.";
  }
  if (code === "MATCH_NOT_FOUND") {
    return "Partido no encontrado.";
  }
  if (code === "MATCH_NOT_PUBLISHED") {
    return "Partido no publicado.";
  }
  return "No se pudo completar la operacion.";
}
