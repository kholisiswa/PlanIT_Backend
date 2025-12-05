// server/_core/cookies.ts

import type { Request } from "express";

export const COOKIE_NAME = "app_session_id";

// FINAL, PRODUKSI-SAFE, DAN WORKS DI LOCALHOST
export function getSessionCookieOptions(req: Request) {
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,                // cookie tidak bisa dibaca JS (wajib)
    secure: isProd,               // hanya https di production
    sameSite: isProd ? "none" : "lax", 
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
  } as const;
}
