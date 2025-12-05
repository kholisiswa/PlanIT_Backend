import { createTRPCRouter, protectedProcedure } from "./trpc";
import { getDb } from "../db";
import {
  projects,
  tasks,
  tags,
  taskTags,
  userNotificationSettings,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const exportRouter = createTRPCRouter({

  // -----------------------------
  // EXPORT SEMUA DATA (JSON)
  // -----------------------------
  exportAll: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user.id;

    const userProjects = await db.select().from(projects).where(eq(projects.userId, userId));
    const userTasks = await db.select().from(tasks).where(eq(tasks.userId, userId));
    const userTags = await db.select().from(tags).where(eq(tags.userId, userId));

    const userTaskTags = await db
      .select()
      .from(taskTags)
      .innerJoin(tasks, eq(taskTags.taskId, tasks.id))
      .where(eq(tasks.userId, userId));

    const userNotifSettings = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, userId));

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
  storageUsage: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user.id;

    const projectsData = await db.select().from(projects).where(eq(projects.userId, userId));
    const tasksData = await db.select().from(tasks).where(eq(tasks.userId, userId));
    const tagsData = await db.select().from(tags).where(eq(tags.userId, userId));

    const taskTagsData = await db
      .select()
      .from(taskTags)
      .innerJoin(tasks, eq(taskTags.taskId, tasks.id))
      .where(eq(tasks.userId, userId));

    const notifData = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, userId));

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
  json: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user.id;

    const data = await db.select().from(tasks).where(eq(tasks.userId, userId));

    return { data };
  }),

  // -----------------------------
  // EXPORT CSV FILE
  // -----------------------------
  csv: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user.id;

    const data = await db.select().from(tasks).where(eq(tasks.userId, userId));

    if (!data.length) return { csv: "" };

    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((row) =>
      Object.values(row)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    const csv = [headers, ...rows].join("\n");

    return { csv };
  }),

  // -----------------------------
  // EXPORT PDF (TEXT-BASED)
  // -----------------------------
  pdf: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user.id;

    const data = await db.select().from(tasks).where(eq(tasks.userId, userId));

    return {
      pdfText: JSON.stringify(data, null, 2),
    };
  }),

});
