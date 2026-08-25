const express = require("express");
const router = express.Router();
const db = require("../config/db");
const promiseDb = db.promiseDb ? db.promiseDb : db.promise();

const CACHE_TTL = 1500;
let cached = null;
let cachedAt = 0;
let inFlight = null;

const query = (sql, values = []) => promiseDb.query(sql, values).then(([rows]) => rows || []);

function parseMedia(fileUrl) {
  if (!fileUrl) return [];
  if (Array.isArray(fileUrl)) return fileUrl;
  if (typeof fileUrl !== "string") return [];
  try {
    const parsed = JSON.parse(fileUrl);
    return Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  } catch {
    return [{ path: fileUrl }];
  }
}

function buildActivities(rows) {
  return rows.map((activity) => {
    const ids = activity.assigned_user_ids ? String(activity.assigned_user_ids).split(",").filter(Boolean) : [];
    const names = activity.assigned_staff_names ? String(activity.assigned_staff_names).split("||").filter(Boolean) : [];
    const emails = activity.assigned_staff_emails ? String(activity.assigned_staff_emails).split("||").filter(Boolean) : [];
    const roles = activity.assigned_staff_roles ? String(activity.assigned_staff_roles).split("||").filter(Boolean) : [];
    const employeeIds = activity.assigned_employee_ids ? String(activity.assigned_employee_ids).split("||").filter(Boolean) : [];
    return {
      ...activity,
      id: Number(activity.id),
      user_id: ids[0] || activity.user_id || null,
      staff_name: names[0] || activity.staff_name || null,
      profile_pic: activity.profile_pic || null,
      assigned_user_ids: ids,
      assigned_staff_names: names,
      assigned_staff_emails: emails,
      assigned_staff_roles: roles,
      assigned_employee_ids: employeeIds,
      assigned_users: ids.map((id, index) => ({ user_id: id, id, name: names[index] || null, email: emails[index] || null, role: roles[index] || null, employee_id: employeeIds[index] || null })),
      media: parseMedia(activity.file_url),
    };
  });
}

async function loadStats() {
  const staffCountQuery = `SELECT COUNT(*) AS staffCount, SUM(CASE WHEN LOWER(COALESCE(status,'active'))='active' THEN 1 ELSE 0 END) AS activeStaffCount, SUM(CASE WHEN LOWER(COALESCE(status,'active'))!='active' THEN 1 ELSE 0 END) AS inactiveStaffCount FROM users`;
  const taskCountQuery = `SELECT COUNT(*) AS taskCount, SUM(status='Completed') AS completedCount, SUM(status='In Progress') AS inProgressCount, SUM(status='Pending') AS pendingCount, SUM(status='Rejected') AS rejectedCount FROM tasks`;
  const activityQuery = `
    SELECT
      t.id,t.title,t.description,t.status,t.priority,t.created_at,t.category,t.category_id,t.panel_id,t.file_url,
      IFNULL(t.rejection_reason,'') AS rejection_reason,
      a.assigned_user_ids,a.assigned_staff_names,a.assigned_staff_emails,a.assigned_staff_roles,a.assigned_employee_ids,
      NULLIF(SUBSTRING_INDEX(a.assigned_staff_names,'||',1),'') AS staff_name,
      NULLIF(SUBSTRING_INDEX(a.assigned_profile_pics,'||',1),'') AS profile_pic,
      NULLIF(SUBSTRING_INDEX(a.assigned_employee_ids,'||',1),'') AS staff_employee_id,
      NULLIF(SUBSTRING_INDEX(a.assigned_user_ids,',',1),'') AS user_id,
      p.panel_code,p.panel_name,p.panel_type,p.area AS panel_area,p.location AS panel_location,p.status AS panel_status,p.status_reason AS panel_status_reason
    FROM tasks t
    LEFT JOIN (
      SELECT
        ta.task_id,
        GROUP_CONCAT(ta.user_id ORDER BY ta.user_id SEPARATOR ',') AS assigned_user_ids,
        GROUP_CONCAT(COALESCE(u.name,'') ORDER BY ta.user_id SEPARATOR '||') AS assigned_staff_names,
        GROUP_CONCAT(COALESCE(u.email,'') ORDER BY ta.user_id SEPARATOR '||') AS assigned_staff_emails,
        GROUP_CONCAT(COALESCE(u.role,'') ORDER BY ta.user_id SEPARATOR '||') AS assigned_staff_roles,
        GROUP_CONCAT(COALESCE(u.profile_pic,'') ORDER BY ta.user_id SEPARATOR '||') AS assigned_profile_pics,
        GROUP_CONCAT(COALESCE(u.employeeID,'') ORDER BY ta.user_id SEPARATOR '||') AS assigned_employee_ids
      FROM task_assignments ta
      LEFT JOIN users u ON u.id=ta.user_id
      GROUP BY ta.task_id
    ) a ON a.task_id=t.id
    LEFT JOIN panels p ON t.panel_id=p.id AND p.is_deleted=0
    ORDER BY t.created_at DESC,t.id DESC
    LIMIT 100
  `;
  const onDutyQuery = `SELECT sd.id AS duty_id,sd.user_id,DATE_FORMAT(sd.duty_date,'%Y-%m-%d') AS duty_date,sd.shift_name,sd.start_time,sd.end_time,sd.status AS duty_status,sd.notes,u.name AS staff_name,u.email AS staff_email,u.role AS staff_role,u.phone AS staff_phone,u.employeeID AS employee_id,u.profile_pic FROM staff_duties sd INNER JOIN users u ON sd.user_id=u.id WHERE sd.duty_date=CURDATE() AND sd.status='on_duty' ORDER BY sd.start_time ASC,u.name ASC`;
  const panelsWorkQuery = `SELECT p.id AS panel_id,p.panel_code,p.panel_name,p.panel_type,p.area,p.location,p.status AS panel_status,p.status_reason AS panel_status_reason,t.id AS task_id,t.title AS task_title,t.description AS task_description,t.priority AS task_priority,t.status AS task_status,t.created_at AS task_created_at,GROUP_CONCAT(DISTINCT u.id ORDER BY u.name ASC SEPARATOR ',') AS assigned_user_ids,GROUP_CONCAT(DISTINCT u.name ORDER BY u.name ASC SEPARATOR ', ') AS assigned_staff_names,GROUP_CONCAT(DISTINCT u.employeeID ORDER BY u.name ASC SEPARATOR ',') AS assigned_employee_ids FROM tasks t INNER JOIN panels p ON t.panel_id=p.id AND p.is_deleted=0 LEFT JOIN task_assignments ta ON t.id=ta.task_id LEFT JOIN users u ON ta.user_id=u.id WHERE t.status='In Progress' AND t.panel_id IS NOT NULL GROUP BY p.id,p.panel_code,p.panel_name,p.panel_type,p.area,p.location,p.status,p.status_reason,t.id,t.title,t.description,t.priority,t.status,t.created_at ORDER BY t.created_at DESC,t.id DESC`;
  const panelsOffQuery = `SELECT id AS panel_id,panel_code,panel_name,panel_type,area,location,status,status_reason,status_changed_at,off_started_at FROM panels WHERE status='off' AND is_deleted=0 ORDER BY status_changed_at DESC,panel_name ASC`;
  const panelsMaintenanceQuery = `SELECT id AS panel_id,panel_code,panel_name,panel_type,area,location,status,status_reason,status_changed_at,off_started_at,last_maintenance_date,next_maintenance_date FROM panels WHERE status='maintenance' AND is_deleted=0 ORDER BY status_changed_at DESC,panel_name ASC`;

  const results = await Promise.allSettled([
    query(staffCountQuery), query(taskCountQuery), query(activityQuery),
    query(onDutyQuery), query(panelsWorkQuery), query(panelsOffQuery), query(panelsMaintenanceQuery),
  ]);
  const value = (index) => results[index].status === "fulfilled" ? results[index].value : [];
  const staff = value(0)[0] || {};
  const tasks = value(1)[0] || {};
  const activities = buildActivities(value(2));
  const onDuty = value(3), panelsWork = value(4), panelsOff = value(5), panelsMaintenance = value(6);

  return {
    success: true,
    staffCount: Number(staff.staffCount || 0),
    activeStaffCount: Number(staff.activeStaffCount || 0),
    inactiveStaffCount: Number(staff.inactiveStaffCount || 0),
    taskCount: Number(tasks.taskCount || 0),
    completedCount: Number(tasks.completedCount || 0),
    inProgressCount: Number(tasks.inProgressCount || 0),
    pendingCount: Number(tasks.pendingCount || 0),
    rejectedCount: Number(tasks.rejectedCount || 0),
    totalActivities: activities.length,
    activities,
    onDutyToday: { count: onDuty.length, staff: onDuty },
    panelsUnderWork: { count: panelsWork.length, panels: panelsWork.map((item) => ({ ...item, assigned_user_ids: item.assigned_user_ids ? String(item.assigned_user_ids).split(",").filter(Boolean) : [], assigned_staff_names: item.assigned_staff_names ? String(item.assigned_staff_names).split(", ").filter(Boolean) : [], assigned_employee_ids: item.assigned_employee_ids ? String(item.assigned_employee_ids).split(",").filter(Boolean) : [] })) },
    panelsOff: { count: panelsOff.length, panels: panelsOff },
    panelsMaintenance: { count: panelsMaintenance.length, panels: panelsMaintenance },
    operationalSummary: { onDutyCount: onDuty.length, panelsUnderWorkCount: panelsWork.length, panelsOffCount: panelsOff.length, panelsMaintenanceCount: panelsMaintenance.length },
    serverDate: new Date().toISOString().slice(0,10),
  };
}

router.get("/stats", async (req, res) => {
  try {
    if (cached && Date.now() - cachedAt < CACHE_TTL) return res.json(cached);
    if (!inFlight) inFlight = loadStats().then((data) => { cached = data; cachedAt = Date.now(); return data; }).finally(() => { inFlight = null; });
    return res.json(await inFlight);
  } catch (error) {
    console.error("FAST DASHBOARD STATS ERROR:", error.sqlMessage || error.message || error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Failed to load dashboard statistics" });
  }
});

router.post("/invalidate", (req, res) => { cached = null; cachedAt = 0; res.json({ success: true }); });

module.exports = router;
