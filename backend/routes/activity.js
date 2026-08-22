const express = require("express");
const router = express.Router();
const db = require("../config/db");

const queryAsync = (sql, values = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (err, results) => {
      if (err) {
        console.error("❌ SQL QUERY ERROR:", err.sqlMessage || err.message);
        console.error("❌ FAILED SQL:", err.sql || sql);
        reject(err);
        return;
      }
      resolve(results);
    });
  });
};

const parseMedia = (fileUrl) => {
  try {
    if (!fileUrl) return [];
    if (Array.isArray(fileUrl)) return fileUrl;
    if (typeof fileUrl === "string" && fileUrl.trim().startsWith("[")) {
      const parsed = JSON.parse(fileUrl);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [{ path: fileUrl }];
  } catch (error) {
    console.error("❌ Media parse error:", error.message);
    return [];
  }
};

// ======================================================
// GET DASHBOARD STATS
// ======================================================
router.get("/stats", async (req, res) => {
  try {
    const { status, category } = req.query;

    // Keep dashboard staff count consistent with /api/user/all.
    // The previous query excluded superadmin and could disagree
    // with Staff Records. Active/inactive counts are also exposed.
    const countQuery = `
      SELECT
        (SELECT COUNT(*) FROM users) AS staffCount,
        (SELECT COUNT(*) FROM users WHERE LOWER(COALESCE(status, 'active')) = 'active') AS activeStaffCount,
        (SELECT COUNT(*) FROM users WHERE LOWER(COALESCE(status, 'active')) != 'active') AS inactiveStaffCount,
        (SELECT COUNT(*) FROM tasks) AS taskCount,
        (SELECT COUNT(*) FROM tasks WHERE status = 'Completed') AS completedCount,
        (SELECT COUNT(*) FROM tasks WHERE status = 'In Progress') AS inProgressCount,
        (SELECT COUNT(*) FROM tasks WHERE status = 'Pending') AS pendingCount,
        (SELECT COUNT(*) FROM tasks WHERE status = 'Rejected') AS rejectedCount
    `;

    let activityQuery = `
      SELECT
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.created_at,
        t.category,
        t.category_id,
        t.panel_id,
        t.file_url,
        IFNULL(t.rejection_reason, '') AS rejection_reason,
        u.name AS staff_name,
        u.profile_pic,
        u.employeeID AS staff_employee_id,
        ta.user_id,
        p.panel_code,
        p.panel_name,
        p.panel_type,
        p.area AS panel_area,
        p.location AS panel_location,
        p.status AS panel_status,
        p.status_reason AS panel_status_reason
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN panels p ON t.panel_id = p.id AND p.is_deleted = 0
    `;

    const conditions = [];
    const queryValues = [];

    if (status && status !== "All" && status !== "All Statuses") {
      conditions.push("t.status = ?");
      queryValues.push(status);
    }

    if (category && category !== "All" && category !== "All Categories") {
      conditions.push("t.category = ?");
      queryValues.push(category);
    }

    if (conditions.length) {
      activityQuery += " WHERE " + conditions.join(" AND ");
    }

    activityQuery += " ORDER BY t.created_at DESC, t.id DESC";

    const onDutyTodayQuery = `
      SELECT
        sd.id AS duty_id,
        sd.user_id,
        DATE_FORMAT(sd.duty_date, '%Y-%m-%d') AS duty_date,
        sd.shift_name,
        sd.start_time,
        sd.end_time,
        sd.status AS duty_status,
        sd.notes,
        u.name AS staff_name,
        u.email AS staff_email,
        u.role AS staff_role,
        u.phone AS staff_phone,
        u.employeeID AS employee_id,
        u.profile_pic
      FROM staff_duties sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE sd.duty_date = CURDATE() AND sd.status = 'on_duty'
      ORDER BY sd.start_time ASC, u.name ASC
    `;

    const panelsUnderWorkQuery = `
      SELECT
        p.id AS panel_id,
        p.panel_code,
        p.panel_name,
        p.panel_type,
        p.area,
        p.location,
        p.status AS panel_status,
        p.status_reason AS panel_status_reason,
        t.id AS task_id,
        t.title AS task_title,
        t.description AS task_description,
        t.priority AS task_priority,
        t.status AS task_status,
        t.created_at AS task_created_at,
        GROUP_CONCAT(DISTINCT u.id ORDER BY u.name ASC SEPARATOR ',') AS assigned_user_ids,
        GROUP_CONCAT(DISTINCT u.name ORDER BY u.name ASC SEPARATOR ', ') AS assigned_staff_names,
        GROUP_CONCAT(DISTINCT u.employeeID ORDER BY u.name ASC SEPARATOR ',') AS assigned_employee_ids
      FROM tasks t
      INNER JOIN panels p ON t.panel_id = p.id AND p.is_deleted = 0
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      WHERE t.status = 'In Progress' AND t.panel_id IS NOT NULL
      GROUP BY p.id, p.panel_code, p.panel_name, p.panel_type, p.area, p.location,
        p.status, p.status_reason, t.id, t.title, t.description, t.priority, t.status, t.created_at
      ORDER BY t.created_at DESC, t.id DESC
    `;

    const panelsOffQuery = `
      SELECT id AS panel_id, panel_code, panel_name, panel_type, area, location,
        status, status_reason, status_changed_at, off_started_at
      FROM panels
      WHERE status = 'off' AND is_deleted = 0
      ORDER BY status_changed_at DESC, panel_name ASC
    `;

    const panelsMaintenanceQuery = `
      SELECT id AS panel_id, panel_code, panel_name, panel_type, area, location,
        status, status_reason, status_changed_at, off_started_at,
        last_maintenance_date, next_maintenance_date
      FROM panels
      WHERE status = 'maintenance' AND is_deleted = 0
      ORDER BY status_changed_at DESC, panel_name ASC
    `;

    const [countResults, activityResults] = await Promise.all([
      queryAsync(countQuery),
      queryAsync(activityQuery, queryValues),
    ]);

    const operationalResults = await Promise.allSettled([
      queryAsync(onDutyTodayQuery),
      queryAsync(panelsUnderWorkQuery),
      queryAsync(panelsOffQuery),
      queryAsync(panelsMaintenanceQuery),
    ]);

    const onDutyResults = operationalResults[0].status === "fulfilled" ? operationalResults[0].value : [];
    const panelsUnderWorkResults = operationalResults[1].status === "fulfilled" ? operationalResults[1].value : [];
    const panelsOffResults = operationalResults[2].status === "fulfilled" ? operationalResults[2].value : [];
    const panelsMaintenanceResults = operationalResults[3].status === "fulfilled" ? operationalResults[3].value : [];

    const operationalNames = ["ON DUTY TODAY", "PANELS UNDER WORK", "PANELS OFF", "PANELS MAINTENANCE"];
    operationalResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`❌ ${operationalNames[index]} QUERY FAILED:`, result.reason?.sqlMessage || result.reason?.message || result.reason);
      }
    });

    const updatedActivities = (activityResults || []).map((activity) => ({
      ...activity,
      media: parseMedia(activity.file_url),
    }));

    const normalizedPanelsUnderWork = (panelsUnderWorkResults || []).map((item) => ({
      ...item,
      assigned_user_ids: item.assigned_user_ids ? String(item.assigned_user_ids).split(",").filter(Boolean) : [],
      assigned_staff_names: item.assigned_staff_names ? String(item.assigned_staff_names).split(", ").filter(Boolean) : [],
      assigned_employee_ids: item.assigned_employee_ids ? String(item.assigned_employee_ids).split(",").filter(Boolean) : [],
    }));

    const counts = countResults?.[0] || {};

    let serverDate = new Date().toISOString().slice(0, 10);
    try {
      const dateResults = await queryAsync(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`);
      if (dateResults?.[0]?.today) serverDate = dateResults[0].today;
    } catch (dateError) {
      console.error("⚠️ Server date query failed:", dateError.message);
    }

    return res.status(200).json({
      success: true,
      staffCount: Number(counts.staffCount || 0),
      activeStaffCount: Number(counts.activeStaffCount || 0),
      inactiveStaffCount: Number(counts.inactiveStaffCount || 0),
      taskCount: Number(counts.taskCount || 0),
      completedCount: Number(counts.completedCount || 0),
      inProgressCount: Number(counts.inProgressCount || 0),
      pendingCount: Number(counts.pendingCount || 0),
      rejectedCount: Number(counts.rejectedCount || 0),
      totalActivities: updatedActivities.length,
      activities: updatedActivities,
      onDutyToday: { count: onDutyResults.length, staff: onDutyResults },
      panelsUnderWork: { count: normalizedPanelsUnderWork.length, panels: normalizedPanelsUnderWork },
      panelsOff: { count: panelsOffResults.length, panels: panelsOffResults },
      panelsMaintenance: { count: panelsMaintenanceResults.length, panels: panelsMaintenanceResults },
      operationalSummary: {
        onDutyCount: onDutyResults.length,
        panelsUnderWorkCount: normalizedPanelsUnderWork.length,
        panelsOffCount: panelsOffResults.length,
        panelsMaintenanceCount: panelsMaintenanceResults.length,
      },
      serverDate,
    });
  } catch (error) {
    console.error("========================================");
    console.error("❌ DASHBOARD STATS FULL ERROR");
    console.error("Message:", error.sqlMessage || error.message || "Unknown error");
    if (error.sql) console.error("Failed SQL:", error.sql);
    console.error("========================================");
    return res.status(500).json({
      success: false,
      error: "Failed to load dashboard statistics",
      message: error.sqlMessage || error.message || "An unexpected database error occurred.",
    });
  }
});

// ======================================================
// PUBLIC DASHBOARD DATA
// ======================================================
router.get("/public-dashboard", async (req, res) => {
  try {
    const activitiesQuery = `
      SELECT
        t.*,
        ta.user_id,
        u.name AS staff_name,
        u.profile_pic,
        p.panel_code,
        p.panel_name,
        p.panel_type,
        p.area AS panel_area,
        p.location AS panel_location,
        p.status AS panel_status,
        p.status_reason AS panel_status_reason
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN panels p ON t.panel_id = p.id AND p.is_deleted = 0
      ORDER BY t.created_at DESC, t.id DESC
    `;

    const data = await queryAsync(activitiesQuery);
    const dateResults = await queryAsync(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`);
    const today = dateResults?.[0]?.today || new Date().toISOString().slice(0, 10);

    const todayData = (data || []).filter((item) => {
      if (!item.created_at) return false;
      return new Date(item.created_at).toISOString().slice(0, 10) === today;
    });

    const pending = (data || []).filter((item) => item.status !== "Completed");

    return res.status(200).json({
      success: true,
      today,
      todayComplaints: todayData,
      pendingComplaints: pending,
      all: data,
    });
  } catch (error) {
    console.error("❌ PUBLIC DASHBOARD ERROR:", error.sqlMessage || error.message || error);
    if (error.sql) console.error("Failed SQL:", error.sql);
    return res.status(500).json({
      success: false,
      error: "Failed to load public dashboard",
      message: error.sqlMessage || error.message || "An unexpected database error occurred.",
    });
  }
});

module.exports = router;