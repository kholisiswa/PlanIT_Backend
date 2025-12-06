"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRouter = void 0;
const trpc_1 = require("./trpc");
const db_1 = require("../db");
const schema_1 = require("../../drizzle/schema");
const drizzle_orm_1 = require("drizzle-orm");
exports.exportRouter = (0, trpc_1.createTRPCRouter)({
    // -----------------------------
    // EXPORT SEMUA DATA (JSON)
    // -----------------------------
    exportAll: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const db = await (0, db_1.getDb)();
        const userId = ctx.user.id;
        const userProjects = await db.select().from(schema_1.projects).where((0, drizzle_orm_1.eq)(schema_1.projects.userId, userId));
        const userTasks = await db.select().from(schema_1.tasks).where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        const userTags = await db.select().from(schema_1.tags).where((0, drizzle_orm_1.eq)(schema_1.tags.userId, userId));
        const userTaskTags = await db
            .select()
            .from(schema_1.taskTags)
            .innerJoin(schema_1.tasks, (0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, schema_1.tasks.id))
            .where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        const userNotifSettings = await db
            .select()
            .from(schema_1.userNotificationSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.userNotificationSettings.userId, userId));
        return {
            projects: userProjects,
            tasks: userTasks,
            tags: userTags,
            taskTags: userTaskTags,
            notificationSettings: userNotifSettings,
        };
    }),
    // -----------------------------
    // STORAGE USAGE
    // -----------------------------
    storageUsage: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const db = await (0, db_1.getDb)();
        const userId = ctx.user.id;
        const projectsData = await db.select().from(schema_1.projects).where((0, drizzle_orm_1.eq)(schema_1.projects.userId, userId));
        const tasksData = await db.select().from(schema_1.tasks).where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        const tagsData = await db.select().from(schema_1.tags).where((0, drizzle_orm_1.eq)(schema_1.tags.userId, userId));
        const taskTagsData = await db
            .select()
            .from(schema_1.taskTags)
            .innerJoin(schema_1.tasks, (0, drizzle_orm_1.eq)(schema_1.taskTags.taskId, schema_1.tasks.id))
            .where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        const notifData = await db
            .select()
            .from(schema_1.userNotificationSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.userNotificationSettings.userId, userId));
        const size = {
            projects: JSON.stringify(projectsData).length,
            tasks: JSON.stringify(tasksData).length,
            tags: JSON.stringify(tagsData).length,
            taskTags: JSON.stringify(taskTagsData).length,
            notificationSettings: JSON.stringify(notifData).length,
        };
        const total = Object.values(size).reduce((a, b) => a + b, 0);
        return { size, total };
    }),
    // -----------------------------
    // EXPORT JSON FILE
    // -----------------------------
    json: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const db = await (0, db_1.getDb)();
        const userId = ctx.user.id;
        const data = await db.select().from(schema_1.tasks).where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        return { data };
    }),
    // -----------------------------
    // EXPORT CSV FILE
    // -----------------------------
    csv: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const db = await (0, db_1.getDb)();
        const userId = ctx.user.id;
        const data = await db.select().from(schema_1.tasks).where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        if (!data.length)
            return { csv: "" };
        const headers = Object.keys(data[0]).join(",");
        const rows = data.map((row) => Object.values(row)
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","));
        const csv = [headers, ...rows].join("\n");
        return { csv };
    }),
    // -----------------------------
    // EXPORT PDF (TEXT-BASED)
    // -----------------------------
    pdf: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const db = await (0, db_1.getDb)();
        const userId = ctx.user.id;
        const data = await db.select().from(schema_1.tasks).where((0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId));
        return {
            pdfText: JSON.stringify(data, null, 2),
        };
    }),
});
