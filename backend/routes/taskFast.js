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

function cleanTask(row) {
  const assignedIds = row.assigned_user_ids
    ? String(row.assigned_user_ids).split(",").filter(Boolean)
    : [];
  const names = row.assigned_staff_names
    ? String(row.assigned_staff_names).split("||").filter(Boolean)
    : [];
  const emails = row.assigned_staff_emails
    ? String(row.assigned_staff_emails).split("||").filter(Boolean)
    : [];
  const roles = row.assigned_staff_roles
    ? String(row.assigned_staff_roles).split("||").filter(Boolean)
    : [];

  return {
    ...row,
    id: Number(row.id),
    user_id: row.assignment_user_id ? String(row.assignment_user_id) : (assignedIds[0] || null),
    assigned_user_ids: assignedIds,
    user_ids: assignedIds,
    assigned_staff_names: names,
    assigned_users: assignedIds.map((id, index) => ({
      user_id: id,
      id,
      name: names[index] || null,
      email: emails[index] || null,
      role: roles[index] || null,
    })),
    staff_name: names[0] || row.staff_name || null,
    assignment_cycle: Number(row.assignment_cycle || 1),
    assignment_count: Number(row.assignment_count || row.assignment_cycle || 1),
    assignment_status: row.assignment_status || row.status || "Pending",
    status: row.assignment_status || row.status || "Pending",
    attachments: parseFiles(row.file_url),
    media: parseFiles(row.file_url),
    files: parseFiles(row.file_url),
    assignment_history: [],
  };
}

router.get("/my-tasks/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ success: false, message: "Valid user ID is required" });

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return res.json(cached.data);

  try {
    // One indexed assignment lookup + one task join. No full staff scan and no
    // expensive task-by-task queries are needed for the user dashboard.
    const rows = await query(`
      SELECT
        t.*,
        ta.user_id AS assignment_user_id,
        ta.status AS assignment_status,
        ta.accepted_at,
        ta.completed_at,
        ta.rejected_at,
        ta.rejection_reason,
        ta.assignment_cycle,
        ta.assigned_at,
        assigned.assigned_user_ids,
        assigned.assigned_staff_names,
        assigned.assigned_staff_emails,
        assigned.assigned_staff_roles
      FROM task_assignments ta
      INNER JOIN tasks t ON t.id = ta.task_id
      LEFT JOIN (
        SELECT
          x.task_id,
          GROUP_CONCAT(x.user_id ORDER BY x.user_id SEPARATOR ',') AS assigned_user_ids,
          GROUP_CONCAT(COALESCE(u.name, '') ORDER BY x.user_id SEPARATOR '||') AS assigned_staff_names,
          GROUP_CONCAT(COALESCE(u.email, '') ORDER BY x.user_id SEPARATOR '||') AS assigned_staff_emails,
          GROUP_CONCAT(COALESCE(u.role, '') ORDER BY x.user_id SEPARATOR '||') AS assigned_staff_roles
        FROM task_assignments x
        LEFT JOIN users u ON u.id = x.user_id
        GROUP BY x.task_id
      ) assigned ON assigned.task_id = t.id
      WHERE CAST(ta.user_id AS CHAR) = ?
      ORDER BY COALESCE(ta.assigned_at, t.created_at) DESC, t.id DESC
      LIMIT 100
    `, [userId]);

    if (!rows.length) {
      const empty = [];
      cache.set(userId, { at: Date.now(), data: empty });
      return res.json(empty);
    }

    const taskIds = rows.map((row) => Number(row.id)).filter(Number.isInteger);
    const placeholders = taskIds.map(() => "?").join(",");
    const historyRows = placeholders
      ? await query(`
          SELECT
            h.task_id,
            h.user_id,
            h.assignment_cycle,
            h.status,
            h.assigned_at,
            h.accepted_at,
            h.completed_at,
            h.rejected_at,
            h.rejection_reason
          FROM task_assignment_history h
          WHERE h.user_id = ? AND h.task_id IN (${placeholders})
          ORDER BY h.task_id ASC, h.assignment_cycle ASC, h.id ASC
        `, [userId, ...taskIds])
      : [];

    const historyMap = new Map();
    historyRows.forEach((item) => {
      const key = String(item.task_id);
      if (!historyMap.has(key)) historyMap.set(key, []);
      historyMap.get(key).push({
        ...item,
        user_id: String(item.user_id),
        assignment_cycle: Number(item.assignment_cycle || 1),
      });
    });

    const result = rows.map((row) => {
      const task = cleanTask(row);
      task.assignment_history = historyMap.get(String(row.id)) || [{
        user_id: String(userId),
        assignment_cycle: Number(row.assignment_cycle || 1),
        status: row.assignment_status || row.status || "Pending",
        assigned_at: row.assigned_at || row.created_at || null,
        accepted_at: row.accepted_at || null,
        completed_at: row.completed_at || null,
        rejected_at: row.rejected_at || null,
        rejection_reason: row.rejection_reason || "",
      }];
      task.current_assignment = task.assignment_history[task.assignment_history.length - 1];
      return task;
    });

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
