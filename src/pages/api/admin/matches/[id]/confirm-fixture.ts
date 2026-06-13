import type { APIRoute } from "astro";
import { z } from "zod";
import { requireAdmin } from "../../../../../server/auth/session";
import { AppError, publicErrorMessage } from "../../../../../server/errors";
import { getServices } from "../../../../../server/runtime";

const BodySchema = z.object({ fixtureId: z.number().int().positive() });

export const POST: APIRoute = async (context) => {
  const services = await getServices();
  try {
    const admin = requireAdmin(context, services.config);
    const { fixtureId } = BodySchema.parse(await context.request.json());
    const match = await services.store.confirmFixture(
      context.params.id ?? "",
      fixtureId,
      admin.email,
    );
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
