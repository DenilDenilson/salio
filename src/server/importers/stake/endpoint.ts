import { AppError } from "../../errors";

export function stakeEventIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const eventIndex = segments.lastIndexOf("event");
    return eventIndex >= 0 ? (segments[eventIndex + 1] ?? null) : null;
  } catch {
    return null;
  }
}

export function requireStakeEventId(url: string): string {
  const eventId = stakeEventIdFromUrl(url);
  if (!eventId) {
    throw new AppError(
      "STAKE_EVENT_NOT_FOUND",
      "Stake event id could not be extracted from the public URL.",
    );
  }
  return eventId;
}

export function validateStakeApiUrl(
  url: string,
  input: { expectedEventId: string; allowedHosts: string[] },
): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(
      "STAKE_API_URL_NOT_RESOLVED",
      "Stake API URL is not a valid URL.",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new AppError(
      "STAKE_API_URL_NOT_RESOLVED",
      "Stake API URL must use HTTPS.",
    );
  }
  if (!isAllowedStakeApiHost(parsed.hostname, input.allowedHosts)) {
    throw new AppError(
      "STAKE_API_HOST_NOT_ALLOWED",
      `Stake API host is not allowed: ${parsed.hostname}`,
    );
  }
  if (!parsed.pathname.endsWith("/single-pre-event.json")) {
    throw new AppError(
      "STAKE_API_URL_NOT_RESOLVED",
      "Stake API URL must point to single-pre-event.json.",
    );
  }
  const apiEventId = stakeApiEventIdFromUrl(parsed);
  if (apiEventId !== input.expectedEventId) {
    throw new AppError(
      "STAKE_API_EVENT_ID_MISMATCH",
      `Stake API URL event id does not match public URL event id. API URL: ${redactStakeApiUrl(parsed.toString())}`,
    );
  }
  return parsed;
}

export function stakeApiEventIdFromUrl(url: string | URL): string | null {
  const parsed = typeof url === "string" ? new URL(url) : url;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const fileIndex = segments.lastIndexOf("single-pre-event.json");
  if (fileIndex <= 0) {
    return null;
  }
  return segments[fileIndex - 1] ?? null;
}

export function isAllowedStakeApiHost(
  hostname: string,
  allowedHosts: string[],
): boolean {
  const normalized = hostname.toLowerCase();
  return allowedHosts.some((host) => {
    const allowed = host.trim().toLowerCase();
    if (!allowed) {
      return false;
    }
    if (allowed.startsWith(".")) {
      return normalized.endsWith(allowed) && normalized.length > allowed.length;
    }
    return normalized === allowed;
  });
}

export function redactStakeApiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (key.toLowerCase() === "hidenseek") {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return url.replace(/(hidenseek=)[^&\s]+/gi, "$1[REDACTED]");
  }
}
