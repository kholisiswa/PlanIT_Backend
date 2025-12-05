import { z } from "zod";
import { notifyOwner, type NotificationPayload } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  // --------------------------------------------------
  // HEALTH CHECK
  // --------------------------------------------------
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(({ input }) => {
      return {
        ok: true,
        receivedAt: input.timestamp,
      };
    }),

  // --------------------------------------------------
  // SEND NOTIFICATION TO OWNER (ADMIN ONLY)
  // --------------------------------------------------
  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // input dijamin Zod: sudah pasti punya title & content
        const payload: NotificationPayload = {
          title: input.title,
          content: input.content,
        };

        const delivered = await notifyOwner(payload);

        return {
          success: true,
          delivered,
        };
      } catch (err) {
        return {
          success: false,
          delivered: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),
});
