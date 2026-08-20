const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const db = require("../config/db");
const admin = require("../firebaseAdmin");

const router = express.Router();

const server = new McpServer({ name: "powerhouse-ai-admin", version: "2.0.0" });

async function verifyFirebaseAdmin(req) {
  if (!admin.apps.length) throw new Error("Firebase Admin is not initialized. Set FIREBASE_SERVICE_ACCOUNT on the backend.");
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) { const e = new Error("Authentication token is required."); e.status = 401; throw e; }
  const decoded = await admin.auth().verifyIdToken(token);
  const email = String(decoded.email || "").trim().toLowerCase();
  const profileSnap = await admin.firestore().collection("powerhouse_users").doc(decoded.uid).get();
  const profile = profileSnap.exists ? profileSnap.data() : null;
  const isAdmin = email === "admin@powerhouse.com" || ["admin", "superadmin"].includes(String(profile?.role || decoded.role || "").toLowerCase());
  if (!isAdmin) { const e = new Error("Admin permission is required to send system notifications."); e.status = 403; throw e; }
  return decoded;
}

const normalizeIds = value => Array.isArray(value) ? [...new Set(value.map(String).map(x => x.trim()).filter(Boolean))] : (value == null || value === "" ? [] : [String(value).trim()].filter(Boolean));

async function getPushTokens(userIds = []) {
  const collection = admin.firestore().collection("powerhouse_fcm_tokens");
  const tokenSet = new Set();
  if (!userIds.length) {
    const snapshot = await collection.get();
    snapshot.forEach(item => { const token = item.data()?.token; if (token) tokenSet.add(String(token)); });
  } else {
    const snapshots = await Promise.all(userIds.map(uid => collection.doc(uid).get()));
    snapshots.forEach(item => { const token = item.exists ? item.data()?.token : null; if (token) tokenSet.add(String(token)); });
  }
  return [...tokenSet];
}

router.post("/notifications/push", async (req, res) => {
  try {
    await verifyFirebaseAdmin(req);
    const body = req.body || {};
    const title = String(body.title || "PowerHouse Alert").trim().slice(0, 120);
    const messageBody = String(body.body || "You have a new PowerHouse alert.").trim().slice(0, 500);
    const route = String(body.route || "/notifications").trim();
    const userIds = normalizeIds(body.userIds ?? body.userId);
    const tokens = await getPushTokens(userIds);
    if (!tokens.length) return res.json({ success: true, sent: 0, failed: 0, reason: "No registered push tokens." });
    const origin = process.env.FRONTEND_URL || "https://powerhouse-app-eight.vercel.app";
    const link = new URL(route, origin).href;
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body: messageBody },
      data: { title, body: messageBody, route },
      webpush: { fcmOptions: { link }, notification: { title, body: messageBody, icon: "/favicon.svg", badge: "/favicon.svg", tag: String(body.notificationId || "powerhouse-alert") } }
    });
    const invalid = [];
    result.responses.forEach((item, index) => {
      const code = item.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) invalid.push(tokens[index]);
    });
    if (invalid.length) {
      const snapshots = await Promise.all(invalid.map(token => admin.firestore().collection("powerhouse_fcm_tokens").where("token", "==", token).get()));
      await Promise.all(snapshots.flatMap(snapshot => snapshot.docs.map(item => item.ref.delete())));
    }
    return res.json({ success: true, sent: result.successCount, failed: result.failureCount, cleaned: invalid.length });
  } catch (error) {
    const status = error.status || (String(error.code || "").startsWith("auth/") ? 401 : 500);
    console.error("FCM notification error:", error?.message || error);
    return res.status(status).json({ success: false, message: error?.message || "Unable to send push notification." });
  }
});

server.tool("get_dashboard_stats", "Get dashboard stats", async () => {
  try { const [[total]] = await db.promise().query("SELECT COUNT(*) as total FROM tasks"); const [[pending]] = await db.promise().query("SELECT COUNT(*) as pending FROM tasks WHERE status='Pending'"); const [[completed]] = await db.promise().query("SELECT COUNT(*) as completed FROM tasks WHERE status='Completed'"); return { content: [{ type: "text", text: `Total: ${total.total}, Pending: ${pending.pending}, Completed: ${completed.completed}` }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

server.tool("get_tasks", "Get all tasks", async () => {
  try { const [rows] = await db.promise().query(`SELECT t.id, t.title, t.priority, t.status, u.name FROM tasks t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.id DESC`); const result = rows.map(t => `#${t.id} | ${t.title} | ${t.priority} | ${t.status} | ${t.name}`).join("\n"); return { content: [{ type: "text", text: result || "No tasks" }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

server.tool("add_task", "Create task", async ({ title, priority, description, user_id }) => {
  try { await db.promise().query("INSERT INTO tasks (title, priority, description, user_id, status) VALUES (?, ?, ?, ?, 'Pending')", [title, priority, description, user_id]); return { content: [{ type: "text", text: "Task created successfully" }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

server.tool("update_task_status", "Update task status", async ({ id, status }) => {
  try { await db.promise().query("UPDATE tasks SET status=? WHERE id=?", [status, id]); return { content: [{ type: "text", text: `Task ${id} updated to ${status}` }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

server.tool("get_staff", "Get all staff", async () => {
  try { const [rows] = await db.promise().query("SELECT id, name, email, role FROM users"); const result = rows.map(u => `#${u.id} | ${u.name} | ${u.email} | ${u.role}`).join("\n"); return { content: [{ type: "text", text: result }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

server.tool("add_staff", "Create new staff", async ({ name, email, role }) => {
  try { await db.promise().query("INSERT INTO users (name, email, role) VALUES (?, ?, ?)", [name, email, role]); return { content: [{ type: "text", text: "Staff added successfully" }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

server.tool("assign_tool", "Assign tool to staff", async ({ tool_name, category, quantity, user_id }) => {
  try { await db.promise().query("INSERT INTO tools (tool_name, category, quantity, user_id) VALUES (?, ?, ?, ?)", [tool_name, category, quantity, user_id]); return { content: [{ type: "text", text: "Tool assigned successfully" }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

server.tool("filter_tasks", "Filter tasks", async ({ status }) => {
  try { const [rows] = await db.promise().query("SELECT id, title, status FROM tasks WHERE status=?", [status]); const result = rows.map(t => `#${t.id} - ${t.title} (${t.status})`).join("\n"); return { content: [{ type: "text", text: result }] }; } catch (err) { return { content: [{ type: "text", text: err.message }] }; }
});

const sessions = new Map();
router.get("/mcp", async (req, res) => {
  console.log("🔥 MCP CONNECTED");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const transport = new SSEServerTransport("/api/mcp", res);
  sessions.set(transport.sessionId, transport);
  res.on("close", () => { sessions.delete(transport.sessionId); });
  await server.connect(transport);
});
router.post("/mcp", async (req, res) => {
  try { const sessionId = req.query.sessionId || req.body?.sessionId; const transport = sessions.get(sessionId); if (!transport) return res.status(400).send("Invalid session"); await transport.handlePostMessage(req, res); } catch (err) { console.error("MCP ERROR:", err); res.status(500).send("MCP error"); }
});

module.exports = router;