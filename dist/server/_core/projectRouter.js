"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectRouter = void 0;
// ------------------------------------------------------
// projectRouter.ts — FINAL, CLEAN, OPTIMIZED
// ------------------------------------------------------
const zod_1 = require("zod");
const taskRouter_1 = require("./taskRouter");
const trpc_1 = require("./trpc");
const schema_1 = require("../../drizzle/schema");
const drizzle_orm_1 = require("drizzle-orm");
const server_1 = require("@trpc/server");
const schema_2 = require("../../drizzle/schema");
/* ------------------------------------------------------
   PROJECT ROUTER
------------------------------------------------------ */
exports.projectRouter = (0, trpc_1.createTRPCRouter)({
    // Mount task router
    task: taskRouter_1.taskRouter,
    /* ---------------------- GET ALL PROJECTS + ownerName + taskCount ---------------------- */
    getAll: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const data = await ctx.db
            .select({
            id: schema_1.projects.id,
            name: schema_1.projects.name,
            description: schema_1.projects.description,
            status: schema_1.projects.status,
            progress: schema_1.projects.progress,
            color: schema_1.projects.color,
            createdAt: schema_1.projects.createdAt,
            // 👇 owner name
            ownerName: schema_2.users.name,
            // 👇 task count
            taskCount: (0, drizzle_orm_1.sql) `COUNT(${schema_1.tasks.id})`.mapWith(Number),
        })
            .from(schema_1.projects)
            .leftJoin(schema_2.users, (0, drizzle_orm_1.eq)(schema_1.projects.userId, schema_2.users.id))
            .leftJoin(schema_1.tasks, (0, drizzle_orm_1.eq)(schema_1.tasks.projectId, schema_1.projects.id))
            .where((0, drizzle_orm_1.eq)(schema_1.projects.userId, ctx.user.id))
            .groupBy(schema_1.projects.id, schema_2.users.name)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.projects.createdAt));
        return data;
    }),
    /* ---------------------- GET PROJECT BY ID ---------------------- */
    getById: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .query(async ({ ctx, input }) => {
        const [project] = await ctx.db
            .select({
            id: schema_1.projects.id,
            userId: schema_1.projects.userId,
            name: schema_1.projects.name,
            description: schema_1.projects.description,
            status: schema_1.projects.status,
            progress: schema_1.projects.progress,
            color: schema_1.projects.color,
            createdAt: schema_1.projects.createdAt,
            updatedAt: schema_1.projects.updatedAt,
            // ➜ Ambil nama owner dari table users
            ownerName: (0, drizzle_orm_1.sql) `(
          SELECT name FROM users WHERE users.id = ${schema_1.projects.userId}
        )`,
        })
            .from(schema_1.projects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, input.id), (0, drizzle_orm_1.eq)(schema_1.projects.userId, ctx.user.id)))
            .limit(1);
        if (!project) {
            throw new server_1.TRPCError({
                code: "NOT_FOUND",
                message: "Project not found",
            });
        }
        return project;
    }),
    /* ---------------------- DASHBOARD STATS ---------------------- */
    getStats: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const userId = ctx.user.id;
        const [{ count: totalProjects }] = await ctx.db
            .select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` })
            .from(schema_1.projects)
            .where((0, drizzle_orm_1.eq)(schema_1.projects.userId, userId));
        const [{ count: totalTasks }] = await ctx.db
            .select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` })
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        const [{ count: completedTasks }] = await ctx.db
            .select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` })
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId), (0, drizzle_orm_1.eq)(schema_1.tasks.status, "completed")));
        return {
            projects: totalProjects,
            tasks: totalTasks,
            completedTasks,
        };
    }),
    /* ---------------------- GET TASKS OF PROJECT ---------------------- */
    getTasks: trpc_1.protectedProcedure
        .input(zod_1.z.object({ projectId: zod_1.z.number() }))
        .query(async ({ ctx, input }) => {
        const list = await ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.projectId, input.projectId), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id)))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.tasks.position));
        const ids = list.map((t) => t.id);
        if (ids.length === 0)
            return [];
        const tagRows = await ctx.db
            .select({
            taskId: schema_1.taskTags.taskId,
            id: schema_1.tags.id,
            name: schema_1.tags.name,
            color: schema_1.tags.color,
        })
            .from(schema_1.taskTags)
            .innerJoin(schema_1.tags, (0, drizzle_orm_1.eq)(schema_1.tags.id, schema_1.taskTags.tagId))
            .where((0, drizzle_orm_1.inArray)(schema_1.taskTags.taskId, ids));
        const grouped = {};
        tagRows.forEach((t) => {
            if (!grouped[t.taskId])
                grouped[t.taskId] = [];
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
    getAllTasks: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        return ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.tasks.createdAt));
    }),
    /* ---------------------- CREATE PROJECT ---------------------- */
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1),
        description: zod_1.z.string().optional(),
        status: zod_1.z.enum(["active", "completed", "archived"]).optional(),
        color: zod_1.z.string().optional(),
    }))
        .mutation(async ({ ctx, input }) => {
        const [project] = await ctx.db
            .insert(schema_1.projects)
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
    update: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().min(1),
        description: zod_1.z.string().optional(),
        status: zod_1.z.enum(["active", "completed", "archived"]),
        progress: zod_1.z.number().min(0).max(100),
        color: zod_1.z.string(),
    }))
        .mutation(async ({ ctx, input }) => {
        await ctx.db
            .update(schema_1.projects)
            .set({
            name: input.name,
            description: input.description ?? "",
            status: input.status,
            progress: input.progress,
            color: input.color,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, input.id), (0, drizzle_orm_1.eq)(schema_1.projects.userId, ctx.user.id)));
        return { success: true };
    }),
    /* ---------------------- DELETE PROJECT ---------------------- */
    delete: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(async ({ ctx, input }) => {
        const [deleted] = await ctx.db
            .delete(schema_1.projects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, input.id), (0, drizzle_orm_1.eq)(schema_1.projects.userId, ctx.user.id)))
            .returning();
        if (!deleted) {
            throw new server_1.TRPCError({
                code: "NOT_FOUND",
                message: "Project not found",
            });
        }
        return deleted;
    }),
});
