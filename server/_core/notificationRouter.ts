import { createTRPCRouter, protectedProcedure } from "./trpc";
import { z } from "zod";
import { userNotificationSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const notificationRouter = createTRPCRouter({

  // ----------------------------------------------------
  // GET USER NOTIFICATION SETTINGS
  // ----------------------------------------------------
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;

    const [settings] = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, ctx.user.id))
      .limit(1);

    // If user has no settings yet → create default row
    if (!settings) {
      const [created] = await db
        .insert(userNotificationSettings)
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
  update: protectedProcedure
    .input(
      z.object({
        emailNotifications: z.boolean(),
        taskDueReminder: z.boolean(),
        newTaskAssigned: z.boolean(),
        marketingEmails: z.boolean(),
      })
    )
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
        .update(userNotificationSettings)
        .set(payload)
        .where(eq(userNotificationSettings.userId, ctx.user.id))
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
