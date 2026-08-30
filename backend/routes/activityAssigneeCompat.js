const express = require("express");
const db = require("../config/db");
const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

router.get("/stats", async (req, res, next) => {
  try {
    const [tasks] = await promiseDb.query("SELECT * FROM tasks ORDER BY COALESCE(created_at, id) DESC, id DESC");
    const ids = tasks.map((task) => Number(task.id)).filter(Number.isInteger);
    const byTask = new Map();
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const [rows] = await promiseDb.query(
        `SELECT ta.task_id, ta.user_id, u.name, u.email, u.role, u.profile_pic
         FROM task_assignments ta
         LEFT JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id IN (${placeholders})
         ORDER BY ta.task_id ASC, ta.id ASC`, ids
      ).catch(() => [[]]);
      rows.forEach((row) => {
        const key = Number(row.task_id);
        if (!byTask.has(key)) byTask.set(key, []);
        byTask.get(key).push(row);
      });
    }

    const activities = tasks.map((task, index) => {
      const assigned = byTask.get(Number(task.id)) || [];
      const assignedIds = assigned.map((row) => String(row.user_id));
      const assignedNames = assigned.map((row) => row.name).filter(Boolean);
      return {
        ...task,
        id: Number(task.id),
        task_id: Number(task.id),
        display_task_id: `#${index + 1}`,
        display_serial: index + 1,
        user_id: assignedIds[0] || (task.user_id == null ? null : String(task.user_id)),
        user_ids: assignedIds,
        assigned_user_ids: assignedIds,
        assigned_staff_names: assignedNames,
        staff_name: assignedNames[0] || task.staff_name || task.assigned_to || null,
        assigned_to: assignedNames.join(", ") || task.assigned_to || null,
        assigned_users: assigned.map((row) => ({ id: Number(row.user_id), user_id: Number(row.user_id), name: row.name || null, email: row.email || null, role: row.role || null, profile_pic: row.profile_pic || null })),
      };
    });
    const count = (name) => activities.filter((task) => String(task.status || "").toLowerCase() === name).length;
    return res.json({
      staffCount: 0,
      taskCount: activities.length,
      pendingCount: count("pending"),
      inProgressCount: count("in progress"),
      completedCount: count("completed"),
      rejectedCount: count("rejected"),
      activities,
      onDutyToday: { count: 0, staff: [] },
      panelsUnderWork: { count: 0, panels: [] },
      panelsOff: { count: 0, panels: [] },
      panelsMaintenance: { count: 0, panels: [] },
      operationalSummary: { onDutyCount: 0, panelsUnderWorkCount: 0, panelsOffCount: 0, panelsMaintenanceCount: 0 },
      serverDate: new Date().toISOString(),
    });
  } catch (error) {
    console.error("ACTIVITY ASSIGNEE COMPAT ERROR:", error);
    return next(error);
  }
});
module.exports = router;
