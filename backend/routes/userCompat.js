const express = require("express");
const router = express.Router();
const db = require("../config/db");

const q = (sql, values = []) => db.promise().query(sql, values);
const normalizeId = (value) => String(value ?? "").trim();
const publicSelect = `SELECT id, name, email, role, phone, COALESCE(status, 'active') AS status, COALESCE(employeeID, '') AS employeeID, maritalStatus, address, backgroundInfo, profile_pic FROM users`;

const findUser = async (rawId) => {
  const value = normalizeId(rawId);
  if (!value) return null;
  const numeric = Number(value);
  let rows = [];
  if (Number.isInteger(numeric) && numeric > 0) {
    [rows] = await q(`${publicSelect} WHERE id = ? LIMIT 1`, [numeric]);
  }
  if (!rows.length) {
    [rows] = await q(`${publicSelect} WHERE employeeID = ? LIMIT 1`, [value]);
  }
  return rows[0] || null;
};

router.get("/full/:id", async (req, res) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found", message: "The requested staff member does not exist." });
    const id = Number(user.id);
    let tasks = [];
    let tools = [];
    try {
      const [rows] = await q(`SELECT DISTINCT t.* FROM tasks t INNER JOIN task_assignments ta ON ta.task_id = t.id WHERE ta.user_id = ? ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC`, [id]);
      tasks = rows;
    } catch (error) {
      console.warn("USER COMPAT TASK READ:", error.message);
    }
    try {
      const [rows] = await q(`SELECT * FROM tools WHERE user_id = ? ORDER BY id DESC`, [id]);
      tools = rows;
    } catch (error) {
      console.warn("USER COMPAT TOOL READ:", error.message);
    }
    const lower = (value) => String(value || "").toLowerCase();
    return res.json({
      success: true,
      user,
      tasks,
      tools,
      summary: {
        totalTasks: tasks.length,
        pendingTasks: tasks.filter((x) => lower(x.status) === "pending").length,
        inProgressTasks: tasks.filter((x) => lower(x.status) === "in progress").length,
        completedTasks: tasks.filter((x) => lower(x.status) === "completed").length,
        totalTools: tools.length,
      },
    });
  } catch (error) {
    console.error("USER COMPAT FULL ERROR:", error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Failed to load user." });
  }
});

// JSON-only updates are handled here. Multipart profile/photo edits continue to the canonical user router.
router.put("/:id", async (req, res, next) => {
  if (String(req.headers["content-type"] || "").toLowerCase().includes("multipart/form-data")) return next();
  try {
    const user = await findUser(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found", message: "The requested staff member does not exist." });
    const id = Number(user.id);
    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : user.name;
    const phone = body.phone !== undefined ? String(body.phone).trim() || null : user.phone;
    const role = body.role !== undefined ? String(body.role).trim().toLowerCase() : user.role;
    const status = body.status !== undefined ? String(body.status).trim().toLowerCase() : String(user.status || "active").toLowerCase();
    const maritalStatus = body.maritalStatus !== undefined ? String(body.maritalStatus).trim() : user.maritalStatus;
    const address = body.address !== undefined ? String(body.address).trim() || null : user.address;
    const backgroundInfo = body.backgroundInfo !== undefined ? String(body.backgroundInfo).trim() || null : user.backgroundInfo;
    if (name.length < 2) return res.status(400).json({ success: false, message: "Name is required." });
    if (!["electrician", "cro", "admin", "superadmin"].includes(role)) return res.status(400).json({ success: false, message: "Invalid staff role." });
    if (!["active", "inactive", "blocked"].includes(status)) return res.status(400).json({ success: false, message: "Status must be active, inactive or blocked." });
    await q(`UPDATE users SET name = ?, role = ?, phone = ?, maritalStatus = ?, address = ?, backgroundInfo = ?, status = ? WHERE id = ?`, [name, role, phone, maritalStatus, address, backgroundInfo, status, id]);
    const updated = await findUser(String(id));
    return res.json({ success: true, message: "Staff member updated successfully.", user: updated });
  } catch (error) {
    console.error("USER COMPAT UPDATE ERROR:", error);
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Update failed." });
  }
});

router.delete("/:id", async (req, res) => {
  const rawId = normalizeId(req.params.id);
  let connection;
  try {
    const user = await findUser(rawId);
    if (!user) return res.status(404).json({ success: false, error: "User not found", message: "The requested staff member does not exist." });
    const id = Number(user.id);
    connection = db.promise();
    await connection.beginTransaction();
    const safeDelete = async (sql) => {
      try { await connection.query(sql, [id]); }
      catch (error) {
        if (!["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(error.code)) throw error;
      }
    };
    await safeDelete("DELETE FROM task_completions WHERE user_id = ?");
    await safeDelete("DELETE FROM task_assignment_history WHERE user_id = ?");
    await safeDelete("DELETE FROM task_assignments WHERE user_id = ?");
    await safeDelete("DELETE FROM staff_duties WHERE user_id = ?");
    await safeDelete("DELETE FROM staff_shifts WHERE user_id = ?");
    await safeDelete("DELETE FROM tools WHERE user_id = ?");
    await safeDelete("DELETE FROM notifications WHERE user_id = ?");
    await connection.query("DELETE FROM users WHERE id = ?", [id]);
    await connection.commit();
    return res.json({ success: true, message: "Staff member deleted successfully.", deletedUser: user });
  } catch (error) {
    try { if (connection) await connection.rollback(); } catch {}
    console.error("USER COMPAT DELETE ERROR:", error);
    if (error.code === "ER_ROW_IS_REFERENCED_2" || error.errno === 1451) return res.status(409).json({ success: false, message: "This user is still referenced by another record. Remove that relationship first." });
    return res.status(500).json({ success: false, message: error.sqlMessage || error.message || "Delete failed." });
  }
});

module.exports = router;
