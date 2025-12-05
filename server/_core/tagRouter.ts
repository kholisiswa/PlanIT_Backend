// server/_core/tagRouter.ts — FINAL FIXED & CLEAN
import { createTRPCRouter, protectedProcedure } from "./trpc";
import { z } from "zod";
import { tags, taskTags, tasks } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const tagRouter = createTRPCRouter({

  // -----------------------------------------------------
  // GET ALL TAGS + USAGE COUNT (REAL)
  // -----------------------------------------------------
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: tags.id,
        userId: tags.userId,
        name: tags.name,
        description: tags.description,
        color: tags.color,
        createdAt: tags.createdAt,

        // hitung jumlah task yang pakai tag ini
        usageCount: sql<number>`
          (SELECT COUNT(*)
           FROM ${taskTags}
           WHERE ${taskTags.tagId} = ${tags.id})
        `.as("usageCount"),
      })
      .from(tags)
      .where(eq(tags.userId, ctx.user.id))
      .orderBy(desc(tags.createdAt));
  }),


  getById: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const { id } = input;

    const [tag] = await ctx.db
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, ctx.user.id)))
      .limit(1);

    if (!tag) throw new TRPCError({ code: "NOT_FOUND" });

    return tag;
  }),


  // -----------------------------------------------------
  // CREATE TAG
  // -----------------------------------------------------
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, description, color } = input;

      const [already] = await ctx.db
        .select()
        .from(tags)
        .where(and(eq(tags.userId, ctx.user.id), eq(tags.name, name)))
        .limit(1);

      if (already)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tag name already exists",
        });

      const [tag] = await ctx.db
        .insert(tags)
        .values({
          userId: ctx.user.id,
          name,
          description: description ?? null,
          color: color ?? "#3b82f6",
        })
        .returning();

      return tag;
    }),

  // -----------------------------------------------------
  // UPDATE TAG
  // -----------------------------------------------------
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      const [old] = await ctx.db
        .select()
        .from(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, ctx.user.id)))
        .limit(1);

      if (!old) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db
        .update(tags)
        .set({
          name: input.name ?? old.name,
          description: input.description ?? old.description,
          color: input.color ?? old.color,
        })
        .where(eq(tags.id, id))
        .returning();

      return updated;
    }),

  // -----------------------------------------------------
  // DELETE TAG
  // -----------------------------------------------------
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      const [tag] = await ctx.db
        .select()
        .from(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, ctx.user.id)))
        .limit(1);

      if (!tag) throw new TRPCError({ code: "NOT_FOUND" });

      // remove assignments
      await ctx.db.delete(taskTags).where(eq(taskTags.tagId, id));

      const [deleted] = await ctx.db
        .delete(tags)
        .where(eq(tags.id, id))
        .returning();

      return deleted;
    }),

  // -----------------------------------------------------
  // ASSIGN TAG TO TASK
  // -----------------------------------------------------
  assignToTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        tagId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { taskId, tagId } = input;

      // check task belongs to user
      const [task] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, ctx.user.id)))
        .limit(1);

      if (!task) throw new TRPCError({ code: "FORBIDDEN" });

      // check tag belongs to user
      const [tag] = await ctx.db
        .select()
        .from(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.user.id)))
        .limit(1);

      if (!tag) throw new TRPCError({ code: "FORBIDDEN" });

      const [existing] = await ctx.db
        .select()
        .from(taskTags)
        .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
        .limit(1);

      if (existing) return { success: true };

      await ctx.db.transaction(async (tx) => {
        await tx.insert(taskTags).values({ taskId, tagId });

        // increase usageCount
        await tx
          .update(tags)
          .set({ usageCount: sql`usage_count + 1` })
          .where(eq(tags.id, tagId));
      });

      return { success: true };
    }),

  // -----------------------------------------------------
  // REMOVE TAG FROM TASK
  // -----------------------------------------------------
  removeFromTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        tagId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { taskId, tagId } = input;

      const [existing] = await ctx.db
        .select()
        .from(taskTags)
        .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
        .limit(1);

      if (!existing) return { success: true };

      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(taskTags)
          .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)));

        await tx
          .update(tags)
          .set({ usageCount: sql`GREATEST(usage_count - 1, 0)` })
          .where(eq(tags.id, tagId));
      });

      return { success: true };
    }),
});
