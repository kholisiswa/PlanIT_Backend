"use strict";
// server/_core/cookies.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.COOKIE_NAME = void 0;
exports.getSessionCookieOptions = getSessionCookieOptions;
exports.COOKIE_NAME = "app_session_id";
// FINAL, PRODUKSI-SAFE, DAN WORKS DI LOCALHOST
function getSessionCookieOptions(req) {
    const isProd = process.env.NODE_ENV === "production";
    return {
        httpOnly: true, // cookie tidak bisa dibaca JS (wajib)
        secure: isProd, // hanya https di production
        sameSite: isProd ? "none" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
    };
}
