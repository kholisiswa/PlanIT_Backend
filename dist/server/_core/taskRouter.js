"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskRouter = void 0;
// ------------------------------------------------------
// taskRouter.ts — FINAL STABLE WITH listAll (UPDATED: support project move + EMAIL)
// ------------------------------------------------------
const trpc_1 = require("./trpc");
const progress_1 = require("./progress");
const email_1 = require("./email"); // <= EMAIL ADDED
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../drizzle/schema");
const server_1 = require("@trpc/server");
/* -----------------------------------------------------
   GET TAGS FOR ONE TASK
----------------------------------------------------- */
async function getFullTagsForTask(db, taskId) {
    return db
        .select({
        id: schema_1.tags.id,
        name: schema_1.tags.name,
        color: schema_1.tags.color,
        description: schema_1.tags.description,
    })
        .from(schema_1.taskTags)
        .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.taskTags.tagId, schema_1.tags.id))
        .where((0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, taskId));
}
/* -----------------------------------------------------
   ZOD SCHEMAS
----------------------------------------------------- */
const createTaskSchema = zod_1.z.object({
    projectId: zod_1.z.number(),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().nullable().optional(),
    priority: zod_1.z.enum(["low", "medium", "high"]).default("medium"),
    status: zod_1.z.enum(["pending", "in-progress", "completed"]).default("pending"),
    dueDate: zod_1.z.string().datetime().nullable().optional(),
    tagIds: zod_1.z.array(zod_1.z.number()).optional(),
});
const updateTaskSchema = zod_1.z.object({
    id: zod_1.z.number(),
    projectId: zod_1.z.number().optional(),
    title: zod_1.z.string().optional(),
    description: zod_1.z.string().nullable().optional(),
    priority: zod_1.z.enum(["low", "medium", "high"]).optional(),
    status: zod_1.z.enum(["pending", "in-progress", "completed"]).optional(),
    dueDate: zod_1.z.string().nullable().optional(),
    tagIds: zod_1.z.array(zod_1.z.number()).optional(),
});
const reorderSchema = zod_1.z.object({
    projectId: zod_1.z.number(),
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.number(),
        status: zod_1.z.enum(["pending", "in-progress", "completed"]),
        position: zod_1.z.number(),
    })),
});
/* -----------------------------------------------------
   TASK ROUTER
----------------------------------------------------- */
exports.taskRouter = (0, trpc_1.createTRPCRouter)({
    /* ---------------------------------------------
       LIST ALL TASKS
    --------------------------------------------- */
    listAll: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const all = await ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.tasks.createdAt));
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
    listByProject: trpc_1.protectedProcedure
        .input(zod_1.z.object({ projectId: zod_1.z.number() }))
        .query(async ({ ctx, input }) => {
        const taskList = await ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.projectId, input.projectId), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id)))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.tasks.position));
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
    getOne: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .query(async ({ ctx, input }) => {
        const [task] = await ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.id, input.id), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id)));
        if (!task) {
            throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        }
        const tTags = await getFullTagsForTask(ctx.db, task.id);
        return { ...task, tags: tTags };
    }),
    /* ---------------------------------------------
       CREATE TASK
    --------------------------------------------- */
    create: trpc_1.protectedProcedure
        .input(createTaskSchema)
        .mutation(async ({ ctx, input }) => {
        const [projectExists] = await ctx.db
            .select()
            .from(schema_1.projects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, input.projectId), (0, drizzle_orm_1.eq)(schema_1.projects.userId, ctx.user.id)));
        if (!projectExists)
            throw new server_1.TRPCError({ code: "NOT_FOUND" });
        const due = input.dueDate ? new Date(input.dueDate) : null;
        const last = await ctx.db
            .select({ max: (0, drizzle_orm_1.sql) `max(${schema_1.tasks.position})` })
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.projectId, input.projectId), (0, drizzle_orm_1.eq)(schema_1.tasks.status, input.status)));
        const nextPos = (last[0]?.max ?? -1) + 1;
        const [created] = await ctx.db
            .insert(schema_1.tasks)
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
            await ctx.db.insert(schema_1.taskTags).values(input.tagIds.map((tagId) => ({ taskId: created.id, tagId })));
        }
        await (0, progress_1.recalcProjectProgress)(ctx.db, input.projectId, ctx.user.id);
        // ----------------------------------------------
        // SEND EMAIL: Task Created
        // ----------------------------------------------
        (0, email_1.sendEmail)(ctx.user.email, "Task Baru Dibuat", `<p>Task <b>${input.title}</b> berhasil dibuat.</p>`);
        const fullTags = await getFullTagsForTask(ctx.db, created.id);
        return { ...created, tags: fullTags };
    }),
    /* ---------------------------------------------
       UPDATE TASK
    --------------------------------------------- */
    update: trpc_1.protectedProcedure
        .input(updateTaskSchema)
        .mutation(async ({ ctx, input }) => {
        const [existing] = await ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.id, input.id), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id)));
        if (!existing)
            throw new server_1.TRPCError({ code: "NOT_FOUND" });
        await ctx.db.transaction(async (tx) => {
            const updateData = { updatedAt: new Date() };
            if (input.title !== undefined)
                updateData.title = input.title;
            if (input.description !== undefined)
                updateData.description = input.description ?? null;
            if (input.priority !== undefined)
                updateData.priority = input.priority;
            let targetProjectId = existing.projectId;
            let targetStatus = existing.status;
            if (input.projectId !== undefined && input.projectId !== existing.projectId) {
                const [projExists] = await tx
                    .select()
                    .from(schema_1.projects)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, input.projectId), (0, drizzle_orm_1.eq)(schema_1.projects.userId, ctx.user.id)));
                if (!projExists) {
                    throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Target project not found" });
                }
                targetProjectId = input.projectId;
                updateData.projectId = input.projectId;
            }
            if (input.status !== undefined) {
                targetStatus = input.status;
            }
            const movingBetweenProjects = targetProjectId !== existing.projectId;
            const changingStatus = input.status !== undefined && input.status !== existing.status;
            if (movingBetweenProjects || changingStatus) {
                const last = await tx
                    .select({ max: (0, drizzle_orm_1.sql) `max(${schema_1.tasks.position})` })
                    .from(schema_1.tasks)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.projectId, targetProjectId), (0, drizzle_orm_1.eq)(schema_1.tasks.status, targetStatus)));
                updateData.status = targetStatus;
                updateData.position = (last[0]?.max ?? -1) + 1;
            }
            else if (input.status !== undefined) {
                updateData.status = input.status;
            }
            if (input.dueDate !== undefined) {
                updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
            }
            await tx.update(schema_1.tasks).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.tasks.id, input.id));
            if (input.tagIds !== undefined) {
                await tx.delete(schema_1.taskTags).where((0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, input.id));
                if (input.tagIds.length > 0) {
                    await tx.insert(schema_1.taskTags).values(input.tagIds.map((tagId) => ({ taskId: input.id, tagId })));
                }
            }
        });
        try {
            await (0, progress_1.recalcProjectProgress)(ctx.db, existing.projectId, ctx.user.id);
            if (input.projectId !== undefined && input.projectId !== existing.projectId) {
                await (0, progress_1.recalcProjectProgress)(ctx.db, input.projectId, ctx.user.id);
            }
        }
        catch (err) {
            console.error("recalcProjectProgress failed after update:", err);
        }
        // ----------------------------------------------
        // SEND EMAIL: Task Updated
        // ----------------------------------------------
        (0, email_1.sendEmail)(ctx.user.email, "Task Diperbarui", `<p>Task <b>${existing.title}</b> telah diperbarui.</p>`);
        const fullTags = await getFullTagsForTask(ctx.db, input.id);
        return { success: true, tags: fullTags };
    }),
    /* ---------------------------------------------
       DELETE TASK
    --------------------------------------------- */
    delete: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(async ({ ctx, input }) => {
        const [task] = await ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.id, input.id), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id)));
        if (!task)
            throw new server_1.TRPCError({ code: "NOT_FOUND" });
        const projectId = task.projectId;
        await ctx.db.delete(schema_1.taskTags).where((0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, input.id));
        await ctx.db.delete(schema_1.tasks).where((0, drizzle_orm_1.eq)(schema_1.tasks.id, input.id));
        await (0, progress_1.recalcProjectProgress)(ctx.db, projectId, ctx.user.id);
        // ----------------------------------------------
        // SEND EMAIL: Task Deleted
        // ----------------------------------------------
        (0, email_1.sendEmail)(ctx.user.email, "Task Dihapus", `<p>Task <b>${task.title}</b> telah dihapus.</p>`);
        return { success: true };
    }),
    /* ---------------------------------------------
       GET BY TAG
    --------------------------------------------- */
    getByTagId: trpc_1.protectedProcedure
        .input(zod_1.z.object({ tagId: zod_1.z.number() }))
        .query(async ({ ctx, input }) => {
        const { tagId } = input;
        const rows = await ctx.db
            .select({
            id: schema_1.tasks.id,
            title: schema_1.tasks.title,
            description: schema_1.tasks.description,
            status: schema_1.tasks.status,
            priority: schema_1.tasks.priority,
            projectId: schema_1.tasks.projectId,
        })
            .from(schema_1.taskTags)
            .innerJoin(schema_1.tasks, (0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, schema_1.tasks.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taskTags.tagId, tagId), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id)));
        return rows;
    }),
    /* ---------------------------------------------
       REORDER (KANBAN)
    --------------------------------------------- */
    reorder: trpc_1.protectedProcedure
        .input(reorderSchema)
        .mutation(async ({ ctx, input }) => {
        try {
            const { projectId, items } = input;
            const [projectExists] = await ctx.db
                .select()
                .from(schema_1.projects)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, projectId), (0, drizzle_orm_1.eq)(schema_1.projects.userId, ctx.user.id)));
            if (!projectExists) {
                throw new server_1.TRPCError({ code: "NOT_FOUND" });
            }
            const ids = items.map((i) => i.id);
            const dbTasks = await ctx.db
                .select()
                .from(schema_1.tasks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.tasks.id} IN (${drizzle_orm_1.sql.join(ids, (0, drizzle_orm_1.sql) `,`)})`, (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id), (0, drizzle_orm_1.eq)(schema_1.tasks.projectId, projectId)));
            if (dbTasks.length !== items.length) {
                throw new server_1.TRPCError({ code: "FORBIDDEN" });
            }
            await ctx.db.transaction(async (tx) => {
                for (const item of items) {
                    await tx
                        .update(schema_1.tasks)
                        .set({
                        status: item.status,
                        position: item.position,
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.tasks.id, item.id));
                }
                await (0, progress_1.recalcProjectProgress)(tx, projectId, ctx.user.id);
            });
            return { success: true };
        }
        catch (error) {
            throw new server_1.TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to reorder tasks",
                cause: error,
            });
        }
    }),
});
