"use strict";
// ------------------------------------------------------
// drizzle/schema.ts — FINAL SUPER CLEAN
// ------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskTags = exports.tasks = exports.tags = exports.projects = exports.userNotificationSettings = exports.users = exports.projectStatusEnum = exports.statusEnum = exports.priorityEnum = exports.roleEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
// ---------------------- ENUMS ----------------------
exports.roleEnum = (0, pg_core_1.pgEnum)("role", ["user", "admin"]);
exports.priorityEnum = (0, pg_core_1.pgEnum)("priority", ["low", "medium", "high"]);
exports.statusEnum = (0, pg_core_1.pgEnum)("status", ["pending", "in-progress", "completed"]);
exports.projectStatusEnum = (0, pg_core_1.pgEnum)("project_status", [
    "active",
    "completed",
    "archived",
]);
// ---------------------- USERS ----------------------
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    openId: (0, pg_core_1.varchar)("open_id", { length: 64 }).unique(),
    name: (0, pg_core_1.text)("name"),
    email: (0, pg_core_1.varchar)("email", { length: 320 }).unique().notNull(),
    password: (0, pg_core_1.varchar)("password", { length: 255 }),
    loginMethod: (0, pg_core_1.varchar)("login_method", { length: 64 }).default("email"),
    role: (0, exports.roleEnum)("role").default("user").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
    lastSignedIn: (0, pg_core_1.timestamp)("last_signed_in").defaultNow().notNull(),
});
// ---------------------- USER NOTIFICATION SETTINGS ----------------------
exports.userNotificationSettings = (0, pg_core_1.pgTable)("user_notification_settings", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    emailNotifications: (0, pg_core_1.integer)("email_notifications")
        .notNull()
        .default(1), // 1 = ON, 0 = OFF
    taskDueReminder: (0, pg_core_1.integer)("task_due_reminder")
        .notNull()
        .default(1),
    newTaskAssigned: (0, pg_core_1.integer)("new_task_assigned")
        .notNull()
        .default(1),
    marketingEmails: (0, pg_core_1.integer)("marketing_emails")
        .notNull()
        .default(0), // default OFF
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .defaultNow()
        .notNull()
        .$onUpdate(() => (0, drizzle_orm_1.sql) `now()`),
});
// ---------------------- PROJECTS ----------------------
exports.projects = (0, pg_core_1.pgTable)("projects", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    status: (0, exports.projectStatusEnum)("status").default("active").notNull(),
    progress: (0, pg_core_1.integer)("progress").default(0),
    color: (0, pg_core_1.varchar)("color", { length: 50 }).default("from-blue-500 to-blue-600"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .defaultNow()
        .notNull()
        .$onUpdate(() => (0, drizzle_orm_1.sql) `now()`),
});
// ---------------------- TAGS ----------------------
exports.tags = (0, pg_core_1.pgTable)("tags", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.varchar)("name", { length: 50 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    color: (0, pg_core_1.varchar)("color", { length: 50 }).default("#3b82f6"),
    usageCount: (0, pg_core_1.integer)("usage_count").default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
// ---------------------- TASKS ----------------------
exports.tasks = (0, pg_core_1.pgTable)("tasks", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.integer)("user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    projectId: (0, pg_core_1.integer)("project_id")
        .notNull()
        .references(() => exports.projects.id, { onDelete: "cascade" }),
    title: (0, pg_core_1.varchar)("title", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    priority: (0, exports.priorityEnum)("priority").notNull().default("medium"),
    status: (0, exports.statusEnum)("status").notNull().default("pending"),
    dueDate: (0, pg_core_1.timestamp)("due_date"),
    position: (0, pg_core_1.integer)("position").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at")
        .defaultNow()
        .notNull()
        .$onUpdate(() => (0, drizzle_orm_1.sql) `now()`),
});
// ---------------------- TASK TAGS ----------------------
exports.taskTags = (0, pg_core_1.pgTable)("task_tags", {
    taskId: (0, pg_core_1.integer)("task_id")
        .notNull()
        .references(() => exports.tasks.id, { onDelete: "cascade" }),
    tagId: (0, pg_core_1.integer)("tag_id")
        .notNull()
        .references(() => exports.tags.id, { onDelete: "cascade" }),
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.taskId, table.tagId] }),
}));
