const express = require("express");
const upload = require("../middleware/upload");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

const completionUpload = upload.fields([
  { name: "files", maxCount: 20 },
  { name: "voiceNotes", maxCount: 10 },
  { name: "voice_notes", maxCount: 10 },
  { name: "voiceNote", maxCount: 1 },
]);

function cleanId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function storedFiles(files = []) {
  return files.map((file) => ({
    path: `uploads/${file.filename}`,
    type: file.mimetype || "application/octet-stream",
    originalName: file.originalname || null,
  }));
}

function parseJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function columns(table) {
  const [rows] = await promiseDb.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map((row) => row.Field));
}

function pick(obj, names, fallback = null) {
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return fallback;
}

async function resolveTask(id) {
  const taskId = cleanId(id);
  if (!taskId) return null;
  const [rows] = await promiseDb.query("SELECT * FROM tasks WHERE id = ? LIMIT 1", [taskId]);
  return rows[0] || null;
}

async function buildTask(id) {
  const task = await resolveTask(id);
  if (!task) return null;

  let assignedUsers = [];
  try {
    const [rows] = await promiseDb.query(
      `SELECT ta.user_id, u.name, u.email, u.role, u.profile_pic
       FROM task_assignments ta
       LEFT JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = ?
       ORDER BY ta.user_id ASC`,
      [task.id]
    );
    assignedUsers = rows || [];
  } catch (error) {
    console.warn("Task compatibility assignment lookup skipped:", error.message);
  }

  let completions = [];
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
      [task.id]
    );
    completions = rows || [];
  } catch (error) {
    console.warn("Task compatibility completion lookup skipped:", error.message);
  }

  const mappedCompletions = completions.map((row) => {
    const media = parseJson(row.media_files, []);
    const voice = parseJson(row.voice_notes, []);
    const primaryVoice = voice[0] || (row.voice_note ? { path: row.voice_note, type: "audio/webm" } : null);
    return {
      id: row.id,
      task_id: Number(row.task_id),
      user_id: row.user_id,
      assignment_cycle: row.assignment_cycle == null ? null : Number(row.assignment_cycle),
      completion_note: row.completion_note || "",
      media_files: Array.isArray(media) ? media : [],
      media: Array.isArray(media) ? media : [],
      attachments: Array.isArray(media) ? media : [],
      voice_notes: Array.isArray(voice) ? voice : [],
      voice_note: primaryVoice,
      submitted_at: row.submitted_at || null,
      updated_at: row.updated_at || null,
      submitted_by: {
        id: row.user_id,
        name: row.completion_user_name || null,
        email: row.completion_user_email || null,
        role: row.completion_user_role || null,
        profile_pic: row.completion_user_profile_pic || null,
      },
    };
  });

  const assignedIds = assignedUsers.map((u) => String(u.user_id));
  const assignedNames = assignedUsers.map((u) => u.name || "");

  return {
    ...task,
    id: Number(task.id),
    user_id: assignedIds[0] || task.user_id || null,
    staff_name: assignedNames[0] || task.staff_name || null,
    assigned_user_ids: assignedIds,
    assigned_users: assignedUsers,
    assigned_staff_names: assignedNames,
    completion_reports: mappedCompletions,
    latest_completion: mappedCompletions[mappedCompletions.length - 1] || null,
    attachments: parseJson(task.file_url, []),
    media: parseJson(task.file_url, []),
  };
}

async function insertCompletion(task, body, files) {
  const completionColumns = await columns("task_completions");
  const taskColumns = await columns("tasks");
  const assignmentColumns = await columns("task_assignments");

  let userId = cleanId(pick(body, ["user_id", "userId"]));
  if (!userId) {
    const headerId = cleanId(body.__header_user_id);
    userId = headerId;
  }
  if (!userId) {
    try {
      const [rows] = await promiseDb.query(
        "SELECT user_id FROM task_assignments WHERE task_id = ? ORDER BY user_id ASC LIMIT 1",
        [task.id]
      );
      userId = rows[0]?.user_id ? cleanId(rows[0].user_id) : null;
    } catch {}
  }
  if (!userId) throw new Error("User ID is required to submit completion.");

  const assignmentCycle = Number(pick(body, ["assignment_cycle", "assignmentCycle"], task.assignment_cycle || 1)) || 1;
  const note = String(pick(body, ["completion_note", "note", "completionNote"], "") || "").trim();
  const media = storedFiles(files.files || []);
  const voiceFiles = [
    ...(files.voiceNotes || []),
    ...(files.voice_notes || []),
    ...(files.voiceNote || []),
  ];
  const voice = storedFiles(voiceFiles);
  const now = new Date();

  const payload = {
    task_id: task.id,
    user_id: userId,
    assignment_cycle: assignmentCycle,
    completion_note: note,
    media_files: JSON.stringify(media),
    voice_notes: JSON.stringify(voice),
    voice_note: voice[0]?.path || null,
    submitted_at: now,
    updated_at: now,
  };

  const insertColumns = Object.keys(payload).filter((key) => completionColumns.has(key));
  if (!insertColumns.includes("task_id") || !insertColumns.includes("user_id")) {
    throw new Error("task_completions schema is missing task_id/user_id.");
  }
  const placeholders = insertColumns.map(() => "?").join(",");
  const values = insertColumns.map((key) => payload[key]);

  const connection = await promiseDb.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO task_completions (${insertColumns.map((c) => `\`${c}\``).join(",")}) VALUES (${placeholders})`,
      values
    );

    const taskUpdates = {};
    if (taskColumns.has("status")) taskUpdates.status = "Completed";
    if (taskColumns.has("completed_at")) taskUpdates.completed_at = now;
    if (taskColumns.has("updated_at")) taskUpdates.updated_at = now;
    if (taskColumns.has("assignment_cycle")) taskUpdates.assignment_cycle = assignmentCycle;

    const taskUpdateKeys = Object.keys(taskUpdates);
    if (taskUpdateKeys.length) {
      await connection.query(
        `UPDATE tasks SET ${taskUpdateKeys.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ?`,
        [...taskUpdateKeys.map((key) => taskUpdates[key]), task.id]
      );
    }

    if (assignmentColumns.has("status")) {
      const assignmentUpdate = { status: "Completed" };
      if (assignmentColumns.has("completed_at")) assignmentUpdate.completed_at = now;
      if (assignmentColumns.has("updated_at")) assignmentUpdate.updated_at = now;
      const keys = Object.keys(assignmentUpdate);
      await connection.query(
        `UPDATE task_assignments SET ${keys.map((c) => `\`${c}\` = ?`).join(", ")} WHERE task_id = ? AND user_id = ?`,
        [...keys.map((key) => assignmentUpdate[key]), task.id, userId]
      );
    }

    await connection.commit();
    return { id: result.insertId, userId, assignmentCycle, note, media, voice, submittedAt: now };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function handleTask(req, res) {
  try {
    const task = await buildTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: "Task not found", taskId: req.params.id });
    return res.json({ success: true, task });
  } catch (error) {
    console.error("TASK COMPAT GET ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load task" });
  }
}

router.get("/single/:id", handleTask);
router.get("/:id", handleTask);

router.post("/complete-work/:id", completionUpload, async (req, res) => {
  try {
    const task = await resolveTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: "Task not found", taskId: req.params.id });

    req.body.__header_user_id = req.headers["x-user-id"] || req.headers["X-User-Id"] || "";
    const result = await insertCompletion(task, req.body || {}, req.files || {});
    const updatedTask = await buildTask(task.id);

    const io = req.app.get("io");
    if (io) {
      io.emit("taskCompleted", {
        taskId: task.id,
        userId: result.userId,
        status: "Completed",
        assignment_cycle: result.assignmentCycle,
      });
    }

    return res.status(201).json({
      success: true,
      msg: "Work completion report submitted successfully",
      taskId: task.id,
      task: updatedTask,
    });
  } catch (error) {
    console.error("TASK COMPAT COMPLETE ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to submit completion report" });
  }
});

module.exports = router;
