// ------------------------------------------------------
// taskRouter.ts — FINAL STABLE WITH listAll (UPDATED: support project move + EMAIL)
// ------------------------------------------------------
import { createTRPCRouter, protectedProcedure } from "./trpc";
import { recalcProjectProgress } from "./progress";
import { sendEmail } from "./email"; // <= EMAIL ADDED
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { projects, tasks, taskTags, tags } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

/* -----------------------------------------------------
   GET TAGS FOR ONE TASK
----------------------------------------------------- */
async function getFullTagsForTask(db: any, taskId: number) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      description: tags.description,
    })
    .from(taskTags)
    .innerJoin(tags, eq(taskTags.tagId, tags.id))
    .where(eq(taskTags.taskId, taskId));
}

/* -----------------------------------------------------
   ZOD SCHEMAS
----------------------------------------------------- */
const createTaskSchema = z.object({
  projectId: z.number(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["pending", "in-progress", "completed"]).default("pending"),
  dueDate: z.string().datetime().nullable().optional(),
  tagIds: z.array(z.number()).optional(),
});

const updateTaskSchema = z.object({
  id: z.number(),
  projectId: z.number().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["pending", "in-progress", "completed"]).optional(),
  dueDate: z.string().nullable().optional(),
  tagIds: z.array(z.number()).optional(),
});

const reorderSchema = z.object({
  projectId: z.number(),
  items: z.array(
    z.object({
      id: z.number(),
      status: z.enum(["pending", "in-progress", "completed"]),
      position: z.number(),
    })
  ),
});

/* -----------------------------------------------------
   TASK ROUTER
----------------------------------------------------- */
export const taskRouter = createTRPCRouter({
  /* ---------------------------------------------
     LIST ALL TASKS
  --------------------------------------------- */
  listAll: protectedProcedure.query(async ({ ctx }) => {
    const all = await ctx.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, ctx.user.id))
      .orderBy(asc(tasks.createdAt));

    const result = [];
    for (const t of all) {
      const tTags = await getFullTagsForTask(ctx.db, t.id);
      result.push({ ...t, tags: tTags });
    }
    return result;
  }),

  /* ---------------------------------------------
     LIST BY PROJECT
  --------------------------------------------- */
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const taskList = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, input.projectId), eq(tasks.userId, ctx.user.id)))
        .orderBy(asc(tasks.position));

      const result = [];
      for (const t of taskList) {
        const tTags = await getFullTagsForTask(ctx.db, t.id);
        result.push({ ...t, tags: tTags });
      }

      return result;
    }),

  /* ---------------------------------------------
     GET ONE
  --------------------------------------------- */
  getOne: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      const tTags = await getFullTagsForTask(ctx.db, task.id);
      return { ...task, tags: tTags };
    }),

  /* ---------------------------------------------
     CREATE TASK
  --------------------------------------------- */
  create: protectedProcedure
    .input(createTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const [projectExists] = await ctx.db
        .select()
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));

      if (!projectExists) throw new TRPCError({ code: "NOT_FOUND" });

      const due = input.dueDate ? new Date(input.dueDate) : null;

      const last = await ctx.db
        .select({ max: sql<number>`max(${tasks.position})` })
        .from(tasks)
        .where(and(eq(tasks.projectId, input.projectId), eq(tasks.status, input.status)));

      const nextPos = (last[0]?.max ?? -1) + 1;

      const [created] = await ctx.db
        .insert(tasks)
        .values({
          projectId: input.projectId,
          userId: ctx.user.id,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority,
          status: input.status,
          dueDate: due,
          position: nextPos,
        })
        .returning();

      if (input.tagIds?.length) {
        await ctx.db.insert(taskTags).values(
          input.tagIds.map((tagId) => ({ taskId: created.id, tagId }))
        );
      }

      await recalcProjectProgress(ctx.db, input.projectId, ctx.user.id);

      // ----------------------------------------------
      // SEND EMAIL: Task Created
      // ----------------------------------------------
      sendEmail(
        ctx.user.email,
        "Task Baru Dibuat",
        `<p>Task <b>${input.title}</b> berhasil dibuat.</p>`
      );

      const fullTags = await getFullTagsForTask(ctx.db, created.id);
      return { ...created, tags: fullTags };
    }),

  /* ---------------------------------------------
     UPDATE TASK
  --------------------------------------------- */
  update: protectedProcedure
    .input(updateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.transaction(async (tx) => {
        const updateData: Record<string, any> = { updatedAt: new Date() };

        if (input.title !== undefined) updateData.title = input.title;
        if (input.description !== undefined) updateData.description = input.description ?? null;
        if (input.priority !== undefined) updateData.priority = input.priority;

        let targetProjectId = existing.projectId;
        let targetStatus = existing.status;

        if (input.projectId !== undefined && input.projectId !== existing.projectId) {
          const [projExists] = await tx
            .select()
            .from(projects)
            .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));

          if (!projExists) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Target project not found" });
          }

          targetProjectId = input.projectId;
          updateData.projectId = input.projectId;
        }

        if (input.status !== undefined) {
          targetStatus = input.status;
        }

        const movingBetweenProjects = targetProjectId !== existing.projectId;
        const changingStatus =
          input.status !== undefined && input.status !== existing.status;

        if (movingBetweenProjects || changingStatus) {
          const last = await tx
            .select({ max: sql<number>`max(${tasks.position})` })
            .from(tasks)
            .where(and(eq(tasks.projectId, targetProjectId), eq(tasks.status, targetStatus)));

          updateData.status = targetStatus;
          updateData.position = (last[0]?.max ?? -1) + 1;
        } else if (input.status !== undefined) {
          updateData.status = input.status;
        }

        if (input.dueDate !== undefined) {
          updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
        }

        await tx.update(tasks).set(updateData).where(eq(tasks.id, input.id));

        if (input.tagIds !== undefined) {
          await tx.delete(taskTags).where(eq(taskTags.taskId, input.id));

          if (input.tagIds.length > 0) {
            await tx.insert(taskTags).values(
              input.tagIds.map((tagId) => ({ taskId: input.id, tagId }))
            );
          }
        }
      });

      try {
        await recalcProjectProgress(ctx.db, existing.projectId, ctx.user.id);

        if (input.projectId !== undefined && input.projectId !== existing.projectId) {
          await recalcProjectProgress(ctx.db, input.projectId, ctx.user.id);
        }
      } catch (err) {
        console.error("recalcProjectProgress failed after update:", err);
      }

      // ----------------------------------------------
      // SEND EMAIL: Task Updated
      // ----------------------------------------------
      sendEmail(
        ctx.user.email,
        "Task Diperbarui",
        `<p>Task <b>${existing.title}</b> telah diperbarui.</p>`
      );

      const fullTags = await getFullTagsForTask(ctx.db, input.id);
      return { success: true, tags: fullTags };
    }),

  /* ---------------------------------------------
     DELETE TASK
  --------------------------------------------- */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));

      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      const projectId = task.projectId;

      await ctx.db.delete(taskTags).where(eq(taskTags.taskId, input.id));
      await ctx.db.delete(tasks).where(eq(tasks.id, input.id));

      await recalcProjectProgress(ctx.db, projectId, ctx.user.id);

      // ----------------------------------------------
      // SEND EMAIL: Task Deleted
      // ----------------------------------------------
      sendEmail(
        ctx.user.email,
        "Task Dihapus",
        `<p>Task <b>${task.title}</b> telah dihapus.</p>`
      );

      return { success: true };
    }),

  /* ---------------------------------------------
     GET BY TAG
  --------------------------------------------- */
  getByTagId: protectedProcedure
    .input(z.object({ tagId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { tagId } = input;

      const rows = await ctx.db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          projectId: tasks.projectId,
        })
        .from(taskTags)
        .innerJoin(tasks, eq(taskTags.taskId, tasks.id))
        .where(
          and(eq(taskTags.tagId, tagId), eq(tasks.userId, ctx.user.id))
        );

      return rows;
    }),

  /* ---------------------------------------------
     REORDER (KANBAN)
  --------------------------------------------- */
  reorder: protectedProcedure
    .input(reorderSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { projectId, items } = input;

        const [projectExists] = await ctx.db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.userId, ctx.user.id)));

        if (!projectExists) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const ids = items.map((i) => i.id);

        const dbTasks = await ctx.db
          .select()
          .from(tasks)
          .where(
            and(
              sql`${tasks.id} IN (${sql.join(ids, sql`,`)})`,
              eq(tasks.userId, ctx.user.id),
              eq(tasks.projectId, projectId)
            )
          );

        if (dbTasks.length !== items.length) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        await ctx.db.transaction(async (tx) => {
          for (const item of items) {
            await tx
              .update(tasks)
              .set({
                status: item.status,
                position: item.position,
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, item.id));
          }

          await recalcProjectProgress(tx, projectId, ctx.user.id);
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to reorder tasks",
          cause: error,
        });
      }
    }),
});
