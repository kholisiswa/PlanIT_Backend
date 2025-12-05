// ------------------------------------------------------
// drizzle/schema.ts — FINAL SUPER CLEAN
// ------------------------------------------------------

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------- ENUMS ----------------------
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high"]);
export const statusEnum = pgEnum("status", ["pending", "in-progress", "completed"]);
export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "completed",
  "archived",
]);

// ---------------------- USERS ----------------------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique().notNull(),
  password: varchar("password", { length: 255 }),
  loginMethod: varchar("login_method", { length: 64 }).default("email"),
  role: roleEnum("role").default("user").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

// ---------------------- USER NOTIFICATION SETTINGS ----------------------
export const userNotificationSettings = pgTable("user_notification_settings", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  emailNotifications: integer("email_notifications")
    .notNull()
    .default(1),        // 1 = ON, 0 = OFF

  taskDueReminder: integer("task_due_reminder")
    .notNull()
    .default(1),

  newTaskAssigned: integer("new_task_assigned")
    .notNull()
    .default(1),

  marketingEmails: integer("marketing_emails")
    .notNull()
    .default(0),       // default OFF

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
});

// ---------------------- PROJECTS ----------------------
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  status: projectStatusEnum("status").default("active").notNull(),
  progress: integer("progress").default(0),
  color: varchar("color", { length: 50 }).default("from-blue-500 to-blue-600"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
});

// ---------------------- TAGS ----------------------
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 50 }).notNull(),
  description: text("description"),

  color: varchar("color", { length: 50 }).default("#3b82f6"),
  usageCount: integer("usage_count").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------- TASKS ----------------------
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),

  priority: priorityEnum("priority").notNull().default("medium"),
  status: statusEnum("status").notNull().default("pending"),

  dueDate: timestamp("due_date"),

  position: integer("position").notNull().default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
});

// ---------------------- TASK TAGS ----------------------
export const taskTags = pgTable(
  "task_tags",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),

    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.tagId] }),
  })
);

// ---------------------- TYPES ----------------------
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type UserNotificationSettings = typeof userNotificationSettings.$inferSelect;

export type InsertUser = typeof users.$inferInsert;
export type InsertProject = typeof projects.$inferInsert;
export type InsertTask = typeof tasks.$inferInsert;
export type InsertTag = typeof tags.$inferInsert;
export type InsertUserNotificationSettings =
  typeof userNotificationSettings.$inferInsert;
