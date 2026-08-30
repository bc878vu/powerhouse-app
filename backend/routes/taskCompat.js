const express = require("express");
const fs = require("fs");
const path = require("path");
const upload = require("../middleware/upload");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

const completionUpload = upload.fields([
  { name: "files", maxCount: 20 },
  { name: "voiceNotes", maxCount: 10 },
  { name: "voice_notes", maxCount: 10 },
  { name: "voiceNote", maxCount: 10 },
  { name: "voice_note", maxCount: 10 },
]);

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

function pick(obj, names, fallback = null) {
  for (const name of names) {
    if (obj?.[name] !== undefined && obj?.[name] !== null) return obj[name];
  }
  return fallback;
}

function storedFiles(files = []) {
  return (files || []).map((file) => ({
    path: `uploads/${file.filename}`,
    type: file.mimetype || "application/octet-stream",
    originalName: file.originalname || null,
  }));
}

async function columns(table) {
  const [rows] = await promiseDb.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set((rows || []).map((row) => row.Field));
}

async function resolveTask(id) {
  const taskId = cleanId(id);
  if (!taskId) return null;
  const [rows] = await promiseDb.query("SELECT * FROM tasks WHERE id = ? LIMIT 1", [taskId]);
  return rows[0] || null;
}

async function getAssignedUsers(taskId) {
  try {
    const [rows] = await promiseDb.query(
      `SELECT ta.user_id, u.name, u.email, u.role, u.profile_pic,
              ta.status AS assignment_status,
              ta.accepted_at, ta.completed_at, ta.rejected_at,
              ta.rejection_reason, ta.assignment_cycle
       FROM task_assignments ta
       LEFT JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = ?
       ORDER BY ta.user_id ASC`,
      [taskId]
    );
    return rows || [];
  } catch (error) {
    console.warn("TASK COMPAT rich assignment lookup skipped:", error.message);
    try {
      const [rows] = await promiseDb.query(
        `SELECT ta.user_id, u.name, u.email, u.role, u.profile_pic
         FROM task_assignments ta
         LEFT JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id = ?
         ORDER BY ta.user_id ASC`,
        [taskId]
      );
      return (rows || []).map((row) => ({
        ...row,
        assignment_status: "",
        assignment_cycle: null,
      }));
    } catch (fallbackError) {
      console.warn("TASK COMPAT assignment fallback skipped:", fallbackError.message);
      return [];
    }
  }
}

async function getAssignmentHistory(taskId) {
  try {
    const [rows] = await promiseDb.query(
      `SELECT h.*, u.name, u.email, u.role, u.profile_pic
       FROM task_assignment_history h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.task_id = ?
       ORDER BY h.assignment_cycle ASC, h.user_id ASC, h.id ASC`,
      [taskId]
    );
    return rows || [];
  } catch (error) {
    console.warn("TASK COMPAT history lookup skipped:", error.message);
    return [];
  }
}

async function getCompletionReports(taskId) {
  try {
    const [rows] = await promiseDb.query(
      `SELECT tc.*, u.name AS completion_user_name,
              u.email AS completion_user_email,
              u.role AS completion_user_role,
              u.profile_pic AS completion_user_profile_pic
       FROM task_completions tc
       LEFT JOIN users u ON u.id = tc.user_id
       WHERE tc.task_id = ?
       ORDER BY tc.id ASC`,
      [taskId]
    );

    return (rows || []).map((row) => {
      const media = parseJson(row.media_files, []);
      const voice = parseJson(row.voice_notes, []);
      const voiceArray = Array.isArray(voice) ? voice : [];
      const primaryVoice = voiceArray[0] || (row.voice_note ? { path: row.voice_note, type: "audio/webm" } : null);
      return {
        id: Number(row.id),
        task_id: Number(row.task_id),
        user_id: Number(row.user_id),
        assignment_cycle: row.assignment_cycle == null ? null : Number(row.assignment_cycle),
        completion_note: row.completion_note || "",
        media_files: Array.isArray(media) ? media : [],
        media: Array.isArray(media) ? media : [],
        attachments: Array.isArray(media) ? media : [],
        voice_notes: voiceArray,
        voice_note: primaryVoice,
        submitted_at: row.submitted_at || null,
        updated_at: row.updated_at || null,
        submitted_by: {
          id: Number(row.user_id),
          name: row.completion_user_name || null,
          email: row.completion_user_email || null,
          role: row.completion_user_role || null,
          profile_pic: row.completion_user_profile_pic || null,
        },
      };
    });
  } catch (error) {
    console.warn("TASK COMPAT completion lookup skipped:", error.message);
    return [];
  }
}

async function buildTask(id) {
  const task = await resolveTask(id);
  if (!task) return null;

  const [assignedUsers, assignmentHistory, completionReports] = await Promise.all([
    getAssignedUsers(task.id),
    getAssignmentHistory(task.id),
    getCompletionReports(task.id),
  ]);

  const assignedIds = assignedUsers.map((u) => String(u.user_id));
  const assignedNames = assignedUsers.map((u) => u.name || "");
  const latestAssignment = assignmentHistory.length ? assignmentHistory[assignmentHistory.length - 1] : null;
  const parsedFiles = parseJson(task.file_url, []);
  const attachments = Array.isArray(parsedFiles) ? parsedFiles : (parsedFiles ? [parsedFiles] : []);
  const cycleSet = new Set(assignmentHistory.map((item) => Number(item.assignment_cycle || 1)));

  // Canonical status for report views: a saved completion report means the task is completed.
  // This preserves the stored task and only normalizes the response when legacy/stale status data exists.
  const hasCompletionReport = completionReports.length > 0;
  const canonicalStatus = hasCompletionReport ? "Completed" : task.status;

  return {
    ...task,
    status: canonicalStatus,
    executionStatus: hasCompletionReport ? "Completed" : (task.executionStatus || task.execution_status || task.status),
    completeWorkStatus: hasCompletionReport ? "Submitted" : (task.completeWorkStatus || task.complete_work_status),
    isCompleted: hasCompletionReport || Boolean(task.isCompleted || task.is_completed),
    id: Number(task.id),
    user_id: assignedIds[0] || task.user_id || null,
    user_ids: assignedIds,
    staff_name: assignedNames[0] || task.staff_name || null,
    assigned_user_ids: assignedIds,
    assigned_users: assignedUsers,
    assigned_staff_names: assignedNames,
    assignment_history: assignmentHistory,
    latest_assignment: latestAssignment,
    assignment_cycle: Number(latestAssignment?.assignment_cycle || task.assignment_cycle || 1),
    assignment_count: cycleSet.size || 1,
    repeat_count: Math.max((cycleSet.size || 1) - 1, 0),
    completion_reports: completionReports,
    latest_completion: completionReports[completionReports.length - 1] || null,
    has_completion_report: hasCompletionReport,
    attachments,
    media: attachments,
    files: attachments,
  };
}

async function handleTask(req, res) {
  try {
    const task = await buildTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, msg: "Task not found", message: "Task not found", taskId: req.params.id });
    }
    return res.json({ success: true, task });
  } catch (error) {
    console.error("TASK COMPAT GET ERROR:", error);
    return res.status(500).json({ success: false, msg: error.message || "Failed to load task", message: error.message || "Failed to load task" });
  }
}

router.get("/single/:id", handleTask);
router.get("/:id/pre", handleTask);
router.get("/:id", handleTask);

router.post("/complete-work/:id", completionUpload, async (req, res) => {
  const taskId = cleanId(req.params.id);
  const uploadedFiles = [
    ...(req.files?.files || []),
    ...(req.files?.voiceNotes || []),
    ...(req.files?.voice_notes || []),
    ...(req.files?.voiceNote || []),
    ...(req.files?.voice_note || []),
  ];

  const cleanup = async () => {
    for (const file of uploadedFiles) {
      try {
        const target = path.resolve(__dirname, "..", "uploads", file.filename);
        if (fs.existsSync(target)) await fs.promises.unlink(target);
      } catch {}
    }
  };

  try {
    if (!taskId) {
      await cleanup();
      return res.status(400).json({ success: false, msg: "Invalid task ID" });
    }

    const task = await resolveTask(taskId);
    if (!task) {
      await cleanup();
      return res.status(404).json({ success: false, msg: "Task not found" });
    }

    let userId = cleanId(pick(req.body, ["user_id", "userId"]));
    if (!userId) userId = cleanId(req.headers["x-user-id"]);
    const assignmentRows = await getAssignedUsers(taskId);
    if (!userId) userId = cleanId(assignmentRows[0]?.user_id);

    if (!userId) {
      await cleanup();
      return res.status(400).json({ success: false, msg: "Valid user ID is required" });
    }

    const completionNote = String(pick(req.body, ["completion_note", "completionNote", "note"], "") || "").trim();
    const media = storedFiles(req.files?.files || []);
    const voice = storedFiles([
      ...(req.files?.voiceNotes || []),
      ...(req.files?.voice_notes || []),
      ...(req.files?.voiceNote || []),
      ...(req.files?.voice_note || []),
    ]);

    if (!completionNote && !media.length && !voice.length) {
      await cleanup();
      return res.status(400).json({ success: false, msg: "Please add a completion note, media file, or voice note before submitting work" });
    }

    const assignment = assignmentRows.find((item) => String(item.user_id) === String(userId));
    if (!assignment) {
      await cleanup();
      return res.status(403).json({ success: false, msg: "This user is not assigned to this task" });
    }

    const currentStatus = String(assignment.assignment_status || "").trim();
    if (currentStatus && currentStatus !== "In Progress") {
      await cleanup();
      return res.status(400).json({ success: false, msg: currentStatus === "Completed" ? "This assignment cycle is already completed" : currentStatus === "Rejected" ? "This assignment cycle was rejected" : "Task must be accepted before submitting completion work" });
    }

    const completionColumns = await columns("task_completions");
    const taskColumns = await columns("tasks");
    const assignmentColumns = await columns("task_assignments");
    const historyColumns = await columns("task_assignment_history");

    let assignmentCycle = Number(pick(req.body, ["assignment_cycle", "assignmentCycle"], 0)) || 0;
    if (!assignmentCycle) {
      const history = await getAssignmentHistory(taskId);
      const mine = history.filter((item) => String(item.user_id) === String(userId));
      assignmentCycle = Number(mine[mine.length - 1]?.assignment_cycle || assignment.assignment_cycle || task.assignment_cycle || 1);
    }

    const now = new Date();
    const payload = { task_id: taskId, user_id: userId, assignment_cycle: assignmentCycle, completion_note: completionNote || null, media_files: media.length ? JSON.stringify(media) : null, voice_notes: voice.length ? JSON.stringify(voice) : null, voice_note: voice[0]?.path || null, submitted_at: now, updated_at: now };
    const insertColumns = Object.keys(payload).filter((key) => completionColumns.has(key));
    if (!insertColumns.includes("task_id") || !insertColumns.includes("user_id")) throw new Error("task_completions schema is missing task_id/user_id");

    const connection = await promiseDb.getConnection();
    try {
      await connection.beginTransaction();
      const placeholders = insertColumns.map(() => "?").join(",");
      await connection.query(`INSERT INTO task_completions (${insertColumns.map((c) => `\`${c}\``).join(",")}) VALUES (${placeholders})`, insertColumns.map((key) => payload[key]));
      if (historyColumns.size) {
        const historyUpdates = {};
        if (historyColumns.has("status")) historyUpdates.status = "Completed";
        if (historyColumns.has("completed_at")) historyUpdates.completed_at = now;
        if (historyColumns.has("updated_at")) historyUpdates.updated_at = now;
        if (Object.keys(historyUpdates).length) await connection.query(`UPDATE task_assignment_history SET ${Object.keys(historyUpdates).map((c) => `\`${c}\` = ?`).join(", ")} WHERE task_id = ? AND user_id = ? AND assignment_cycle = ?`, [...Object.values(historyUpdates), taskId, userId, assignmentCycle]);
      }
      if (assignmentColumns.has("status")) {
        const updates = { status: "Completed" };
        if (assignmentColumns.has("completed_at")) updates.completed_at = now;
        if (assignmentColumns.has("updated_at")) updates.updated_at = now;
        await connection.query(`UPDATE task_assignments SET ${Object.keys(updates).map((c) => `\`${c}\` = ?`).join(", ")} WHERE task_id = ? AND user_id = ?`, [...Object.values(updates), taskId, userId]);
      }
      if (taskColumns.size) {
        const taskUpdates = {};
        if (taskColumns.has("status")) taskUpdates.status = "Completed";
        if (taskColumns.has("completed_at")) taskUpdates.completed_at = now;
        if (taskColumns.has("updated_at")) taskUpdates.updated_at = now;
        if (taskColumns.has("assignment_cycle")) taskUpdates.assignment_cycle = assignmentCycle;
        if (Object.keys(taskUpdates).length) await connection.query(`UPDATE tasks SET ${Object.keys(taskUpdates).map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ?`, [...Object.values(taskUpdates), taskId]);
      }
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      connection.release();
    }

    const updatedTask = await buildTask(taskId);
    const io = req.app.get("io");
    if (io) { io.emit("updateData"); io.emit("taskCompleted", { taskId, userId, status: "Completed", assignment_cycle: assignmentCycle }); }
    return res.status(201).json({ success: true, msg: "Work completion report submitted successfully", message: "Work completion report submitted successfully", taskId, assignment_cycle: assignmentCycle, task: updatedTask, completion: updatedTask?.latest_completion || null });
  } catch (error) {
    await cleanup();
    console.error("TASK COMPAT COMPLETE ERROR:", error);
    return res.status(500).json({ success: false, msg: error.message || "Failed to submit completion report", message: error.message || "Failed to submit completion report" });
  }
});

module.exports = router;