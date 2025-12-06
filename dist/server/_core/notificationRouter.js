"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = void 0;
const trpc_1 = require("./trpc");
const zod_1 = require("zod");
const schema_1 = require("../../drizzle/schema");
const drizzle_orm_1 = require("drizzle-orm");
exports.notificationRouter = (0, trpc_1.createTRPCRouter)({
    // ----------------------------------------------------
    // GET USER NOTIFICATION SETTINGS
    // ----------------------------------------------------
    get: trpc_1.protectedProcedure.query(async ({ ctx }) => {
        const db = ctx.db;
        const [settings] = await db
            .select()
            .from(schema_1.userNotificationSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.userNotificationSettings.userId, ctx.user.id))
            .limit(1);
        // If user has no settings yet → create default row
        if (!settings) {
            const [created] = await db
                .insert(schema_1.userNotificationSettings)
                .values({
                userId: ctx.user.id,
            })
                .returning();
            // Convert integer → boolean
            return {
                ...created,
                emailNotifications: !!created.emailNotifications,
                taskDueReminder: !!created.taskDueReminder,
                newTaskAssigned: !!created.newTaskAssigned,
                marketingEmails: !!created.marketingEmails,
            };
        }
        // Convert integer → boolean
        return {
            ...settings,
            emailNotifications: !!settings.emailNotifications,
            taskDueReminder: !!settings.taskDueReminder,
            newTaskAssigned: !!settings.newTaskAssigned,
            marketingEmails: !!settings.marketingEmails,
        };
    }),
    // ----------------------------------------------------
    // UPDATE SETTINGS
    // ----------------------------------------------------
    update: trpc_1.protectedProcedure
        .input(zod_1.z.object({
        emailNotifications: zod_1.z.boolean(),
        taskDueReminder: zod_1.z.boolean(),
        newTaskAssigned: zod_1.z.boolean(),
        marketingEmails: zod_1.z.boolean(),
    }))
        .mutation(async ({ input, ctx }) => {
        const db = ctx.db;
        const payload = {
            emailNotifications: input.emailNotifications ? 1 : 0,
            taskDueReminder: input.taskDueReminder ? 1 : 0,
            newTaskAssigned: input.newTaskAssigned ? 1 : 0,
            marketingEmails: input.marketingEmails ? 1 : 0,
            updatedAt: new Date(),
        };
        const [updated] = await db
            .update(schema_1.userNotificationSettings)
            .set(payload)
            .where((0, drizzle_orm_1.eq)(schema_1.userNotificationSettings.userId, ctx.user.id))
            .returning();
        return {
            success: true,
            settings: {
                ...updated,
                emailNotifications: !!updated.emailNotifications,
                taskDueReminder: !!updated.taskDueReminder,
                newTaskAssigned: !!updated.newTaskAssigned,
                marketingEmails: !!updated.marketingEmails,
            },
        };
    }),
});
