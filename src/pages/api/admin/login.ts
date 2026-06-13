import type { APIRoute } from "astro";
import {
  createSession,
  setSessionCookies,
  verifyPassword,
} from "../../../server/auth/session";
import { getServices } from "../../../server/runtime";

export const POST: APIRoute = async (context) => {
  const { config } = await getServices();
  const form = await context.request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!verifyPassword(config, email, password)) {
    return new Response("Unauthorized", { status: 401 });
  }
  setSessionCookies(context.cookies, createSession(email, config));
  return context.redirect("/admin", 303);
};
