const express = require("express");
const router = express.Router();
const db = require("../config/db");
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

function cleanId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function resolveTask(id) {
  const taskId = cleanId(id);
  if (!taskId) return null;
  const [rows] = await promiseDb.query("SELECT * FROM tasks WHERE id = ? LIMIT 1", [taskId]);
  return rows[0] || null;
}

async function getAssignedUsers(taskId, task) {
  const users = new Map();
  const add = (row) => {
    if (!row || row.user_id == null || String(row.user_id).trim() === "") return;
    const id = String(row.user_id);
    const existing = users.get(id) || {};
    users.set(id, {
      ...existing,
      user_id: row.user_id,
      id: row.user_id,
      name: row.name || row.user_name || row.staff_name || existing.name || null,
      email: row.email || existing.email || null,
      role: row.role || existing.role || null,
      profile_pic: row.profile_pic || existing.profile_pic || null,
      assignment_status: row.assignment_status || existing.assignment_status || null,
      assignment_cycle: row.assignment_cycle ?? existing.assignment_cycle ?? null,
    });
  };

  try {
    const [rows] = await promiseDb.query(
      `SELECT ta.user_id, u.name, u.email, u.role, u.profile_pic
       FROM task_assignments ta
       LEFT JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = ?
       ORDER BY ta.user_id ASC`,
      [taskId]
    );
    (rows || []).forEach(add);
  } catch (error) {
    console.warn("TASK COMPAT assignment lookup failed:", error.message);
  }

  if (!users.size) {
    try {
      const [rows] = await promiseDb.query(
        `SELECT h.user_id, u.name, u.email, u.role, u.profile_pic,
                h.status AS assignment_status, h.assignment_cycle
         FROM task_assignment_history h
         LEFT JOIN users u ON u.id = h.user_id
         WHERE h.task_id = ?
           AND h.assignment_cycle = (
             SELECT MAX(h2.assignment_cycle)
             FROM task_assignment_history h2
             WHERE h2.task_id = h.task_id
           )
         ORDER BY h.user_id ASC, h.id DESC`,
        [taskId]
      );
      (rows || []).forEach(add);
    } catch (error) {
      console.warn("TASK COMPAT history assignee fallback failed:", error.message);
    }
  }

  if (!users.size && task?.user_id != null) {
    try {
      const [rows] = await promiseDb.query(
        `SELECT id AS user_id, name, email, role, profile_pic FROM users WHERE id = ? LIMIT 1`,
        [task.user_id]
      );
      (rows || []).forEach(add);
    } catch {}
  }

  return [...users.values()];
}

async function getAssignmentHistory(taskId) {
  try {
    const [rows] = await promiseDb.query(
      `SELECT h.*, u.name AS user_name, u.email AS user_email,
              u.role AS user_role, u.profile_pic AS user_profile_pic
       FROM task_assignment_history h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.task_id = ?
       ORDER BY h.assignment_cycle ASC, h.user_id ASC, h.id ASC`,
      [taskId]
    );
    return rows || [];
  } catch { return []; }
}

async function getCompletionReports(taskId) {
  try {
    const [rows] = await promiseDb.query(
      `SELECT tc.*, u.name AS completion_user_name, u.email AS completion_user_email,
              u.role AS completion_user_role, u.profile_pic AS completion_user_profile_pic
       FROM task_completions tc
       LEFT JOIN users u ON u.id = tc.user_id
       WHERE tc.task_id = ?
       ORDER BY tc.submitted_at DESC, tc.id DESC`,
      [taskId]
    );
    return (rows || []).map((row) => {
      const media = parseJson(row.media_files, []);
      const voice = parseJson(row.voice_notes, []);
      const voiceNotes = Array.isArray(voice) ? voice : [];
      return {
        ...row,
        id: Number(row.id),
        task_id: Number(row.task_id),
        user_id: Number(row.user_id),
        assignment_cycle: row.assignment_cycle == null ? null : Number(row.assignment_cycle),
        media_files: Array.isArray(media) ? media : [],
        media: Array.isArray(media) ? media : [],
        attachments: Array.isArray(media) ? media : [],
        voice_notes: voiceNotes,
        voice_note: voiceNotes[0] || (row.voice_note ? { path: row.voice_note, type: "audio/webm" } : null),
        submitted_by: {
          id: Number(row.user_id),
          name: row.completion_user_name || null,
          email: row.completion_user_email || null,
          role: row.completion_user_role || null,
          profile_pic: row.completion_user_profile_pic || null,
        },
      };
    });
  } catch { return []; }
}

async function buildTask(id) {
  const task = await resolveTask(id);
  if (!task) return null;

  const [assignedUsers, assignmentHistory, completionReports] = await Promise.all([
    getAssignedUsers(task.id, task),
    getAssignmentHistory(task.id),
    getCompletionReports(task.id),
  ]);

  const latestAssignment = assignmentHistory[assignmentHistory.length - 1] || null;
  const hasCompletionReport = completionReports.length > 0;
  const assignedIds = assignedUsers.map((u) => String(u.user_id));
  const assignedNames = assignedUsers.map((u) => u.name || "");
  const parsedFiles = parseJson(task.file_url, []);
  const attachments = Array.isArray(parsedFiles) ? parsedFiles : (parsedFiles ? [parsedFiles] : []);
  const currentStatus = task.status || latestAssignment?.status || "Pending";
  const isCompleted = String(currentStatus).trim().toLowerCase() === "completed";

  return {
    ...task,
    id: Number(task.id),
    // Historical completion reports are preserved for rendering, but never
    // overwrite the current task/cycle status after reassignment.
    status: currentStatus,
    executionStatus: currentStatus,
    completeWorkStatus: isCompleted ? "Submitted" : (task.completeWorkStatus || task.complete_work_status || "Not Submitted"),
    isCompleted,
    user_id: assignedIds[0] || task.user_id || null,
    user_ids: assignedIds,
    staff_name: assignedNames[0] || task.staff_name || null,
    assigned_user_ids: assignedIds,
    assigned_staff_names: assignedNames,
    assigned_users: assignedUsers,
    assignment_history: assignmentHistory,
    latest_assignment: latestAssignment,
    assignment_cycle: Number(latestAssignment?.assignment_cycle || task.assignment_cycle || 1),
    assignment_count: Math.max(1, new Set(assignmentHistory.map((item) => Number(item.assignment_cycle || 1))).size),
    completion_reports: completionReports,
    latest_completion: completionReports[0] || null,
    has_completion_report: hasCompletionReport,
    attachments,
    media: attachments,
    files: attachments,
  };
}

async function handleTask(req, res) {
  try {
    const task = await buildTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, msg: "Task not found", message: "Task not found" });
    return res.json({ success: true, task, data: task });
  } catch (error) {
    console.error("TASK COMPAT GET ERROR:", error);
    return res.status(500).json({ success: false, msg: error.message || "Failed to load task", message: error.message || "Failed to load task" });
  }
}

router.get("/single/:id", handleTask);
router.get("/:id/pre", handleTask);
router.get("/:id", handleTask);

// Mutating task routes intentionally fall through to the canonical task router.
module.exports = router;
