// _core/context.ts

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { DB } from "../db";

import jwt from "jsonwebtoken";
import { jwtVerify } from "jose";
import { getDb } from "../db";

export type TrpcContext = {
  req: any; // biarkan any (menghindari bentrok adapter)
  res: any;
  user: User | null;
  db: DB;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const req = opts.req as any;
  const res = opts.res as any;

  // DB init
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  let user: User | null = null;

  // ----------------------------------
  // UNIVERSAL TOKEN EXTRACTION
  // ----------------------------------
  const token =
    req.cookies?.app_session_id ||
    req.headers["x-session-token"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    null;

  if (token) {
    const secret = process.env.JWT_SECRET || "change-me";

    //
    // 1) Coba format lama (JWT email/password yang berisi { id })
    //
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
        // bukan token lama, lanjut
      }
    }

    //
    // 2) Coba sesi OAuth (JOSE HS256 yang berisi { openId, appId, name })
    //
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
        // bukan token OAuth juga
      }
    }
  }

  return {
    req,
    res,
    user,
    db,
  };
}
