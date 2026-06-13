import type { APIRoute } from "astro";
import { requireAdmin } from "../../../server/auth/session";
import { AppError, publicErrorMessage } from "../../../server/errors";
import { getServices } from "../../../server/runtime";
import { createMatch } from "../../../server/services/admin";

export const GET: APIRoute = async (context) => {
  const services = await getServices();
  try {
    requireAdmin(context, services.config);
    return json({ matches: await services.store.listMatches() });
  } catch (error) {
    return errorJson(error);
  }
};

export const POST: APIRoute = async (context) => {
  const services = await getServices();
  try {
    requireAdmin(context, services.config);
    const payload = (await context.request.json()) as unknown;
    const match = await createMatch({
      store: services.store,
      config: services.config,
      form: payload,
    });
    return json({ ok: true, match });
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
