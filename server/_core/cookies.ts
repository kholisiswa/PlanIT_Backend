// server/_core/cookies.ts

import type { Request } from "express";
// We build Set-Cookie header strings manually to avoid import/typing issues

export const COOKIE_NAME = "app_session_id";

// FINAL, PRODUKSI-SAFE, DAN WORKS DI LOCALHOST
export function getSessionCookieOptions(req: Request) {
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
  } as const;
}

// Serialize a session cookie value into a Set-Cookie header string
export function serializeSessionCookie(value: string, req: Request) {
  const opts = getSessionCookieOptions(req);
  // cookie.serialize expects maxAge in seconds
  const parts: string[] = [];
  parts.push(`${COOKIE_NAME}=${encodeURIComponent(value)}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${String(opts.sameSite)}`);
  if (opts.maxAge) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  return parts.join("; ");
}

export function serializeClearSessionCookie(req: Request) {
  const opts = getSessionCookieOptions(req);
  const parts: string[] = [];
  parts.push(`${COOKIE_NAME}=`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${String(opts.sameSite)}`);
  parts.push("Max-Age=0");
  return parts.join("; ");
}
