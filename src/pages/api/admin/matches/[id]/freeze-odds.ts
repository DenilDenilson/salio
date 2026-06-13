import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../../server/auth/session";
import { AppError, publicErrorMessage } from "../../../../../server/errors";
import { getServices } from "../../../../../server/runtime";

export const POST: APIRoute = async (context) => {
  const services = await getServices();
  try {
    requireAdmin(context, services.config);
    const snapshot = await services.store.freezeOdds(
      context.params.id ?? "",
      new Date(),
      true,
    );
    return json({ ok: true, snapshotId: snapshot.id });
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
