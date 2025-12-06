"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
// server/_core/authRouter.ts  (atau auth.ts kalau kamu pakai nama itu)
const trpc_1 = require("./trpc");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const const_1 = require("../../shared/const");
const cookies_1 = require("./cookies");
const db_1 = require("../db");
const schema_1 = require("../../drizzle/schema");
const drizzle_orm_1 = require("drizzle-orm");
exports.authRouter = (0, trpc_1.router)({
    register: trpc_1.publicProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1, "Nama wajib diisi"),
        email: zod_1.z.string().email("Email tidak valid"),
        password: zod_1.z.string().min(6, "Password minimal 6 karakter"),
    }))
        .mutation(async ({ input, ctx }) => {
        const db = await (0, db_1.getDb)();
        if (!db)
            throw new Error("Database tidak tersedia");
        // Cek email sudah ada belum
        const existingUser = await db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.email, input.email.toLowerCase().trim()))
            .limit(1);
        if (existingUser.length > 0) {
            throw new Error("Email sudah digunakan");
        }
        // Hash password
        const hashedPassword = await bcryptjs_1.default.hash(input.password, 12);
        // Buat user baru
        const [newUser] = await db
            .insert(schema_1.users)
            .values({
            name: input.name.trim(),
            email: input.email.toLowerCase().trim(),
            password: hashedPassword,
            loginMethod: "email",
        })
            .returning();
        // Buat JWT token
        const token = jsonwebtoken_1.default.sign({ id: newUser.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
        // Set cookie (ini cara yang benar di Express + tRPC)
        ctx.res.cookie(const_1.COOKIE_NAME, token, (0, cookies_1.getSessionCookieOptions)(ctx.req));
        return {
            success: true,
            message: "Registrasi berhasil",
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
            },
        };
    }),
    login: trpc_1.publicProcedure
        .input(zod_1.z.object({
        email: zod_1.z.string().email("Email tidak valid"),
        password: zod_1.z.string().min(1, "Password wajib diisi"),
    }))
        .mutation(async ({ input, ctx }) => {
        const db = await (0, db_1.getDb)();
        if (!db)
            throw new Error("Database tidak tersedia");
        const [user] = await db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.email, input.email.toLowerCase().trim()))
            .limit(1);
        if (!user || !user.password) {
            throw new Error("Email atau password salah");
        }
        const valid = await bcryptjs_1.default.compare(input.password, user.password);
        if (!valid) {
            throw new Error("Email atau password salah");
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
        ctx.res.cookie(const_1.COOKIE_NAME, token, (0, cookies_1.getSessionCookieOptions)(ctx.req));
        return {
            success: true,
            message: "Login berhasil",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        };
    }),
    me: trpc_1.publicProcedure.query(async ({ ctx }) => {
        return ctx.user || null;
    }),
    logout: trpc_1.publicProcedure.mutation(async ({ ctx }) => {
        ctx.res.clearCookie(const_1.COOKIE_NAME, (0, cookies_1.getSessionCookieOptions)(ctx.req));
        return { success: true };
    }),
});
