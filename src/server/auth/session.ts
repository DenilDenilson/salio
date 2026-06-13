import { createHmac, timingSafeEqual } from "node:crypto";
import type { APIContext, AstroCookies } from "astro";
import { type AppConfig } from "../config";
import { AppError } from "../errors";

const SESSION_COOKIE = "salio_admin";
const CSRF_COOKIE = "salio_csrf";

export function verifyPassword(
  config: AppConfig,
  email: string,
  password: string,
): boolean {
  if (email !== config.ADMIN_EMAIL) {
    return false;
  }
  if (config.ADMIN_PASSWORD_HASH === "demo") {
    return password === "admin";
  }
  const expected = config.ADMIN_PASSWORD_HASH;
  const actual = createHmac("sha256", config.ADMIN_SESSION_SECRET)
    .update(password)
    .digest("hex");
  return safeEqual(expected, actual);
}

export function createSession(
  email: string,
  config: AppConfig,
): { value: string; csrfToken: string } {
  const issuedAt = Date.now();
  const csrfToken = crypto.randomUUID();
  const payload = Buffer.from(
    JSON.stringify({ email, issuedAt, csrfToken }),
  ).toString("base64url");
  const signature = sign(payload, config.ADMIN_SESSION_SECRET);
  return { value: `${payload}.${signature}`, csrfToken };
}

export function readSession(
  request: Request,
  config: AppConfig,
): { email: string; csrfToken: string } | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!cookie) {
    return null;
  }
  const [payload, signature] = cookie.split(".");
  if (
    !payload ||
    !signature ||
    !safeEqual(signature, sign(payload, config.ADMIN_SESSION_SECRET))
  ) {
    return null;
  }
  const decoded = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as {
    email: string;
    issuedAt: number;
    csrfToken: string;
  };
  if (Date.now() - decoded.issuedAt > 1000 * 60 * 60 * 8) {
    return null;
  }
  return { email: decoded.email, csrfToken: decoded.csrfToken };
}

export function setSessionCookies(
  cookies: AstroCookies,
  session: { value: string; csrfToken: string },
): void {
  cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  cookies.set(CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export function clearSessionCookies(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: "/" });
  cookies.delete(CSRF_COOKIE, { path: "/" });
}

export function getCsrfFromCookies(cookies: AstroCookies): string {
  return cookies.get(CSRF_COOKIE)?.value ?? "";
}

export function requireAdmin(
  context: APIContext,
  config: AppConfig,
): { email: string } {
  const session = readSession(context.request, config);
  if (!session) {
    throw new AppError("ADMIN_UNAUTHORIZED", "Admin login required.", 401);
  }

  if (context.request.method !== "GET") {
    const csrfHeader = context.request.headers.get("x-csrf-token");
    const csrfCookie = context.cookies.get(CSRF_COOKIE)?.value;
    if (
      !csrfHeader ||
      !csrfCookie ||
      csrfHeader !== csrfCookie ||
      csrfHeader !== session.csrfToken
    ) {
      throw new AppError("ADMIN_UNAUTHORIZED", "Invalid CSRF token.", 403);
    }
  }
  return { email: session.email };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
