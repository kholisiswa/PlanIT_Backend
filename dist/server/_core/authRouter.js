"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
// server/_core/authRouter.ts
const trpc_1 = require("./trpc");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const const_1 = require("@shared/const");
const cookies_1 = require("./cookies");
const schema_1 = require("../../drizzle/schema");
const drizzle_orm_1 = require("drizzle-orm");
const server_1 = require("@trpc/server");
exports.authRouter = (0, trpc_1.createTRPCRouter)({
    // ===========================
    // REGISTER
    // ===========================
    register: trpc_1.publicProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1),
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(6),
    }))
        .mutation(async ({ input, ctx }) => {
        const db = ctx.db;
        if (!db)
            throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        if (!process.env.JWT_SECRET) {
            throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT_SECRET not configured" });
        }
        const email = input.email.toLowerCase().trim();
        const [existing] = await db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.email, email))
            .limit(1);
        if (existing) {
            throw new server_1.TRPCError({ code: "CONFLICT", message: "Email already in use" });
        }
        const hashed = await bcryptjs_1.default.hash(input.password, 12);
        const [newUser] = await db
            .insert(schema_1.users)
            .values({
            name: input.name.trim(),
            email,
            password: hashed,
        })
            .returning();
        const token = jsonwebtoken_1.default.sign({ id: newUser.id }, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });
        ctx.res.cookie(const_1.COOKIE_NAME, token, (0, cookies_1.getSessionCookieOptions)(ctx.req));
        const { password, ...safeUser } = newUser;
        return { success: true, user: safeUser };
    }),
    // ===========================
    // LOGIN
    // ===========================
    login: trpc_1.publicProcedure
        .input(zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string() }))
        .mutation(async ({ input, ctx }) => {
        const db = ctx.db;
        if (!db)
            throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        if (!process.env.JWT_SECRET) {
            throw new server_1.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT_SECRET not configured" });
        }
        const email = input.email.toLowerCase().trim();
        const [user] = await db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.email, email))
            .limit(1);
        if (!user || !user.password) {
            throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        const valid = await bcryptjs_1.default.compare(input.password, user.password);
        if (!valid)
            throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        const token = jsonwebtoken_1.default.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });
        ctx.res.cookie(const_1.COOKIE_NAME, token, (0, cookies_1.getSessionCookieOptions)(ctx.req));
        const { password, ...safeUser } = user;
        return { success: true, user: safeUser };
    }),
    // ===========================
    // GET CURRENT USER
    // ===========================
    me: trpc_1.publicProcedure.query(({ ctx }) => {
        return ctx.user ?? null;
    }),
    // ===========================
    // LOGOUT
    // ===========================
    logout: trpc_1.publicProcedure.mutation(({ ctx }) => {
        ctx.res.clearCookie(const_1.COOKIE_NAME, {
            ...(0, cookies_1.getSessionCookieOptions)(ctx.req),
            maxAge: 0,
        });
        return { success: true };
    }),
    // ===========================
    // UPDATE PROFILE (name)
    // ===========================
    updateProfile: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1, "Name is required"),
    }))
        .mutation(async ({ ctx, input }) => {
        const db = ctx.db;
        const user = ctx.user;
        if (!db || !user)
            throw new server_1.TRPCError({ code: "UNAUTHORIZED" });
        const [updated] = await db
            .update(schema_1.users)
            .set({ name: input.name })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id))
            .returning();
        const { password, ...safeUser } = updated;
        return { success: true, user: safeUser };
    }),
    // ===========================
    // CHANGE PASSWORD
    // ===========================
    changePassword: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        currentPassword: zod_1.z.string(),
        newPassword: zod_1.z.string().min(6),
    }))
        .mutation(async ({ ctx, input }) => {
        const { db, user } = ctx;
        if (!db || !user)
            throw new server_1.TRPCError({ code: "UNAUTHORIZED" });
        // Fetch full user record (with password)
        const [fullUser] = await db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id))
            .limit(1);
        if (!fullUser || !fullUser.password) {
            throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
        }
        // Validate current password
        const valid = await bcryptjs_1.default.compare(input.currentPassword, fullUser.password);
        if (!valid) {
            throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
        }
        // Hash new password
        const hashed = await bcryptjs_1.default.hash(input.newPassword, 12);
        // Update DB
        await db
            .update(schema_1.users)
            .set({ password: hashed })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id));
        return { success: true, message: "Password updated successfully" };
    }),
});
