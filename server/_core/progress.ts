// server/_core/progress.ts

import { tasks, projects } from "../../drizzle/schema";
import { sql, eq, and } from "drizzle-orm";

// mapping score untuk status task
const STATUS_VALUE = {
  pending: 0,
  "in-progress": 50,
  completed: 100,
} as const;

export async function recalcProjectProgress(
  dbOrTx: any,
  projectId: number,
  userId: number
) {
  // Ambil semua task di project
  const taskList: { id: number; status: keyof typeof STATUS_VALUE }[] =
    await dbOrTx
      .select({
        id: tasks.id,
        status: tasks.status,
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.userId, userId)));

  // -----------------------------------------
  // Case 1: jika tidak ada task → progress 0
  // -----------------------------------------
  if (taskList.length === 0) {
    await dbOrTx
      .update(projects)
      .set({
        progress: 0,
        status: "active",
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    return 0;
  }

  // -----------------------------------------
  // Case 2: hitung score progress
  // -----------------------------------------
  const totalScore = taskList.reduce((sum, t) => {
    return sum + (STATUS_VALUE[t.status] ?? 0);
  }, 0);

  const progress = Math.round(totalScore / taskList.length);

  // -----------------------------------------
  // Case 3: tentukan status project
  // -----------------------------------------
  let projectStatus: "active" | "completed";

  if (progress === 100) {
    projectStatus = "completed";
  } else {
    projectStatus = "active";
  }

  // -----------------------------------------
  // Update project
  // -----------------------------------------
  await dbOrTx
    .update(projects)
    .set({
      progress,
      status: projectStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return progress;
}
