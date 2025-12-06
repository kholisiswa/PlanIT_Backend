"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagRouter = void 0;
// server/_core/tagRouter.ts — FINAL FIXED & CLEAN
const trpc_1 = require("./trpc");
const zod_1 = require("zod");
const schema_1 = require("../../drizzle/schema");
const drizzle_orm_1 = require("drizzle-orm");
const server_1 = require("@trpc/server");
exports.tagRouter = (0, trpc_1.createTRPCRouter)({
    // -----------------------------------------------------
    // GET ALL TAGS + USAGE COUNT (REAL)
    // -----------------------------------------------------
    getAll: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        return ctx.db
            .select({
            id: schema_1.tags.id,
            userId: schema_1.tags.userId,
            name: schema_1.tags.name,
            description: schema_1.tags.description,
            color: schema_1.tags.color,
            createdAt: schema_1.tags.createdAt,
            // hitung jumlah task yang pakai tag ini
            usageCount: (0, drizzle_orm_1.sql) `
          (SELECT COUNT(*)
           FROM ${schema_1.taskTags}
           WHERE ${schema_1.taskTags.tagId} = ${schema_1.tags.id})
        `.as("usageCount"),
        })
            .from(schema_1.tags)
            .where((0, drizzle_orm_1.eq)(schema_1.tags.userId, ctx.user.id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.tags.createdAt));
    }),
    getById: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .query(async ({ ctx, input }) => {
        const { id } = input;
        const [tag] = await ctx.db
            .select()
            .from(schema_1.tags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tags.id, id), (0, drizzle_orm_1.eq)(schema_1.tags.userId, ctx.user.id)))
            .limit(1);
        if (!tag)
            throw new server_1.TRPCError({ code: "NOT_FOUND" });
        return tag;
    }),
    // -----------------------------------------------------
    // CREATE TAG
    // -----------------------------------------------------
    create: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        name: zod_1.z.string().min(1),
        description: zod_1.z.string().optional(),
        color: zod_1.z.string().optional(),
    }))
        .mutation(async ({ ctx, input }) => {
        const { name, description, color } = input;
        const [already] = await ctx.db
            .select()
            .from(schema_1.tags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tags.userId, ctx.user.id), (0, drizzle_orm_1.eq)(schema_1.tags.name, name)))
            .limit(1);
        if (already)
            throw new server_1.TRPCError({
                code: "CONFLICT",
                message: "Tag name already exists",
            });
        const [tag] = await ctx.db
            .insert(schema_1.tags)
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
    update: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        name: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        color: zod_1.z.string().optional(),
    }))
        .mutation(async ({ ctx, input }) => {
        const { id } = input;
        const [old] = await ctx.db
            .select()
            .from(schema_1.tags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tags.id, id), (0, drizzle_orm_1.eq)(schema_1.tags.userId, ctx.user.id)))
            .limit(1);
        if (!old)
            throw new server_1.TRPCError({ code: "NOT_FOUND" });
        const [updated] = await ctx.db
            .update(schema_1.tags)
            .set({
            name: input.name ?? old.name,
            description: input.description ?? old.description,
            color: input.color ?? old.color,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.tags.id, id))
            .returning();
        return updated;
    }),
    // -----------------------------------------------------
    // DELETE TAG
    // -----------------------------------------------------
    delete: trpc_1.protectedProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(async ({ ctx, input }) => {
        const { id } = input;
        const [tag] = await ctx.db
            .select()
            .from(schema_1.tags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tags.id, id), (0, drizzle_orm_1.eq)(schema_1.tags.userId, ctx.user.id)))
            .limit(1);
        if (!tag)
            throw new server_1.TRPCError({ code: "NOT_FOUND" });
        // remove assignments
        await ctx.db.delete(schema_1.taskTags).where((0, drizzle_orm_1.eq)(schema_1.taskTags.tagId, id));
        const [deleted] = await ctx.db
            .delete(schema_1.tags)
            .where((0, drizzle_orm_1.eq)(schema_1.tags.id, id))
            .returning();
        return deleted;
    }),
    // -----------------------------------------------------
    // ASSIGN TAG TO TASK
    // -----------------------------------------------------
    assignToTask: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        taskId: zod_1.z.number(),
        tagId: zod_1.z.number(),
    }))
        .mutation(async ({ ctx, input }) => {
        const { taskId, tagId } = input;
        // check task belongs to user
        const [task] = await ctx.db
            .select()
            .from(schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, ctx.user.id)))
            .limit(1);
        if (!task)
            throw new server_1.TRPCError({ code: "FORBIDDEN" });
        // check tag belongs to user
        const [tag] = await ctx.db
            .select()
            .from(schema_1.tags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tags.id, tagId), (0, drizzle_orm_1.eq)(schema_1.tags.userId, ctx.user.id)))
            .limit(1);
        if (!tag)
            throw new server_1.TRPCError({ code: "FORBIDDEN" });
        const [existing] = await ctx.db
            .select()
            .from(schema_1.taskTags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, taskId), (0, drizzle_orm_1.eq)(schema_1.taskTags.tagId, tagId)))
            .limit(1);
        if (existing)
            return { success: true };
        await ctx.db.transaction(async (tx) => {
            await tx.insert(schema_1.taskTags).values({ taskId, tagId });
            // increase usageCount
            await tx
                .update(schema_1.tags)
                .set({ usageCount: (0, drizzle_orm_1.sql) `usage_count + 1` })
                .where((0, drizzle_orm_1.eq)(schema_1.tags.id, tagId));
        });
        return { success: true };
    }),
    // -----------------------------------------------------
    // REMOVE TAG FROM TASK
    // -----------------------------------------------------
    removeFromTask: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        taskId: zod_1.z.number(),
        tagId: zod_1.z.number(),
    }))
        .mutation(async ({ ctx, input }) => {
        const { taskId, tagId } = input;
        const [existing] = await ctx.db
            .select()
            .from(schema_1.taskTags)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, taskId), (0, drizzle_orm_1.eq)(schema_1.taskTags.tagId, tagId)))
            .limit(1);
        if (!existing)
            return { success: true };
        await ctx.db.transaction(async (tx) => {
            await tx
                .delete(schema_1.taskTags)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, taskId), (0, drizzle_orm_1.eq)(schema_1.taskTags.tagId, tagId)));
            await tx
                .update(schema_1.tags)
                .set({ usageCount: (0, drizzle_orm_1.sql) `GREATEST(usage_count - 1, 0)` })
                .where((0, drizzle_orm_1.eq)(schema_1.tags.id, tagId));
        });
        return { success: true };
    }),
});
