const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.resolve(__dirname, "../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const allowedMime = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = allowedExt.has(ext) ? ext : ".jpg";
      const base = path.basename(file.originalname || "profile", ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "profile";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, allowedMime.has(file.mimetype) && allowedExt.has(ext));
  },
});

const query = (sql, values = []) => new Promise((resolve, reject) => {
  db.query(sql, values, (err, rows) => err ? reject(err) : resolve(rows));
});

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const allowedRoles = new Set(["electrician", "cro", "admin", "superadmin"]);
const allowedStatuses = new Set(["active", "inactive", "blocked"]);

const fakeName = (user) => {
  const name = String(user?.name || "").trim().toLowerCase();
  const email = normalizeEmail(user?.email);
  const exact = new Set(["vcvf", "lklkj", "jhhk", "drgdfgfd fsgd", "dummy", "test", "testing", "sample", "demo", "fake", "temporary", "temp user", "new user"]);
  return exact.has(name) || /^(dummy|test|testing|sample|demo|fake|temp)[+_.-]?[^@]*@/i.test(email);
};

const normalizeUser = (user) => user ? {
  ...user,
  id: Number(user.id),
  email: normalizeEmail(user.email),
  status: user.status || "active",
  employeeID: user.employeeID || "",
  profile_pic: user.profile_pic || null,
} : null;

const cleanupUpload = async (file) => {
  if (!file?.path) return;
  try { await fs.promises.unlink(file.path); } catch {}
};

const deleteProfileFile = async (value) => {
  if (!value || /^https?:\/\//i.test(String(value)) || String(value).startsWith("data:")) return;
  const clean = path.basename(String(value).replace(/\\/g, "/"));
  if (!clean) return;
  try { await fs.promises.unlink(path.join(uploadDir, clean)); } catch {}
};

const publicUserSelect = `
  SELECT id, name, email, role, phone,
         COALESCE(category, '') AS category,
         COALESCE(status, 'active') AS status,
         COALESCE(employeeID, '') AS employeeID,
         maritalStatus, address, backgroundInfo, profile_pic
  FROM users
`;

// MySQL is the canonical staff source for login, CRUD and task assignment.
router.get("/all", async (_req, res) => {
  try {
    const rows = await query(`${publicUserSelect} ORDER BY id DESC`);
    const seenEmails = new Set();
    const users = [];
    for (const row of rows) {
      const user = normalizeUser(row);
      if (fakeName(user)) continue;
      const email = normalizeEmail(user.email);
      if (email && seenEmails.has(email)) continue;
      if (email) seenEmails.add(email);
      users.push(user);
    }
    return res.json(users);
  } catch (err) {
    console.error("GET USERS ERROR", err);
    return res.status(500).json({ success: false, message: err.sqlMessage || err.message });
  }
});

router.post("/", upload.single("profile_pic"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = String(req.body.role || "electrician").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim() || null;
    const maritalStatus = String(req.body.maritalStatus || "Single").trim();
    const address = String(req.body.address || "").trim() || null;
    const backgroundInfo = String(req.body.backgroundInfo || "").trim() || null;

    if (name.length < 2) return res.status(400).json({ success: false, message: "Full name is required." });
    if (!validEmail(email)) return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    if (password.length < 6) return res.status(400).json({ success: false, message: "Password must contain at least 6 characters." });
    if (!allowedRoles.has(role)) return res.status(400).json({ success: false, message: "Invalid staff role." });

    const duplicate = await query("SELECT id FROM users WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1", [email]);
    if (duplicate.length) {
      await cleanupUpload(req.file);
      return res.status(409).json({ success: false, error: "Email already exists", message: "A staff account with this email address already exists." });
    }

    const employeeID = await (async () => {
      for (let i = 0; i < 100; i += 1) {
        const candidate = `PH-${Math.floor(1000 + Math.random() * 9000)}`;
        const exists = await query("SELECT id FROM users WHERE employeeID = ? LIMIT 1", [candidate]);
        if (!exists.length) return candidate;
      }
      return `PH-${Date.now()}`;
    })();

    const passwordHash = await bcrypt.hash(password, 10);
    const profilePic = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await query(`
      INSERT INTO users
      (name, email, password, role, phone, employeeID, maritalStatus, address, backgroundInfo, profile_pic, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `, [name, email, passwordHash, role, phone, employeeID, maritalStatus, address, backgroundInfo, profilePic]);

    const created = await query(`${publicUserSelect} WHERE id = ? LIMIT 1`, [result.insertId]);
    return res.status(201).json({ success: true, message: "Staff member created successfully.", user: normalizeUser(created[0]) });
  } catch (err) {
    await cleanupUpload(req.file);
    console.error("CREATE USER ERROR", err);
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Email or employee ID already exists." });
    return res.status(500).json({ success: false, message: err.sqlMessage || err.message });
  }
});

router.put("/update-profile/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });

    const user = rows[0];
    const name = req.body.name !== undefined ? String(req.body.name).trim() : user.name;
    let passwordHash = user.password;
    const changingPassword = req.body.currentPassword || req.body.newPassword || req.body.confirmPassword;

    if (changingPassword) {
      if (!req.body.currentPassword || !req.body.newPassword || req.body.newPassword !== req.body.confirmPassword) {
        return res.status(400).json({ success: false, message: "Current password, new password and matching confirmation are required." });
      }
      if (!(await bcrypt.compare(String(req.body.currentPassword), String(user.password)))) {
        return res.status(401).json({ success: false, message: "Incorrect current password." });
      }
      if (String(req.body.newPassword).length < 6) return res.status(400).json({ success: false, message: "New password must contain at least 6 characters." });
      passwordHash = await bcrypt.hash(String(req.body.newPassword), 10);
    }

    await query("UPDATE users SET name = ?, password = ? WHERE id = ?", [name, passwordHash, id]);
    const updated = await query(`${publicUserSelect} WHERE id = ? LIMIT 1`, [id]);
    return res.json({ success: true, message: "Profile updated successfully.", user: normalizeUser(updated[0]) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.sqlMessage || err.message });
  }
});

router.put("/:id", upload.single("profile_pic"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (!Number.isInteger(id) || id <= 0) {
      await cleanupUpload(req.file);
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    const rows = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) {
      await cleanupUpload(req.file);
      return res.status(404).json({ success: false, error: "User not found", message: "The requested staff member does not exist." });
    }

    const existing = rows[0];
    const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
    const email = req.body.email !== undefined ? normalizeEmail(req.body.email) : normalizeEmail(existing.email);
    const role = req.body.role !== undefined ? String(req.body.role).trim().toLowerCase() : existing.role;
    const phone = req.body.phone !== undefined ? String(req.body.phone).trim() || null : existing.phone;
    const maritalStatus = req.body.maritalStatus !== undefined ? String(req.body.maritalStatus).trim() : existing.maritalStatus;
    const address = req.body.address !== undefined ? String(req.body.address).trim() || null : existing.address;
    const backgroundInfo = req.body.backgroundInfo !== undefined ? String(req.body.backgroundInfo).trim() || null : existing.backgroundInfo;
    const status = req.body.status !== undefined ? String(req.body.status).trim().toLowerCase() : (existing.status || "active");

    if (name.length < 2) throw Object.assign(new Error("Name is required."), { statusCode: 400 });
    if (!validEmail(email)) throw Object.assign(new Error("Please enter a valid email address."), { statusCode: 400 });
    if (!allowedRoles.has(role)) throw Object.assign(new Error("Invalid staff role."), { statusCode: 400 });
    if (!allowedStatuses.has(status)) throw Object.assign(new Error("Status must be active, inactive or blocked."), { statusCode: 400 });

    const duplicate = await query("SELECT id FROM users WHERE LOWER(TRIM(email)) = ? AND id <> ? LIMIT 1", [email, id]);
    if (duplicate.length) {
      await cleanupUpload(req.file);
      return res.status(409).json({ success: false, message: "Another staff account already uses this email address." });
    }

    let passwordHash = existing.password;
    if (req.body.password && String(req.body.password).length >= 6) passwordHash = await bcrypt.hash(String(req.body.password), 10);
    const profilePic = req.file ? `/uploads/${req.file.filename}` : existing.profile_pic;

    await query(`
      UPDATE users SET
        name = ?, email = ?, password = ?, role = ?, phone = ?, maritalStatus = ?, address = ?, backgroundInfo = ?, status = ?, profile_pic = ?
      WHERE id = ?
    `, [name, email, passwordHash, role, phone, maritalStatus, address, backgroundInfo, status, profilePic, id]);

    if (req.file && existing.profile_pic && existing.profile_pic !== profilePic) await deleteProfileFile(existing.profile_pic);
    const updated = await query(`${publicUserSelect} WHERE id = ? LIMIT 1`, [id]);
    return res.json({ success: true, message: "Staff member updated successfully.", user: normalizeUser(updated[0]) });
  } catch (err) {
    await cleanupUpload(req.file);
    const status = Number(err.statusCode) || 500;
    return res.status(status).json({ success: false, message: err.sqlMessage || err.message || "Update failed." });
  }
});

// Hard delete: remove user-linked records first; keep task rows so the task log is not deleted.
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  let connection;
  try {
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid user ID." });
    connection = db.promise();
    const [users] = await connection.query("SELECT id, name, email, employeeID, profile_pic FROM users WHERE id = ? LIMIT 1", [id]);
    if (!users.length) return res.status(404).json({ success: false, error: "User not found", message: "The requested staff member does not exist." });

    await connection.beginTransaction();
    const safeDelete = async (sql) => {
      try { await connection.query(sql, [id]); }
      catch (err) { if (!["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(err.code)) throw err; }
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
    await deleteProfileFile(users[0].profile_pic);
    return res.json({ success: true, message: "Staff member deleted successfully.", deletedUser: users[0] });
  } catch (err) {
    try { if (connection) await connection.rollback(); } catch {}
    console.error("DELETE USER ERROR", err);
    if (err.code === "ER_ROW_IS_REFERENCED_2" || err.errno === 1451) return res.status(409).json({ success: false, message: "This user is still referenced by another record. Remove that relationship first." });
    return res.status(500).json({ success: false, message: err.sqlMessage || err.message });
  }
});

router.get("/full/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid user ID." });
    const users = await query(`${publicUserSelect} WHERE id = ? LIMIT 1`, [id]);
    if (!users.length) return res.status(404).json({ success: false, error: "User not found", message: "The requested staff member does not exist." });

    const tasks = await query(`
      SELECT DISTINCT t.*
      FROM tasks t
      INNER JOIN task_assignments ta ON ta.task_id = t.id
      WHERE ta.user_id = ?
      ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC
    `, [id]);
    const tools = await query(`SELECT * FROM tools WHERE user_id = ? ORDER BY id DESC`, [id]).catch(() => []);
    const normalized = normalizeUser(users[0]);
    return res.json({
      success: true,
      user: normalized,
      tasks,
      tools,
      summary: {
        totalTasks: tasks.length,
        pendingTasks: tasks.filter((task) => task.status === "Pending").length,
        inProgressTasks: tasks.filter((task) => task.status === "In Progress").length,
        completedTasks: tasks.filter((task) => task.status === "Completed").length,
        totalTools: tools.length,
      },
    });
  } catch (err) {
    console.error("GET FULL USER ERROR", err);
    return res.status(500).json({ success: false, message: err.sqlMessage || err.message });
  }
});

router.post("/save-token", async (req, res) => {
  try {
    const userId = Number(req.body.user_id);
    const token = String(req.body.token || "").trim();
    if (!userId || !token) return res.status(400).json({ success: false, message: "Both token and user ID are required." });
    const user = await query("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!user.length) return res.status(404).json({ success: false, message: "User not found." });
    await query("UPDATE users SET fcm_token = ? WHERE id = ?", [token, userId]);
    return res.json({ success: true, message: "Token saved." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.sqlMessage || err.message });
  }
});

module.exports = router;
