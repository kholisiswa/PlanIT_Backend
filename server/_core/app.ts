import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

  const isOriginAllowed = (origin?: string) => {
    if (!origin) return true;
    return allowedOrigins.some(allowed =>
      allowed.endsWith("*") ? origin?.startsWith(allowed.slice(0, -1)) : origin === allowed
    );
  };

  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (isOriginAllowed(origin)) return callback(null, true);
      console.warn(`[CORS] Blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
  }));

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());

  registerOAuthRoutes(app);

  app.use("/api/trpc", createExpressMiddleware({
    router: appRouter,
    createContext,
  }));

  return app;
}
