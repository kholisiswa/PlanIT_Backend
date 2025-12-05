// ------------------------------------------------------
// projectRouter.ts — FINAL, CLEAN, OPTIMIZED
// ------------------------------------------------------
import { z } from "zod";
import { taskRouter } from "./taskRouter";
import { createTRPCRouter, protectedProcedure } from "./trpc";
import { projects, tasks, tags, taskTags } from "../../drizzle/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { recalcProjectProgress } from "./progress"; // ✅ FIXED: No circular import
import { users } from "../../drizzle/schema";



/* ------------------------------------------------------
   PROJECT ROUTER
------------------------------------------------------ */
export const projectRouter = createTRPCRouter({
  // Mount task router
  task: taskRouter,

 /* ---------------------- GET ALL PROJECTS + ownerName + taskCount ---------------------- */
getAll: protectedProcedure.query(async ({ ctx }) => {
  const data = await ctx.db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      progress: projects.progress,
      color: projects.color,
      createdAt: projects.createdAt,

      // 👇 owner name
      ownerName: users.name,

      // 👇 task count
      taskCount: sql<number>`COUNT(${tasks.id})`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(eq(projects.userId, ctx.user.id))
    .groupBy(projects.id, users.name)
    .orderBy(desc(projects.createdAt));


  return data;
}),

  /* ---------------------- GET PROJECT BY ID ---------------------- */
getById: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {

    const [project] = await ctx.db
      .select({
        id: projects.id,
        userId: projects.userId,
        name: projects.name,
        description: projects.description,
        status: projects.status,
        progress: projects.progress,
        color: projects.color,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,

        // ➜ Ambil nama owner dari table users
        ownerName: sql<string>`(
          SELECT name FROM users WHERE users.id = ${projects.userId}
        )`,
      })
      .from(projects)
      .where(
        and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id))
      )
      .limit(1);

    if (!project) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Project not found",
      });
    }

    return project;
  }),

  /* ---------------------- DASHBOARD STATS ---------------------- */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [{ count: totalProjects }] = await ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projects)
      .where(eq(projects.userId, userId));

    const [{ count: totalTasks }] = await ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(eq(tasks.userId, userId));

    const [{ count: completedTasks }] = await ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "completed")));

    return {
      projects: totalProjects,
      tasks: totalTasks,
      completedTasks,
    };
  }),

  /* ---------------------- GET TASKS OF PROJECT ---------------------- */
  getTasks: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const list = await ctx.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            eq(tasks.userId, ctx.user.id)
          )
        )
        .orderBy(asc(tasks.position));

      const ids = list.map((t) => t.id);
      if (ids.length === 0) return [];

      const tagRows = await ctx.db
        .select({
          taskId: taskTags.taskId,
          id: tags.id,
          name: tags.name,
          color: tags.color,
        })
        .from(taskTags)
        .innerJoin(tags, eq(tags.id, taskTags.tagId))
        .where(inArray(taskTags.taskId, ids));

      const grouped: Record<number, any[]> = {};
      tagRows.forEach((t) => {
        if (!grouped[t.taskId]) grouped[t.taskId] = [];
        grouped[t.taskId].push({
          id: t.id,
          name: t.name,
          color: t.color,
        });
      });

      return list.map((t) => ({
        ...t,
        tags: grouped[t.id] ?? [],
      }));
    }),

  /* ---------------------- ALL TASKS OF USER ---------------------- */
  getAllTasks: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, ctx.user.id))
      .orderBy(desc(tasks.createdAt));
  }),

  /* ---------------------- CREATE PROJECT ---------------------- */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? "active",
          progress: 0,
          color: input.color ?? "from-blue-500 to-blue-600",
        })
        .returning();

      return project;
    }),

  /* ---------------------- UPDATE PROJECT ---------------------- */
update: protectedProcedure
  .input(
    z.object({
      id: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
      status: z.enum(["active", "completed", "archived"]),
      progress: z.number().min(0).max(100),
      color: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(projects)
      .set({
        name: input.name,
        description: input.description ?? "",
        status: input.status,
        progress: input.progress,
        color: input.color,
        updatedAt: new Date(),
      })
      .where(
  and(
    eq(projects.id, input.id),
    eq(projects.userId, ctx.user.id)
  )
);


    return { success: true };
  }),

  /* ---------------------- DELETE PROJECT ---------------------- */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(projects)
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return deleted;
    }),
});
