import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users } from "../drizzle/schema";
import * as schema from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

let _db: NodePgDatabase<typeof schema> | null = null;

export type DB = NodePgDatabase<typeof schema>;

/**
 * SELALU mengembalikan database instance.
 * Tidak pernah return null → Menghilangkan 100% error TypeScript.
 */
export async function getDb(): Promise<DB> {
  if (_db) return _db;

  if (!process.env.DATABASE_URL) {
    throw new Error("[Database] DATABASE_URL is missing.");
  }

  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    _db = drizzle(pool, { schema });

    return _db;
  } catch (error) {
    console.error("[Database] Failed to connect:", error);
    throw error; // Penting: jangan return null
  }
}

// =======================================================
// USER HELPERS
// =======================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb(); // ✔ tidak mungkin null

  const now = new Date();

  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? now,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : undefined),
  };

  const updateSet = {
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? now,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : undefined),
  };

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); // ✔ tidak mungkin null

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result[0] ?? undefined;
}
