"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appRouter = void 0;
const trpc_1 = require("./_core/trpc");
const authRouter_1 = require("./_core/authRouter");
const projectRouter_1 = require("./_core/projectRouter");
const systemRouter_1 = require("./_core/systemRouter");
const tagRouter_1 = require("./_core/tagRouter");
const taskRouter_1 = require("./_core/taskRouter");
const notificationRouter_1 = require("./_core/notificationRouter");
const exportRouter_1 = require("./_core/exportRouter");
exports.appRouter = (0, trpc_1.router)({
    auth: authRouter_1.authRouter,
    project: projectRouter_1.projectRouter,
    system: systemRouter_1.systemRouter,
    tag: tagRouter_1.tagRouter,
    task: taskRouter_1.taskRouter,
    notification: notificationRouter_1.notificationRouter,
    export: exportRouter_1.exportRouter,
});
