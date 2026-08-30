const express = require("express");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

function cleanTaskId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// Repair only legacy tasks whose assignment was saved as a non-numeric
// external/Firebase identifier while the visible staff name still exists.
// Normal task payloads continue to the existing routers unchanged.
router.get("/:id", async (req, res, next) => {
  const taskId = cleanTaskId(req.params.id);
  if (!taskId) return next();

  try {
    const [taskRows] = await promiseDb.query(
      "SELECT * FROM tasks WHERE id = ? LIMIT 1",
      [taskId]
    );
    const task = taskRows?.[0];
    if (!task) return next();

    const [assignmentRows] = await promiseDb.query(
      "SELECT user_id FROM task_assignments WHERE task_id = ? LIMIT 1",
      [taskId]
    );
    const [historyRows] = await promiseDb.query(
      "SELECT user_id FROM task_assignment_history WHERE task_id = ? LIMIT 1",
      [taskId]
    );

    // Existing canonical assignments must use the normal detail router.
    if (assignmentRows?.length || historyRows?.length) return next();

    const legacyValue = firstText(task.user_id, task.assigned_user_id, task.assignedTo);
    const legacyIsNumeric = /^\d+$/.test(legacyValue);
    const staffName = firstText(task.staff_name, task.assigned_to, task.assigned_name);

    if (legacyIsNumeric || !staffName) return next();

    const [users] = await promiseDb.query(
      `SELECT id, name, email, role, profile_pic
       FROM users
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
       LIMIT 1`,
      [staffName]
    );

    const user = users?.[0];
    if (!user) return next();

    const userId = Number(user.id);
    const assignedUser = {
      id: userId,
      user_id: userId,
      name: user.name || staffName,
      email: user.email || null,
      role: user.role || null,
      profile_pic: user.profile_pic || null,
      assignment_status: task.status || "Pending",
      assignment_cycle: Number(task.assignment_cycle || 1),
    };

    return res.json({
      success: true,
      task: {
        ...task,
        id: Number(task.id),
        task_id: Number(task.id),
        display_task_id: `#${Number(task.id)}`,
        user_id: String(userId),
        assigned_user_id: String(userId),
        user_ids: [String(userId)],
        assigned_user_ids: [String(userId)],
        assigned_users: [assignedUser],
        assigned_staff_names: [assignedUser.name],
        assigned_staff_emails: [assignedUser.email],
        assigned_staff_roles: [assignedUser.role],
        staff_name: assignedUser.name,
        assigned_to: assignedUser.name,
      },
    });
  } catch (error) {
    console.error("TASK LEGACY ASSIGNEE REPAIR ERROR:", error);
    return next(error);
  }
});

module.exports = router;
