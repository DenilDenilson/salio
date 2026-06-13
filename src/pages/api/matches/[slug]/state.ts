import type { APIRoute } from "astro";
import { AppError, publicErrorMessage } from "../../../../server/errors";
import { getServices } from "../../../../server/runtime";
import { refreshMatchIfStale } from "../../../../server/services/refresh";

export const GET: APIRoute = async ({ params }) => {
  const services = await getServices();
  try {
    const state = await refreshMatchIfStale({
      slug: params.slug ?? "",
      store: services.store,
      cache: services.cache,
      provider: services.provider,
      options: {
        pollMs: services.config.PUBLIC_STATE_POLL_INTERVAL_MS,
        eventsRefreshMs: services.config.EVENTS_REFRESH_INTERVAL_MS,
        statsRefreshMs: services.config.STATS_REFRESH_INTERVAL_MS,
        playerStatsRefreshMs: services.config.PLAYER_STATS_REFRESH_INTERVAL_MS,
      },
    });
    return json(state, 200, {
      "cache-control": "private, max-age=2, stale-while-revalidate=8",
    });
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "SPORTS_PROVIDER_INVALID_RESPONSE",
            "Unexpected state error.",
            500,
          );
    return json({ error: publicErrorMessage(appError.code) }, appError.status, {
      "cache-control": "no-store",
    });
  }
};

function json(
  payload: unknown,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}
