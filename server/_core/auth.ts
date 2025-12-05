// server/_core/authRouter.ts  (atau auth.ts kalau kamu pakai nama itu)
import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "./cookies";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nama wajib diisi"),
        email: z.string().email("Email tidak valid"),
        password: z.string().min(6, "Password minimal 6 karakter"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database tidak tersedia");

      // Cek email sudah ada belum
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email.toLowerCase().trim()))
        .limit(1);

      if (existingUser.length > 0) {
        throw new Error("Email sudah digunakan");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 12);

      // Buat user baru
      const [newUser] = await db
        .insert(users)
        .values({
          name: input.name.trim(),
          email: input.email.toLowerCase().trim(),
          password: hashedPassword,
          loginMethod: "email",
        })
        .returning();

      // Buat JWT token
      const token = jwt.sign(
        { id: newUser.id },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" }
      );

      // Set cookie (ini cara yang benar di Express + tRPC)
      ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));

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

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email("Email tidak valid"),
        password: z.string().min(1, "Password wajib diisi"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database tidak tersedia");

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email.toLowerCase().trim()))
        .limit(1);

      if (!user || !user.password) {
        throw new Error("Email atau password salah");
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new Error("Email atau password salah");
      }

      const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" }
      );

      ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));

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

  me: publicProcedure.query(async ({ ctx }) => {
    return ctx.user || null;
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME, getSessionCookieOptions(ctx.req));
    return { success: true };
  }),
});