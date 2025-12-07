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
  db: DB | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const { req, res } = opts;

  try {
    // ❗ DB INIT — always wrap this
    const db = await getDb();
    if (!db) {
      console.error("🔥 CONTEXT ERROR: DB not initialized");
      return { req, res, db: null, user: null };
    }

    let user: User | null = null;

    // ================================
    // UNIVERSAL TOKEN EXTRACTION
    // ================================
    const r: any = req;

    const token =
      r.cookies?.app_session_id ||
      r.headers?.["x-session-token"] ||
      r.headers?.["authorization"]?.replace("Bearer ", "") ||
      null;

    if (token) {
      try {
        if (!process.env.JWT_SECRET) {
          console.error("🔥 CONTEXT ERROR: Missing JWT_SECRET");
        } else {
          const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
            id: number;
          };

          const found = await db.query.users.findFirst({
            where: (tbl, { eq }) => eq(tbl.id, decoded.id),
          });

          user = found ?? null;
        }
      } catch (err) {
        console.error("🔥 JWT DECODE ERROR:", err);
        user = null;
      }
    }

    return { req, res, user, db };
  } catch (err) {
    console.error("🔥 GLOBAL CONTEXT ERROR:", err);
    return { req, res, db: null, user: null };
  }
}
