"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appRouter = void 0;
const trpc_1 = require("./trpc");
const authRouter_1 = require("./authRouter");
const projectRouter_1 = require("./projectRouter");
const systemRouter_1 = require("./systemRouter");
const tagRouter_1 = require("./tagRouter");
const taskRouter_1 = require("./taskRouter");
const notificationRouter_1 = require("./notificationRouter");
const exportRouter_1 = require("./exportRouter");
exports.appRouter = (0, trpc_1.createTRPCRouter)({
    auth: authRouter_1.authRouter,
    project: projectRouter_1.projectRouter,
    system: systemRouter_1.systemRouter,
    tag: tagRouter_1.tagRouter,
    task: taskRouter_1.taskRouter,
    notification: notificationRouter_1.notificationRouter,
    export: exportRouter_1.exportRouter,
});
