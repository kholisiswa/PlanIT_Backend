"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminProcedure = exports.protectedProcedure = exports.publicProcedure = exports.createTRPCRouter = exports.router = void 0;
// _core/trpc.ts
const server_1 = require("@trpc/server");
const superjson_1 = __importDefault(require("superjson"));
const zod_1 = require("zod");
const t = server_1.initTRPC.context().create({
    transformer: superjson_1.default,
    errorFormatter({ shape, error }) {
        return {
            ...shape,
            data: {
                ...shape.data,
                zodError: error.cause instanceof zod_1.ZodError
                    ? error.cause.flatten()
                    : null,
            },
        };
    },
});
// router helpers
exports.router = t.router;
exports.createTRPCRouter = t.router;
exports.publicProcedure = t.procedure;
// middleware: require user
const requireUser = t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
        throw new server_1.TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
        ctx: { ...ctx, user: ctx.user },
    });
});
// protected
exports.protectedProcedure = t.procedure.use(requireUser);
// admin only
exports.adminProcedure = t.procedure.use(t.middleware(({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
        throw new server_1.TRPCError({ code: "FORBIDDEN" });
    }
    return next({
        ctx: { ...ctx, user: ctx.user },
    });
}));
