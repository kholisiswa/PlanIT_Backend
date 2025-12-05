import { router } from "./_core/trpc";
import { authRouter } from "./_core/authRouter";
import { projectRouter } from "./_core/projectRouter";
import { systemRouter } from "./_core/systemRouter";
import { tagRouter } from "./_core/tagRouter";
import { taskRouter } from "./_core/taskRouter";
import { notificationRouter } from "./_core/notificationRouter";
import { exportRouter } from "./_core/exportRouter";


export const appRouter = router({
  auth: authRouter,
  project: projectRouter,
  system: systemRouter,
  tag: tagRouter,
  task: taskRouter,
  notification: notificationRouter,
  export: exportRouter,
});

export type AppRouter = typeof appRouter;
