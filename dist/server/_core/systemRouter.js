"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemRouter = void 0;
const zod_1 = require("zod");
const notification_1 = require("./notification");
const trpc_1 = require("./trpc");
exports.systemRouter = (0, trpc_1.router)({
    // --------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------
    health: trpc_1.publicProcedure
        .input(zod_1.z.object({
        timestamp: zod_1.z.number().min(0, "timestamp cannot be negative"),
    }))
        .query(({ input }) => {
        return {
            ok: true,
            receivedAt: input.timestamp,
        };
    }),
    // --------------------------------------------------
    // SEND NOTIFICATION TO OWNER (ADMIN ONLY)
    // --------------------------------------------------
    notifyOwner: trpc_1.adminProcedure
        .input(zod_1.z.object({
        title: zod_1.z.string().min(1, "title is required"),
        content: zod_1.z.string().min(1, "content is required"),
    }))
        .mutation(async ({ input }) => {
        try {
            // input dijamin Zod: sudah pasti punya title & content
            const payload = {
                title: input.title,
                content: input.content,
            };
            const delivered = await (0, notification_1.notifyOwner)(payload);
            return {
                success: true,
                delivered,
            };
        }
        catch (err) {
            return {
                success: false,
                delivered: false,
                error: err instanceof Error ? err.message : "Unknown error",
            };
        }
    }),
});
