const express = require("express");
const db = require("../config/db");
const upload = require("../middleware/upload");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

const cleanId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

function list(...values) {
  return [...new Set(values.flatMap((value) => {
    if (value == null) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return [];
      try { const parsed = JSON.parse(text); return Array.isArray(parsed) ? parsed : [parsed]; } catch {}
      return text.includes(",") ? text.split(",") : [text];
    }
    return [value];
  }).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeUserIds(body = {}) {
  return list(body.user_ids, body["user_ids[]"], body.user_id)
    .map(cleanId)
    .filter(Boolean)
    .map(String);
}

function bodyValue(body, key, fallback) {
  return Object.prototype.hasOwnProperty.call(body || {}, key) ? body[key] : fallback;
}

async function emitUpdate(req, type, taskId, userIds = []) {
  const io = req.app?.get("io");
  if (!io) return;
  const payload = { type, taskId, task_id: taskId, userIds, user_ids: userIds };
  io.emit("updateData", payload);
  io.to("admins").emit("taskUpdate", payload);
  userIds.forEach((id) => io.to(`user_${id}`).emit("taskUpdate", payload));
}

router.put("/update-status/:id", async (req, res) => {
  const taskId = cleanId(req.params.id);
  const status = String(req.body?.status || "").trim();
  if (!taskId || !status) return res.status(400).json({ success: false, message: "Valid task ID and status are required" });

  const connection = await promiseDb.getConnection();
  try {
    await connection.beginTransaction();
    const [tasks] = await connection.query("SELECT * FROM tasks WHERE id = ? LIMIT 1", [taskId]);
    if (!tasks.length) { await connection.rollback(); return res.status(404).json({ success: false, message: "Task not found" }); }
    await connection.query("UPDATE tasks SET status = ? WHERE id = ?", [status, taskId]);
    try { await connection.query("UPDATE task_assignments SET status = ? WHERE task_id = ?", [status, taskId]); } catch (error) { console.warn("TASK CRUD assignment status sync skipped:", error.message); }
    await connection.commit();
    const [assignments] = await promiseDb.query("SELECT user_id FROM task_assignments WHERE task_id = ?", [taskId]).catch(() => [[]]);
    const userIds = (assignments || []).map((row) => String(row.user_id));
    await emitUpdate(req, "status", taskId, userIds);
    return res.json({ success: true, message: "Task status updated", taskId, status });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("TASK CRUD STATUS ERROR:", error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Failed to update task status" });
  } finally { connection.release(); }
});

router.put("/:id", upload.any(), async (req, res) => {
  const taskId = cleanId(req.params.id);
  if (!taskId) return res.status(400).json({ success: false, message: "Invalid task ID" });

  const connection = await promiseDb.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM tasks WHERE id = ? LIMIT 1", [taskId]);
    const existing = rows[0];
    if (!existing) { await connection.rollback(); return res.status(404).json({ success: false, message: "Task not found" }); }

    const next = {
      title: bodyValue(req.body, "title", existing.title),
      description: bodyValue(req.body, "description", existing.description),
      category: bodyValue(req.body, "category", existing.category),
      status: bodyValue(req.body, "status", existing.status),
      priority: bodyValue(req.body, "priority", existing.priority),
      panel_id: bodyValue(req.body, "panel_id", existing.panel_id),
    };
    const rawPanel = next.panel_id;
    next.panel_id = rawPanel === "" || rawPanel == null || String(rawPanel).toLowerCase() === "null" ? null : cleanId(rawPanel);

    const userIds = normalizeUserIds(req.body);
    const primaryUserId = userIds[0] || (existing.user_id == null ? null : String(existing.user_id));

    await connection.query(
      "UPDATE tasks SET title = ?, description = ?, category = ?, status = ?, priority = ?, panel_id = ?, user_id = ? WHERE id = ?",
      [next.title || "", next.description || "", next.category || "", next.status || "Pending", next.priority || "Medium", next.panel_id, primaryUserId, taskId]
    );

    if (userIds.length) {
      const placeholders = userIds.map(() => "?").join(",");
      const [valid] = await connection.query(`SELECT id FROM users WHERE id IN (${placeholders})`, userIds);
      const validIds = valid.map((row) => String(row.id));
      if (validIds.length !== userIds.length) throw new Error("One or more assigned users no longer exist");
      await connection.query("DELETE FROM task_assignments WHERE task_id = ?", [taskId]);
      const cycle = Number(existing.assignment_cycle || 1);
      for (const userId of validIds) {
        await connection.query("INSERT INTO task_assignments (task_id, user_id, status, assignment_cycle) VALUES (?, ?, ?, ?)", [taskId, userId, next.status || "Pending", cycle]);
      }
    }

    await connection.commit();
    await emitUpdate(req, "updated", taskId, userIds);
    return res.json({ success: true, message: "Task updated", taskId, user_id: primaryUserId, assigned_user_ids: userIds });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("TASK CRUD UPDATE ERROR:", error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Failed to update task" });
  } finally { connection.release(); }
});

router.delete("/:id", async (req, res) => {
  const taskId = cleanId(req.params.id);
  if (!taskId) return res.status(400).json({ success: false, message: "Invalid task ID" });

  const connection = await promiseDb.getConnection();
  try {
    await connection.beginTransaction();
    const [tasks] = await connection.query("SELECT id FROM tasks WHERE id = ? LIMIT 1", [taskId]);
    if (!tasks.length) { await connection.rollback(); return res.status(404).json({ success: false, message: "Task not found" }); }
    const [assignments] = await connection.query("SELECT user_id FROM task_assignments WHERE task_id = ?", [taskId]).catch(() => [[]]);
    const userIds = (assignments || []).map((row) => String(row.user_id));
    const tables = ["task_completions", "task_assignment_history", "task_assignments"];
    for (const table of tables) {
      try { await connection.query(`DELETE FROM ${table} WHERE task_id = ?`, [taskId]); }
      catch (error) { console.warn(`TASK CRUD cleanup skipped for ${table}:`, error.message); }
    }
    const [result] = await connection.query("DELETE FROM tasks WHERE id = ?", [taskId]);
    if (!result.affectedRows) throw new Error("Task was not deleted");
    await connection.commit();
    await emitUpdate(req, "deleted", taskId, userIds);
    return res.json({ success: true, message: "Task deleted", taskId });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("TASK CRUD DELETE ERROR:", error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Failed to delete task" });
  } finally { connection.release(); }
});

module.exports = router;
