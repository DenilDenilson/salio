import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../server/auth/session";
import { AppError, publicErrorMessage } from "../../../../../server/errors";
import { getServices } from "../../../../../server/runtime";
import { refreshMatchIfStale } from "../../../../../server/services/refresh";

export const POST: APIRoute = async (context) => {
  const services = await getServices();
  try {
    requireAdmin(context, services.config);
    const match = await services.store.getMatchById(context.params.id ?? "");
    if (!match) {
      throw new AppError("MATCH_NOT_FOUND", "Match not found.", 404);
    }
    const state = await refreshMatchIfStale({
      slug: match.slug,
      store: services.store,
      cache: services.cache,
      provider: services.provider,
      force: true,
      options: {
        pollMs: services.config.PUBLIC_STATE_POLL_INTERVAL_MS,
        eventsRefreshMs: services.config.EVENTS_REFRESH_INTERVAL_MS,
        statsRefreshMs: services.config.STATS_REFRESH_INTERVAL_MS,
        playerStatsRefreshMs: services.config.PLAYER_STATS_REFRESH_INTERVAL_MS,
      },
    });
    return json({ ok: true, state });
  } catch (error) {
    return errorJson(error);
  }
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function errorJson(error: unknown) {
  const appError =
    error instanceof AppError
      ? error
      : new AppError("VALIDATION_FAILED", "Validation failed.", 400);
  return json(
    { ok: false, error: publicErrorMessage(appError.code) },
    appError.status,
  );
}
