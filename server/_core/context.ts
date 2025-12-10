import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { DB } from "../db";
import jwt from "jsonwebtoken";
import { jwtVerify } from "jose";
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
    const db = await getDb();
    if (!db) return { req, res, db: null, user: null };

    let user: User | null = null;
    const r: any = req;

    const token =
      r.cookies?.app_session_id ||
      r.headers?.["x-session-token"] ||
      r.headers?.["authorization"]?.replace("Bearer ", "") ||
      null;

    if (token) {
      const secret = process.env.JWT_SECRET || "change-me";

      // 1) JWT lama dengan payload { id }
      if (!user) {
        try {
          const decoded = jwt.verify(token, secret) as { id?: number };
          if (decoded?.id) {
            const found = await db.query.users.findFirst({
              where: (tbl, { eq }) => eq(tbl.id, decoded.id!),
            });
            user = found ?? null;
          }
        } catch {
          /* ignore */
        }
      }

      // 2) Sesi OAuth (HS256 jose) dengan payload { openId }
      if (!user) {
        try {
          const { payload } = await jwtVerify(
            token,
            new TextEncoder().encode(secret),
            { algorithms: ["HS256"] }
          );
          const openId = (payload as any)?.openId as string | undefined;
          if (openId) {
            const found = await db.query.users.findFirst({
              where: (tbl, { eq }) => eq(tbl.openId, openId),
            });
            user = found ?? null;
          }
        } catch {
          /* ignore */
        }
      }
    }

    return { req, res, user, db };
  } catch (err) {
    console.error("🔥 GLOBAL CONTEXT ERROR:", err);
    return { req, res, db: null, user: null };
  }
}
