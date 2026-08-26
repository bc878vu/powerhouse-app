const express = require("express");
const db = require("../config/db");

const router = express.Router();
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

function cleanId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function latestForUser(history, userId) {
  return (history || [])
    .filter((row) => Number(row.user_id) === Number(userId))
    .sort((a, b) => {
      const cycle = Number(b.assignment_cycle || 0) - Number(a.assignment_cycle || 0);
      if (cycle) return cycle;
      const assigned = new Date(b.assigned_at || 0).getTime() - new Date(a.assigned_at || 0).getTime();
      if (assigned) return assigned;
      return Number(b.id || 0) - Number(a.id || 0);
    })[0] || null;
}

function statusRank(status) {
  const s = String(status || "Pending").trim().toLowerCase();
  if (s === "completed") return 2;
  if (s === "rejected") return 1;
  return 0;
}

router.get("/my-tasks/:userId", async (req, res, next) => {
  const userId = cleanId(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, msg: "Invalid user ID" });

  try {
    const [rows] = await promiseDb.query(`
      SELECT t.*,
             p.id AS panel_join_id,
             p.panel_code,
             p.panel_name,
             p.panel_type,
             p.area AS panel_area,
             p.location AS panel_location
      FROM tasks t
      INNER JOIN task_assignments ta
        ON ta.task_id = t.id AND ta.user_id = ?
      LEFT JOIN panels p
        ON t.panel_id = p.id AND p.is_deleted = 0
    `, [userId]);

    const tasks = await Promise.all((rows || []).map(async (row) => {
      const [historyRows, completionRows] = await Promise.all([
        promiseDb.query(`
          SELECT h.*, u.name AS user_name, u.email AS user_email, u.role AS user_role, u.profile_pic AS user_profile_pic
          FROM task_assignment_history h
          LEFT JOIN users u ON u.id = h.user_id
          WHERE h.task_id = ?
          ORDER BY h.assignment_cycle DESC, h.assigned_at DESC, h.id DESC
        `, [row.id]).then(([r]) => r || []),
        promiseDb.query(`
          SELECT tc.id, tc.task_id, tc.user_id, tc.assignment_cycle, tc.completion_note, tc.submitted_at, tc.updated_at
          FROM task_completions tc
          WHERE tc.task_id = ?
          ORDER BY tc.submitted_at DESC, tc.id DESC
        `, [row.id]).then(([r]) => r || []),
      ]);

      const current = latestForUser(historyRows, userId);
      const status = current?.status || row.status || "Pending";
      const assignedAt = current?.assigned_at || row.created_at || null;
      const completedAt = current?.completed_at || row.completed_at || null;
      const rejectedAt = current?.rejected_at || row.rejected_at || null;
      const userCycles = new Set(historyRows.filter((h) => Number(h.user_id) === userId).map((h) => Number(h.assignment_cycle || 1)));

      return {
        ...row,
        id: Number(row.id),
        panel: row.panel_join_id ? {
          id: Number(row.panel_join_id),
          panel_code: row.panel_code || null,
          panel_name: row.panel_name || null,
          panel_type: row.panel_type || null,
          area: row.panel_area || null,
          location: row.panel_location || null,
        } : null,
        status,
        assigned_at: assignedAt,
        accepted_at: current?.accepted_at || null,
        completed_at: completedAt,
        rejected_at: rejectedAt,
        rejection_reason: current?.rejection_reason || null,
        due_at: current?.due_at || row.due_at || null,
        assignment_cycle: Number(current?.assignment_cycle || 1),
        assignment_count: userCycles.size || 1,
        repeat_count: Math.max(userCycles.size - 1, 0),
        assignment_history: historyRows,
        current_assignment: current,
        completion_reports: completionRows,
        latest_completion: completionRows[0] || null,
        has_completion_report: completionRows.length > 0,
        _sortStatusRank: statusRank(status),
        _sortDate: new Date(completedAt || rejectedAt || assignedAt || row.updated_at || row.created_at || 0).getTime(),
      };
    }));

    tasks.sort((a, b) =>
      a._sortStatusRank - b._sortStatusRank ||
      b._sortDate - a._sortDate ||
      Number(b.id) - Number(a.id)
    );

    tasks.forEach((task) => {
      delete task._sortStatusRank;
      delete task._sortDate;
    });

    return res.json(tasks);
  } catch (error) {
    console.error("TASK MY-TASKS OVERRIDE ERROR:", error);
    return next(error);
  }
});

router.put("/update-status/:id", async (req, res, next) => {
  if (String(req.body?.status || "").trim().toLowerCase() !== "in progress") return next();
  const taskId = cleanId(req.params.id);
  const userId = cleanId(req.body?.user_id);
  if (!taskId || !userId) return next();

  try {
    const [rows] = await promiseDb.query(`
      SELECT status, assignment_cycle, accepted_at, completed_at, rejected_at
      FROM task_assignment_history
      WHERE task_id = ? AND user_id = ?
      ORDER BY assignment_cycle DESC, assigned_at DESC, id DESC
      LIMIT 1
    `, [taskId, userId]);
    const current = rows?.[0];
    if (!current || current.status === "Pending") return next();

    if (current.status === "In Progress" || current.status === "Completed") {
      const [taskRows] = await promiseDb.query("SELECT * FROM tasks WHERE id = ? LIMIT 1", [taskId]);
      return res.json({
        success: true,
        msg: current.status === "Completed" ? "Task is already completed" : "Task is already accepted",
        status: current.status,
        overall_status: current.status,
        task: {
          ...(taskRows?.[0] || {}),
          id: taskId,
          status: current.status,
          assignment_cycle: Number(current.assignment_cycle || 1),
          accepted_at: current.accepted_at || null,
          completed_at: current.completed_at || null,
          rejected_at: current.rejected_at || null,
        },
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
