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
    .sort(
      (a, b) =>
        Number(b.assignment_cycle || 0) - Number(a.assignment_cycle || 0) ||
        new Date(b.assigned_at || 0) - new Date(a.assigned_at || 0) ||
        Number(b.id || 0) - Number(a.id || 0)
    )[0] || null;
}

function statusRank(status) {
  const s = String(status || "Pending")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");

  if (["pending", "new", "assigned"].includes(s)) return 0;
  if (["in progress", "running"].includes(s)) return 1;
  if (s === "rejected") return 2;
  if (s === "completed") return 3;
  return 2;
}

function priorityRank(priority) {
  const p = String(priority || "Medium").trim().toLowerCase();
  if (["critical", "urgent"].includes(p)) return 0;
  if (p === "high") return 1;
  if (["medium", "normal"].includes(p)) return 2;
  if (p === "low") return 3;
  return 2;
}

function byTaskId(rows) {
  return (rows || []).reduce((map, row) => {
    const key = Number(row.task_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map());
}

function uniqueByUserId(rows) {
  const seen = new Set();
  const result = [];

  for (const row of rows || []) {
    const id = cleanId(row?.user_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ ...row, user_id: id });
  }

  return result;
}

// Canonical assignee source for task detail:
// 1) current task_assignments rows
// 2) latest assignment-history users
// 3) legacy tasks.user_id
// This prevents a valid assignment from rendering as "Unassigned" when an
// older migration/flow left task_assignments empty but preserved the assignment.
async function resolveAssignees(task, assignmentRows, historyRows) {
  const direct = uniqueByUserId(assignmentRows || []);
  if (direct.length) return direct;

  const historical = uniqueByUserId(
    (historyRows || []).map((row) => ({
      ...row,
      name: row.user_name || row.name || null,
      email: row.user_email || row.email || null,
      role: row.user_role || row.role || null,
      profile_pic: row.user_profile_pic || row.profile_pic || null,
    }))
  );

  if (historical.length) {
    return historical.map((row) => ({
      ...row,
      assignment_status: row.status || "Pending",
      assignment_cycle: Number(row.assignment_cycle || 1),
    }));
  }

  const legacyId = cleanId(
    task?.user_id || task?.assigned_user_id || task?.assignedTo
  );

  if (!legacyId) return [];

  try {
    const [rows] = await promiseDb.query(
      `SELECT id AS user_id, name, email, role, profile_pic
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [legacyId]
    );

    if (rows?.length) {
      return rows.map((row) => ({
        ...row,
        user_id: Number(row.user_id),
        assignment_status: task?.status || "Pending",
        assignment_cycle: Number(task?.assignment_cycle || 1),
      }));
    }
  } catch (error) {
    console.warn("TASK ASSIGNEE LEGACY LOOKUP SKIPPED:", error.message);
  }

  return [
    {
      user_id: legacyId,
      name: task?.staff_name || task?.assigned_to || null,
      email: null,
      role: null,
      profile_pic: null,
      assignment_status: task?.status || "Pending",
      assignment_cycle: Number(task?.assignment_cycle || 1),
    },
  ];
}

async function buildTaskPayload(task, assignmentRows, historyRows, completionRows) {
  const assignments = await resolveAssignees(task, assignmentRows, historyRows);
  const history = historyRows || [];
  const completions = completionRows || [];
  const latestAssignment = history[0] || assignments[0] || null;
  const latestCompletion = completions[0] || null;

  const assignedIds = assignments.map((item) => String(item.user_id));
  const assignedNames = assignments.map((item) => item.name || item.user_name || "");
  const assignedEmails = assignments.map((item) => item.email || item.user_email || "");
  const assignedRoles = assignments.map((item) => item.role || item.user_role || "");

  const assignmentUser = latestAssignment?.user_name
    ? {
        id: Number(latestAssignment.user_id),
        name: latestAssignment.user_name || null,
        email: latestAssignment.user_email || null,
        role: latestAssignment.user_role || null,
        profile_pic: latestAssignment.user_profile_pic || null,
      }
    : null;

  const currentUser = assignmentUser ||
    (assignments[0]
      ? {
          id: Number(assignments[0].user_id),
          name: assignments[0].name || null,
          email: assignments[0].email || null,
          role: assignments[0].role || null,
          profile_pic: assignments[0].profile_pic || null,
        }
      : null);

  const hasCompletion = completions.length > 0;
  const taskStatus = hasCompletion ? "Completed" : task?.status || "Pending";

  return {
    ...task,
    id: Number(task.id),
    task_id: Number(task.id),
    display_task_id: `#${Number(task.id)}`,

    user_id: assignedIds[0] || (task.user_id ? String(task.user_id) : null),
    user_ids: assignedIds,
    assigned_user_ids: assignedIds,
    assigned_users: assignments.map((item) => ({
      ...item,
      id: Number(item.user_id),
      user_id: Number(item.user_id),
      name: item.name || item.user_name || null,
      email: item.email || item.user_email || null,
      role: item.role || item.user_role || null,
      profile_pic: item.profile_pic || item.user_profile_pic || null,
    })),
    assigned_staff_names: assignedNames,
    assigned_staff_emails: assignedEmails,
    assigned_staff_roles: assignedRoles,
    staff_name:
      assignedNames[0] ||
      task.staff_name ||
      task.assigned_to ||
      null,
    assigned_to:
      assignedNames.filter(Boolean).join(", ") ||
      task.assigned_to ||
      null,
    assigned_user_id:
      assignedIds[0] ||
      (task.user_id ? String(task.user_id) : null),

    status: taskStatus,
    assignment_history: history,
    latest_assignment: latestAssignment,
    current_assignment: latestAssignment,
    assignment_cycle: Number(latestAssignment?.assignment_cycle || task.assignment_cycle || 1),
    assignment_count:
      new Set(
        history.map((item) => Number(item.assignment_cycle || 1)).filter(Boolean)
      ).size || 1,
    repeat_count:
      Math.max(
        (new Set(
          history.map((item) => Number(item.assignment_cycle || 1)).filter(Boolean)
        ).size || 1) - 1,
        0
      ),

    completion_reports: completions,
    latest_completion: latestCompletion,
    has_completion_report: hasCompletion,
    complete_work_status: hasCompletion ? "SUBMITTED" : "NOT SUBMITTED",
    completion_status: hasCompletion ? "COMPLETED" : task?.completion_status || taskStatus,
  };
}

// Canonical task-detail read. Admin report and user screens now resolve
// assignees from assignment rows, history, or legacy task.user_id without
// changing the existing UI/layout.
router.get("/:id", async (req, res, next) => {
  const taskId = cleanId(req.params.id);
  if (!taskId) return next();

  try {
    const [[taskRows], [assignmentRows], [historyRows], [completionRows]] =
      await Promise.all([
        promiseDb.query("SELECT * FROM tasks WHERE id = ? LIMIT 1", [taskId]),
        promiseDb.query(
          `SELECT ta.*, u.name AS user_name, u.email AS user_email,
                  u.role AS user_role, u.profile_pic AS user_profile_pic
           FROM task_assignments ta
           LEFT JOIN users u ON u.id = ta.user_id
           WHERE ta.task_id = ?
           ORDER BY ta.id DESC`,
          [taskId]
        ),
        promiseDb.query(
          `SELECT h.*, u.name AS user_name, u.email AS user_email,
                  u.role AS user_role, u.profile_pic AS user_profile_pic
           FROM task_assignment_history h
           LEFT JOIN users u ON u.id = h.user_id
           WHERE h.task_id = ?
           ORDER BY h.assignment_cycle DESC, h.assigned_at DESC, h.id DESC`,
          [taskId]
        ),
        promiseDb.query(
          `SELECT tc.*, u.name AS completion_user_name,
                  u.email AS completion_user_email,
                  u.role AS completion_user_role,
                  u.profile_pic AS completion_user_profile_pic
           FROM task_completions tc
           LEFT JOIN users u ON u.id = tc.user_id
           WHERE tc.task_id = ?
           ORDER BY tc.submitted_at DESC, tc.updated_at DESC, tc.id DESC`,
          [taskId]
        ),
      ]);

    const task = taskRows?.[0];
    if (!task) return next();

    const taskPayload = await buildTaskPayload(
      task,
      assignmentRows,
      historyRows,
      completionRows
    );

    return res.json({ success: true, task: taskPayload });
  } catch (error) {
    console.error("CANONICAL TASK DETAIL ERROR:", error);
    return next(error);
  }
});

router.get("/my-tasks/:userId", async (req, res, next) => {
  const userId = cleanId(req.params.userId);
  if (!userId) {
    return res.status(400).json({
      success: false,
      msg: "Invalid user ID",
    });
  }

  try {
    const [rows] = await promiseDb.query(
      `
        SELECT DISTINCT t.*,
          p.id AS panel_join_id,
          p.panel_code,
          p.panel_name,
          p.panel_type,
          p.area AS panel_area,
          p.location AS panel_location
        FROM tasks t
        LEFT JOIN task_assignments ta
          ON ta.task_id = t.id
        LEFT JOIN task_assignment_history th
          ON th.task_id = t.id
         AND th.user_id = ?
        LEFT JOIN panels p
          ON t.panel_id = p.id
         AND p.is_deleted = 0
        WHERE ta.user_id = ?
           OR th.user_id IS NOT NULL
           OR t.user_id = ?
        ORDER BY t.id DESC
      `,
      [userId, userId, userId]
    );

    if (!rows?.length) return res.json([]);

    const ids = rows
      .map((row) => Number(row.id))
      .filter(Number.isInteger);
    const placeholders = ids.map(() => "?").join(",");

    const [[assignmentRows], [historyRows], [completionRows]] =
      await Promise.all([
        promiseDb.query(
          `SELECT ta.task_id, ta.user_id, u.name, u.email, u.role, u.profile_pic,
                  ta.status AS assignment_status,
                  ta.accepted_at, ta.completed_at, ta.rejected_at,
                  ta.rejection_reason, ta.assignment_cycle, ta.assigned_at
           FROM task_assignments ta
           LEFT JOIN users u ON u.id = ta.user_id
           WHERE ta.task_id IN (${placeholders})
           ORDER BY ta.task_id ASC, ta.user_id ASC, ta.id DESC`,
          ids
        ),
        promiseDb.query(
          `SELECT h.*, u.name AS user_name, u.email AS user_email,
                  u.role AS user_role, u.profile_pic AS user_profile_pic
           FROM task_assignment_history h
           LEFT JOIN users u ON u.id = h.user_id
           WHERE h.task_id IN (${placeholders})
           ORDER BY h.task_id ASC, h.assignment_cycle DESC, h.assigned_at DESC, h.id DESC`,
          ids
        ),
        promiseDb.query(
          `SELECT tc.id, tc.task_id, tc.user_id, tc.assignment_cycle,
                  tc.completion_note, tc.submitted_at, tc.updated_at
           FROM task_completions tc
           WHERE tc.task_id IN (${placeholders})
           ORDER BY tc.task_id ASC, tc.submitted_at DESC, tc.updated_at DESC, tc.id DESC`,
          ids
        ),
      ]);

    const assignmentsByTask = byTaskId(assignmentRows);
    const historyByTask = byTaskId(historyRows);
    const completionsByTask = byTaskId(completionRows);

    const tasks = await Promise.all(
      rows.map(async (row) => {
        const taskId = Number(row.id);
        const assignments = assignmentsByTask.get(taskId) || [];
        const history = historyByTask.get(taskId) || [];
        const completions = completionsByTask.get(taskId) || [];

        const current = latestForUser(history, userId);
        const assignmentFallback = assignments.find(
          (item) => Number(item.user_id) === userId
        );

        const status =
          current?.status ||
          assignmentFallback?.assignment_status ||
          row.status ||
          "Pending";

        const assignedAt =
          current?.assigned_at ||
          assignmentFallback?.assigned_at ||
          row.created_at ||
          null;

        const userCycles = new Set(
          history
            .filter((item) => Number(item.user_id) === userId)
            .map((item) => Number(item.assignment_cycle || 1))
        );

        const title =
          row.title ||
          row.task_title ||
          row.name ||
          "Untitled Task";
        const label = `#${Number(row.id)}`;

        return {
          ...row,
          id: taskId,
          title: String(title).startsWith(label)
            ? title
            : `${label} · ${title}`,
          task_id: taskId,
          display_task_id: label,
          status,
          assigned_at: assignedAt,
          accepted_at: current?.accepted_at || assignmentFallback?.accepted_at || null,
          completed_at:
            current?.completed_at ||
            assignmentFallback?.completed_at ||
            row.completed_at ||
            null,
          rejected_at:
            current?.rejected_at ||
            assignmentFallback?.rejected_at ||
            row.rejected_at ||
            null,
          rejection_reason:
            current?.rejection_reason ||
            assignmentFallback?.rejection_reason ||
            null,
          due_at: current?.due_at || row.due_at || null,
          assignment_cycle: Number(
            current?.assignment_cycle ||
            assignmentFallback?.assignment_cycle ||
            row.assignment_cycle ||
            1
          ),
          assignment_count: userCycles.size || 1,
          repeat_count: Math.max(userCycles.size - 1, 0),
          assignment_history: history,
          current_assignment: current || assignmentFallback || null,
          completion_reports: completions,
          latest_completion: completions[0] || null,
          has_completion_report: completions.length > 0,
          assigned_user_ids:
            assignments.length > 0
              ? assignments.map((item) => String(item.user_id))
              : [String(userId)],
          user_ids:
            assignments.length > 0
              ? assignments.map((item) => String(item.user_id))
              : [String(userId)],
          assigned_users:
            assignments.length > 0
              ? assignments.map((item) => ({
                  id: Number(item.user_id),
                  user_id: Number(item.user_id),
                  name: item.name || null,
                  email: item.email || null,
                  role: item.role || null,
                  profile_pic: item.profile_pic || null,
                }))
              : [
                  {
                    id: userId,
                    user_id: userId,
                    name: null,
                    email: null,
                    role: null,
                    profile_pic: null,
                  },
                ],
          staff_name:
            assignmentFallback?.name ||
            row.staff_name ||
            null,
          _sortStatusRank: statusRank(status),
          _sortPriorityRank: priorityRank(row.priority || current?.priority),
          _sortDate: new Date(
            assignedAt || row.updated_at || row.created_at || 0
          ).getTime(),
        };
      })
    );

    tasks.sort(
      (a, b) =>
        a._sortStatusRank - b._sortStatusRank ||
        a._sortPriorityRank - b._sortPriorityRank ||
        b._sortDate - a._sortDate ||
        Number(b.id) - Number(a.id)
    );

    tasks.forEach((task) => {
      delete task._sortStatusRank;
      delete task._sortPriorityRank;
      delete task._sortDate;
    });

    return res.json(tasks);
  } catch (error) {
    console.error("TASK MY-TASKS OVERRIDE ERROR:", error);
    return next(error);
  }
});

// Preserve the existing fast status guard, but hydrate the returned task with
// assignment fields so the UI never receives a status-only object after an update.
router.put("/update-status/:id", async (req, res, next) => {
  if (
    String(req.body?.status || "")
      .trim()
      .toLowerCase() !== "in progress"
  ) {
    return next();
  }

  const taskId = cleanId(req.params.id);
  const userId = cleanId(req.body?.user_id);
  if (!taskId || !userId) return next();

  try {
    const [rows] = await promiseDb.query(
      `SELECT status, assignment_cycle, accepted_at, completed_at, rejected_at
       FROM task_assignment_history
       WHERE task_id = ?
         AND user_id = ?
       ORDER BY assignment_cycle DESC, assigned_at DESC, id DESC
       LIMIT 1`,
      [taskId, userId]
    );

    const current = rows?.[0];
    if (!current || current.status === "Pending") return next();

    if (["In Progress", "Completed"].includes(current.status)) {
      const [taskRows] = await promiseDb.query(
        "SELECT * FROM tasks WHERE id = ? LIMIT 1",
        [taskId]
      );

      if (!taskRows?.length) return next();

      const [assignmentRows] = await promiseDb.query(
        `SELECT ta.user_id, u.name, u.email, u.role, u.profile_pic
         FROM task_assignments ta
         LEFT JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id = ?
         ORDER BY ta.id DESC`,
        [taskId]
      );

      const [historyRows] = await promiseDb.query(
        `SELECT h.*, u.name AS user_name, u.email AS user_email,
                u.role AS user_role, u.profile_pic AS user_profile_pic
         FROM task_assignment_history h
         LEFT JOIN users u ON u.id = h.user_id
         WHERE h.task_id = ?
         ORDER BY h.assignment_cycle DESC, h.assigned_at DESC, h.id DESC`,
        [taskId]
      );

      const task = await buildTaskPayload(
        taskRows[0],
        assignmentRows,
        historyRows,
        []
      );

      return res.json({
        success: true,
        msg:
          current.status === "Completed"
            ? "Task is already completed"
            : "Task is already accepted",
        status: current.status,
        overall_status: current.status,
        task: {
          ...task,
          status: current.status,
          assignment_cycle: Number(current.assignment_cycle || task.assignment_cycle || 1),
          accepted_at: current.accepted_at || task.accepted_at || null,
          completed_at: current.completed_at || task.completed_at || null,
          rejected_at: current.rejected_at || task.rejected_at || null,
        },
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
