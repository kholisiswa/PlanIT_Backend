// _core/context.ts

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { DB } from "../db";

import jwt from "jsonwebtoken";
import { getDb } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  db: DB;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const { req, res } = opts;

  // Initialize DB (cached)
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  let user: User | null = null;

  // -------------------------------
  // UNIVERSAL TOKEN EXTRACTION
  // -------------------------------
  const token =
    req.cookies?.app_session_id ||
    req.headers["x-session-token"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    null;

  if (token) {
    try {
      // JWT decode
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "change-me"
      ) as { id: number };

      // Lookup user from DB
      const found = await db.query.users.findFirst({
        where: (tbl, { eq }) => eq(tbl.id, decoded.id),
      });

      user = found ?? null;
    } catch {
      user = null; // invalid token
    }
  }

  return {
    req,
    res,
    user,
    db,
  };
}
