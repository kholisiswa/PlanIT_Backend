import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context"; // HANYA PAKAI INI — TIDAK ADA setupVite

export function createApp() {
  const app = express();

  // Honor reverse proxy headers (Vercel/Supabase), needed for secure cookies
  app.set("trust proxy", 1);

  // FRONTEND VITE = 5173 (default) — override via CORS_ORIGINS for Vercel/Supabase
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        // Allow server-to-server / healthcheck calls with no origin
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        console.warn(`[CORS] Blocked origin: ${origin}`);
        return callback(new Error("Not allowed by CORS"));
      },
    })
  );

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.use(cookieParser());

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
