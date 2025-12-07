// _core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";

// Use plain JSON transformer so we avoid superjson (which is ESM-only) in the
// serverless bundle. Client must match this transformer configuration.
const jsonTransformer = {
  serialize: (data: unknown) => data,
  deserialize: (data: unknown) => data,
};

const t = initTRPC.context<TrpcContext>().create({
  transformer: jsonTransformer,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError
          ? error.cause.flatten()
          : null,
      },
    };
  },
});

// router helpers
export const router = t.router;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;


// middleware: require user
const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: { ...ctx, user: ctx.user },
  });
});

// protected
export const protectedProcedure = t.procedure.use(requireUser);

// admin only
export const adminProcedure = t.procedure.use(
  t.middleware(({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return next({
      ctx: { ...ctx, user: ctx.user },
    });
  })
);
