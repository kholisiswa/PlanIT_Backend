"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.upsertUser = upsertUser;
exports.getUserByOpenId = getUserByOpenId;
const drizzle_orm_1 = require("drizzle-orm");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const schema_1 = require("../drizzle/schema");
const schema = __importStar(require("../drizzle/schema"));
const env_1 = require("./_core/env");
let _db = null;
/**
 * SELALU mengembalikan database instance.
 * Tidak pernah return null → Menghilangkan 100% error TypeScript.
 */
async function getDb() {
    if (_db)
        return _db;
    if (!process.env.DATABASE_URL) {
        throw new Error("[Database] DATABASE_URL is missing.");
    }
    try {
        const pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
        });
        _db = (0, node_postgres_1.drizzle)(pool, { schema });
        return _db;
    }
    catch (error) {
        console.error("[Database] Failed to connect:", error);
        throw error; // Penting: jangan return null
    }
}
// =======================================================
// USER HELPERS
// =======================================================
async function upsertUser(user) {
    if (!user.openId)
        throw new Error("User openId is required for upsert");
    const db = await getDb(); // ✔ tidak mungkin null
    const now = new Date();
    const values = {
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        lastSignedIn: user.lastSignedIn ?? now,
        role: user.role ?? (user.openId === env_1.ENV.ownerOpenId ? "admin" : undefined),
    };
    const updateSet = {
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        lastSignedIn: user.lastSignedIn ?? now,
        role: user.role ?? (user.openId === env_1.ENV.ownerOpenId ? "admin" : undefined),
    };
    await db
        .insert(schema_1.users)
        .values(values)
        .onConflictDoUpdate({
        target: schema_1.users.openId,
        set: updateSet,
    });
}
async function getUserByOpenId(openId) {
    const db = await getDb(); // ✔ tidak mungkin null
    const result = await db
        .select()
        .from(schema_1.users)
        .where((0, drizzle_orm_1.eq)(schema_1.users.openId, openId))
        .limit(1);
    return result[0] ?? undefined;
}
