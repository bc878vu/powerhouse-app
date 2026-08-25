const express = require("express");
const router = express.Router();
const db = require("../config/db");
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

const CACHE_TTL = 1500;
const cache = new Map();
const query = (sql, values = []) => promiseDb.query(sql, values).then(([rows]) => rows || []);

function parseFiles(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {}
  return [{ path: value }];
}

function mapHistory(rows) {
  const map = new Map();
  rows.forEach((item) => {
    const key = String(item.task_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      ...item,
      user_id: String(item.user_id),
      assignment_cycle: Number(item.assignment_cycle || 1),
    });
  });
  return map;
}

function applyTaskData(row, assignmentRows, historyMap, requestedUserId) {
  const assignedIds = assignmentRows.map((x) => String(x.user_id));
  const names = assignmentRows.map((x) => x.name || "");
  const histories = historyMap.get(String(row.id)) || [];
  const fallback = {
    user_id: String(requestedUserId),
    assignment_cycle: Number(row.assignment_cycle || 1),
    status: row.assignment_status || row.status || "Pending",
    assigned_at: row.assigned_at || row.created_at || null,
    accepted_at: row.accepted_at || null,
    completed_at: row.completed_at || null,
    rejected_at: row.rejected_at || null,
    rejection_reason: row.rejection_reason || "",
  };
  const assignmentHistory = histories.length ? histories : [fallback];
  const current = assignmentHistory[assignmentHistory.length - 1] || fallback;
  return {
    ...row,
    id: Number(row.id),
    user_id: String(row.user_id || requestedUserId),
    user_ids: assignedIds,
    assigned_user_ids: assignedIds,
    assigned_staff_names: names,
    assigned_users: assignmentRows.map((x) => ({
      user_id: String(x.user_id),
      id: String(x.user_id),
      name: x.name || null,
      email: x.email || null,
      role: x.role || null,
    })),
    staff_name: names[0] || row.staff_name || null,
    assignment_status: row.assignment_status || row.status || "Pending",
    status: row.assignment_status || row.status || "Pending",
    assignment_cycle: Number(current.assignment_cycle || row.assignment_cycle || 1),
    assignment_count: Math.max(1, assignmentHistory.length),
    current_assignment: current,
    assignment_history: assignmentHistory,
    attachments: parseFiles(row.file_url),
    media: parseFiles(row.file_url),
    files: parseFiles(row.file_url),
  };
}

router.get("/my-tasks/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ success: false, message: "Valid user ID is required" });

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return res.json(cached.data);

  try {
    // Fast path: use the indexed assignment table to find only this user's tasks.
    const taskRows = await query(`
      SELECT
        t.*,
        ta.user_id AS assignment_user_id,
        ta.status AS assignment_status,
        ta.accepted_at,
        ta.completed_at,
        ta.rejected_at,
        ta.rejection_reason,
        ta.assignment_cycle,
        ta.assigned_at
      FROM task_assignments ta
      INNER JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = ?
      ORDER BY COALESCE(ta.assigned_at, t.created_at) DESC, t.id DESC
      LIMIT 100
    `, [userId]);

    if (!taskRows.length) {
      const empty = [];
      cache.set(userId, { at: Date.now(), data: empty });
      return res.json(empty);
    }

    const taskIds = taskRows.map((row) => Number(row.id)).filter(Number.isInteger);
    const placeholders = taskIds.map(() => "?").join(",");

    // Only fetch assignments/history for the tasks already found above.
    const [assignmentRows, historyRows] = await Promise.all([
      query(`
        SELECT ta.task_id, ta.user_id, u.name, u.email, u.role
        FROM task_assignments ta
        LEFT JOIN users u ON u.id = ta.user_id
        WHERE ta.task_id IN (${placeholders})
        ORDER BY ta.task_id ASC, ta.user_id ASC
      `, taskIds),
      query(`
        SELECT h.task_id,h.user_id,h.assignment_cycle,h.status,h.assigned_at,h.accepted_at,h.completed_at,h.rejected_at,h.rejection_reason
        FROM task_assignment_history h
        WHERE h.user_id = ? AND h.task_id IN (${placeholders})
        ORDER BY h.task_id ASC,h.assignment_cycle ASC,h.id ASC
      `, [userId, ...taskIds]),
    ]);

    const assignmentsByTask = new Map();
    assignmentRows.forEach((item) => {
      const key = String(item.task_id);
      if (!assignmentsByTask.has(key)) assignmentsByTask.set(key, []);
      assignmentsByTask.get(key).push(item);
    });
    const historyByTask = mapHistory(historyRows);

    const result = taskRows.map((row) => applyTaskData(
      row,
      assignmentsByTask.get(String(row.id)) || [{ user_id: row.assignment_user_id, name: row.staff_name || "", email: null, role: null }],
      historyByTask,
      userId,
    ));

    cache.set(userId, { at: Date.now(), data: result });
    return res.json(result);
  } catch (error) {
    console.error("FAST USER TASKS ERROR:", error.sqlMessage || error.message || error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Failed to load tasks" });
  }
});

router.post("/invalidate", (req, res) => {
  cache.clear();
  res.json({ success: true });
});

module.exports = router;
