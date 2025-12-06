"use strict";
// _core/context.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContext = createContext;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
async function createContext(opts) {
    const { req, res } = opts;
    // Initialize DB (cached)
    const db = await (0, db_1.getDb)();
    if (!db)
        throw new Error("Database not initialized");
    let user = null;
    // -------------------------------
    // UNIVERSAL TOKEN EXTRACTION
    // -------------------------------
    const token = req.cookies?.app_session_id ||
        req.headers["x-session-token"] ||
        req.headers["authorization"]?.replace("Bearer ", "") ||
        null;
    if (token) {
        try {
            // JWT decode
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "change-me");
            // Lookup user from DB
            const found = await db.query.users.findFirst({
                where: (tbl, { eq }) => eq(tbl.id, decoded.id),
            });
            user = found ?? null;
        }
        catch {
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
