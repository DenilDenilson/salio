import type { APIRoute } from "astro";
import { z } from "zod";
import { requireAdmin } from "../../../../../server/auth/session";
import { AppError, publicErrorMessage } from "../../../../../server/errors";
import { getServices } from "../../../../../server/runtime";
import { importStakeForMatch } from "../../../../../server/services/admin";

const BodySchema = z.object({ url: z.string().url() });

export const POST: APIRoute = async (context) => {
  const services = await getServices();
  try {
    requireAdmin(context, services.config);
    const { url } = BodySchema.parse(await context.request.json());
    const snapshot = await importStakeForMatch({
      store: services.store,
      importer: services.importer,
      config: services.config,
      matchId: context.params.id ?? "",
      url,
    });
    return json({
      ok: true,
      snapshotId: snapshot.id,
      markets: snapshot.markets.length,
    });
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
