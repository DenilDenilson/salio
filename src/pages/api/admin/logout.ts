import type { APIRoute } from "astro";
import { clearSessionCookies } from "../../../server/auth/session";

export const POST: APIRoute = async (context) => {
  clearSessionCookies(context.cookies);
  return context.redirect("/admin", 303);
};
