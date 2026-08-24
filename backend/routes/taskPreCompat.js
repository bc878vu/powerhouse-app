const express = require("express");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

function cleanId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseFiles(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.trim()
      ? [{ path: value.trim(), type: null, originalName: null }]
      : [];
  }
}

// Legacy edit-loader compatibility endpoint.
// Some already-deployed frontend builds request /api/task/:id/pre.
router.get("/:id/pre", async (req, res) => {
  const taskId = cleanId(req.params.id);

  if (!taskId) {
    return res.status(400).json({
      success: false,
      message: "Invalid task ID",
    });
  }

  try {
    const [taskRows] = await promiseDb.query(
      `
        SELECT
          t.*,
          p.panel_code,
          p.panel_name,
          p.panel_type,
          p.area AS panel_area,
          p.location AS panel_location,
          p.status AS panel_status,
          p.status_reason AS panel_status_reason
        FROM tasks t
        LEFT JOIN panels p
          ON t.panel_id = p.id
        WHERE t.id = ?
        LIMIT 1
      `,
      [taskId]
    );

    if (!taskRows.length) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
        taskId,
      });
    }

    const task = taskRows[0];

    const [assignmentRows] = await promiseDb.query(
      `
        SELECT
          ta.user_id,
          u.name,
          u.email,
          u.role,
          u.profile_pic
        FROM task_assignments ta
        LEFT JOIN users u
          ON u.id = ta.user_id
        WHERE ta.task_id = ?
        ORDER BY ta.user_id ASC
      `,
      [taskId]
    );

    const assignedUsers = assignmentRows || [];
    const assignedIds = assignedUsers.map((row) => String(row.user_id));

    const mappedTask = {
      ...task,
      id: Number(task.id),
      panel_id: task.panel_id == null ? null : Number(task.panel_id),
      panel: task.panel_id
        ? {
            id: Number(task.panel_id),
            panel_code: task.panel_code || null,
            panel_name: task.panel_name || null,
            panel_type: task.panel_type || null,
            area: task.panel_area || null,
            location: task.panel_location || null,
            status: task.panel_status || null,
            status_reason: task.panel_status_reason || null,
          }
        : null,
      user_id: assignedIds[0] || task.user_id || null,
      assigned_user_ids: assignedIds,
      user_ids: assignedIds,
      assigned_users: assignedUsers,
      staff_name: assignedUsers[0]?.name || task.staff_name || null,
      assigned_staff_names: assignedUsers.map((row) => row.name || ""),
      media: parseFiles(task.file_url),
      attachments: parseFiles(task.file_url),
      file_url: task.file_url || null,
    };

    return res.json({
      success: true,
      task: mappedTask,
    });
  } catch (error) {
    console.error("TASK PRE-EDIT COMPAT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load task for editing",
    });
  }
});

module.exports = router;
