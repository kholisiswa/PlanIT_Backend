// server/_core/authRouter.ts
import { createTRPCRouter, protectedProcedure, publicProcedure } from "./trpc";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const authRouter = createTRPCRouter({

  // ===========================
  // REGISTER
  // ===========================
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      if (!process.env.JWT_SECRET) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT_SECRET not configured" });
      }

      const email = input.email.toLowerCase().trim();

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
      }

      const hashed = await bcrypt.hash(input.password, 12);

      const [newUser] = await db
        .insert(users)
        .values({
          name: input.name.trim(),
          email,
          password: hashed,
        })
        .returning();

      const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));

      const { password, ...safeUser } = newUser as any;
      return { success: true, user: safeUser };
    }),

  // ===========================
  // LOGIN
  // ===========================
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      if (!process.env.JWT_SECRET) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT_SECRET not configured" });
      }

      const email = input.email.toLowerCase().trim();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user || !user.password) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));

      const { password, ...safeUser } = user as any;
      return { success: true, user: safeUser };
    }),

  // ===========================
  // GET CURRENT USER
  // ===========================
  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ?? null;
  }),

  // ===========================
  // LOGOUT
  // ===========================
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME, {
      ...getSessionCookieOptions(ctx.req),
      maxAge: 0,
    });
    return { success: true };
  }),

  // ===========================
  // UPDATE PROFILE (name)
  // ===========================
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const user = ctx.user;
      if (!db || !user) throw new TRPCError({ code: "UNAUTHORIZED" });

      const [updated] = await db
        .update(users)
        .set({ name: input.name })
        .where(eq(users.id, user.id))
        .returning();

      const { password, ...safeUser } = updated as any;
      return { success: true, user: safeUser };
    }),

  // ===========================
  // CHANGE PASSWORD
  // ===========================
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, user } = ctx;

      if (!db || !user) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Fetch full user record (with password)
      const [fullUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (!fullUser || !fullUser.password) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // Validate current password
      const valid = await bcrypt.compare(input.currentPassword, fullUser.password);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }

      // Hash new password
      const hashed = await bcrypt.hash(input.newPassword, 12);

      // Update DB
      await db
        .update(users)
        .set({ password: hashed })
        .where(eq(users.id, user.id));

      return { success: true, message: "Password updated successfully" };
    }),
});
