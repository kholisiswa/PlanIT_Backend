import { createTRPCRouter, protectedProcedure } from "./trpc";
import { z } from "zod";
import { userNotificationSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const notificationRouter = createTRPCRouter({

  // ----------------------------------------------------
  // GET USER NOTIFICATION SETTINGS
  // ----------------------------------------------------
  get: protectedProcedure.query(async ({ ctx }) => {
    console.log("NOTIFICATION.GET DIPANGGIL");
    console.log("User ID:", ctx.user?.id);
    console.log("User Email:", ctx.user?.email);

    const db = ctx.db;

    const [settings] = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, ctx.user.id))
      .limit(1);

    // If user has no settings yet → create default row
    if (!settings) {
      console.log("SETTINGS TIDAK ADA. MEMBUAT DEFAULT...");

      const [created] = await db
        .insert(userNotificationSettings)
        .values({
          userId: ctx.user.id,
        })
        .returning();

      console.log("DEFAULT SETTINGS TERBUAT UNTUK USER:", ctx.user.id);

      return {
        ...created,
        emailNotifications: !!created.emailNotifications,
        taskDueReminder: !!created.taskDueReminder,
        newTaskAssigned: !!created.newTaskAssigned,
        marketingEmails: !!created.marketingEmails,
      };
    }

    console.log("SETTINGS DITEMUKAN UNTUK USER:", ctx.user.id);

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
      console.log("NOTIFICATION.UPDATE DIPANGGIL");
      console.log("User ID:", ctx.user?.id);
      console.log("Input Update:", input);

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

      console.log("SETTINGS BERHASIL DIUPDATE UNTUK USER:", ctx.user.id);

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
