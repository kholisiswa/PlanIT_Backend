"use strict";
// server/_core/progress.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalcProjectProgress = recalcProjectProgress;
const schema_1 = require("../../drizzle/schema");
const drizzle_orm_1 = require("drizzle-orm");
// mapping score untuk status task
const STATUS_VALUE = {
    pending: 0,
    "in-progress": 50,
    completed: 100,
};
async function recalcProjectProgress(dbOrTx, projectId, userId) {
    // Ambil semua task di project
    const taskList = await dbOrTx
        .select({
        id: schema_1.tasks.id,
        status: schema_1.tasks.status,
    })
        .from(schema_1.tasks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tasks.projectId, projectId), (0, drizzle_orm_1.eq)(schema_1.tasks.userId, userId)));
    // -----------------------------------------
    // Case 1: jika tidak ada task → progress 0
    // -----------------------------------------
    if (taskList.length === 0) {
        await dbOrTx
            .update(schema_1.projects)
            .set({
            progress: 0,
            status: "active",
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, projectId), (0, drizzle_orm_1.eq)(schema_1.projects.userId, userId)));
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
    let projectStatus;
    if (progress === 100) {
        projectStatus = "completed";
    }
    else {
        projectStatus = "active";
    }
    // -----------------------------------------
    // Update project
    // -----------------------------------------
    await dbOrTx
        .update(schema_1.projects)
        .set({
        progress,
        status: projectStatus,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.projects.id, projectId), (0, drizzle_orm_1.eq)(schema_1.projects.userId, userId)));
    return progress;
}
