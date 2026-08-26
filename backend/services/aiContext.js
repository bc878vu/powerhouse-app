const admin = require("../firebaseAdmin");
const db = require("../config/db");

const sql = (statement, values = []) => new Promise((resolve, reject) => {
  db.query(statement, values, (err, rows) => err ? reject(err) : resolve(rows || []));
});
const safeSql = async (statement, values = []) => {
  try { return await sql(statement, values); } catch (error) {
    if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_PARSE_ERROR"].includes(error.code)) return [];
    throw error;
  }
};
async function safeCollection(name, max = 80) {
  try {
    if (!admin.apps.length) return [];
    const snap = await admin.firestore().collection(name).limit(max).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(`AI Firestore context skipped (${name}):`, error.message);
    return [];
  }
}
function clean(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return value.length > 800 ? `${value.slice(0, 800)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => clean(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 60).map(([key, item]) => [key, clean(item, depth + 1)]));
  return value;
}
async function buildContext({ userId, role }) {
  const isAdmin = ["admin", "superadmin"].includes(String(role || "").toLowerCase());
  const numericId = Number(userId);
  const userRows = Number.isInteger(numericId) && numericId > 0
    ? await safeSql("SELECT id,name,email,role,phone,employeeID,status,maritalStatus,address,backgroundInfo,profile_pic FROM users WHERE id = ? LIMIT 1", [numericId])
    : [];
  const currentUser = userRows[0] || null;
  const [panels, routes, tasks, duties, tools, activities] = await Promise.all([
    safeCollection("powerhouse_panels", 100), safeCollection("powerhouse_panel_routes", 100),
    safeCollection("tasks", 120), safeCollection("duties", 80), safeCollection("tools", 80), safeCollection("activities", 80),
  ]);
  const scopedTasks = isAdmin ? tasks : tasks.filter((task) => {
    const ids = task.assigned_user_ids || task.user_ids || [];
    const list = Array.isArray(ids) ? ids : [ids];
    return list.some((item) => String(item?.id || item?.user_id || item) === String(userId)) || String(task.user_id || "") === String(userId);
  });
  const scopedDuties = isAdmin ? duties : duties.filter((item) => String(item.user_id || item.assigned_user_id || "") === String(userId));
  const scopedTools = isAdmin ? tools : tools.filter((item) => String(item.user_id || item.assigned_user_id || "") === String(userId));
  const mysqlStats = isAdmin ? {
    users: await safeSql("SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE(status,'active')='active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN COALESCE(status,'active')='blocked' THEN 1 ELSE 0 END) AS blocked FROM users"),
    taskAssignments: await safeSql("SELECT COUNT(*) AS total FROM task_assignments"),
  } : {};
  return clean({
    generatedAt: new Date().toISOString(), access: isAdmin ? "admin_full" : "user_limited",
    currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, role: currentUser.role, employeeID: currentUser.employeeID, status: currentUser.status, phone: currentUser.phone } : { id: userId, role },
    summary: { panelCount: panels.filter((p) => p.is_deleted !== true).length, routeCount: routes.length, taskCount: scopedTasks.length, dutyCount: scopedDuties.length, toolCount: scopedTools.length, activityCount: isAdmin ? activities.length : 0 },
    panels: panels.filter((p) => p.is_deleted !== true).map((p) => ({ id: p.id, panel_code: p.panel_code, panel_name: p.panel_name, panel_type: p.panel_type, area: p.area, location: p.location, status: p.status, rated_current: p.rated_current, voltage: p.voltage, source_panel_id: p.source_panel_id, incoming_cable_size: p.incoming_cable_size, incoming_cable_length: p.incoming_cable_length })),
    routes: routes.map((r) => ({ id: r.id, route_code: r.route_code, route_name: r.route_name, source_panel_id: r.source_panel_id, destination_panel_id: r.destination_panel_id, cable_size: r.cable_size, cable_type: r.cable_type, cable_cores: r.cable_cores, cable_length: r.cable_length, route_points: r.route_points })),
    tasks: scopedTasks, duties: scopedDuties, tools: scopedTools, activities: isAdmin ? activities : [], mysqlStats,
  });
}
module.exports = { buildContext };
