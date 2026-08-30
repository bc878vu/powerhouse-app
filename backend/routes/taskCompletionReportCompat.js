const express = require("express");
const db = require("../config/db");

const router = express.Router();

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

function parseJson(value, fallback = []) {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeFiles(value) {
  const parsed = parseJson(value, []);
  if (Array.isArray(parsed)) return parsed;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

// Dedicated compatibility reader for the printable task report. It only owns
// GET /:id and leaves all mutation/status routes untouched.
router.get("/:id", async (req, res, next) => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) return next();

  try {
    const tasks = await query(
      `SELECT * FROM tasks WHERE id = ? LIMIT 1`,
      [taskId]
    );

    if (!tasks.length) return next();

    const task = { ...tasks[0] };
    task.file_url = normalizeFiles(task.file_url);
    task.media = task.file_url;

    const assignedUsers = await query(
      `SELECT u.id AS user_id, u.name, u.email, u.role, u.profile_pic
       FROM task_assignments ta
       LEFT JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = ?
       ORDER BY ta.user_id ASC`,
      [taskId]
    );

    task.assigned_users = assignedUsers || [];
    if (assignedUsers.length) {
      task.user_id = assignedUsers[0].user_id;
      task.staff_name = assignedUsers[0].name || task.staff_name || null;
    }

    const completionRows = await query(
      `SELECT tc.*, u.name AS completion_user_name, u.email AS completion_user_email,
              u.role AS completion_user_role, u.profile_pic AS completion_user_profile_pic
       FROM task_completions tc
       LEFT JOIN users u ON u.id = tc.user_id
       WHERE tc.task_id = ?
       ORDER BY tc.submitted_at DESC, tc.id DESC`,
      [taskId]
    );

    const completionReports = (completionRows || []).map((row) => ({
      ...row,
      completion_note: row.completion_note || row.note || row.description || row.remarks || "",
      media_files: normalizeFiles(row.media_files || row.media || row.attachments || row.files),
      voice_notes: normalizeFiles(row.voice_notes || row.voice_note),
      submitted_by: {
        id: row.user_id || null,
        name: row.completion_user_name || row.staff_name || row.user_name || "Unknown User",
        email: row.completion_user_email || null,
        role: row.completion_user_role || null,
        profile_pic: row.completion_user_profile_pic || null,
      },
    }));

    task.completion_reports = completionReports;
    task.latest_completion = completionReports[0] || null;
    task.has_completion_report = completionReports.length > 0;
    task.complete_work_status = completionReports.length > 0 ? "Completed" : "Not Submitted";
    task.completion_count = completionReports.length;

    return res.json({ success: true, task });
  } catch (error) {
    console.error("[TASK-COMPLETION-REPORT-COMPAT]", error.message);
    return next();
  }
});

module.exports = router;
