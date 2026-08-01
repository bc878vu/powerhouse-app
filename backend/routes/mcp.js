const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const db = require("../config/db");

const router = express.Router();

const server = new McpServer({
  name: "powerhouse-ai-admin",
  version: "2.0.0",
});

// ==========================
// 📊 DASHBOARD STATS
// ==========================
server.tool("get_dashboard_stats", "Get dashboard stats", async () => {
  try {
    const [[total]] = await db.promise().query("SELECT COUNT(*) as total FROM tasks");
    const [[pending]] = await db.promise().query("SELECT COUNT(*) as pending FROM tasks WHERE status='Pending'");
    const [[completed]] = await db.promise().query("SELECT COUNT(*) as completed FROM tasks WHERE status='Completed'");

    return {
      content: [{
        type: "text",
        text: `Total: ${total.total}, Pending: ${pending.pending}, Completed: ${completed.completed}`
      }]
    };
  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// 📥 GET TASKS
// ==========================
server.tool("get_tasks", "Get all tasks", async () => {
  try {
    const [rows] = await db.promise().query(`
      SELECT t.id, t.title, t.priority, t.status, u.name 
      FROM tasks t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.id DESC
    `);

    const result = rows.map(t =>
      `#${t.id} | ${t.title} | ${t.priority} | ${t.status} | ${t.name}`
    ).join("\n");

    return { content: [{ type: "text", text: result || "No tasks" }] };

  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// ➕ ADD TASK
// ==========================
server.tool("add_task", "Create task", async ({ title, priority, description, user_id }) => {
  try {
    await db.promise().query(
      "INSERT INTO tasks (title, priority, description, user_id, status) VALUES (?, ?, ?, ?, 'Pending')",
      [title, priority, description, user_id]
    );

    return { content: [{ type: "text", text: "Task created successfully" }] };

  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// 🔄 UPDATE TASK STATUS
// ==========================
server.tool("update_task_status", "Update task status", async ({ id, status }) => {
  try {
    await db.promise().query(
      "UPDATE tasks SET status=? WHERE id=?",
      [status, id]
    );

    return { content: [{ type: "text", text: `Task ${id} updated to ${status}` }] };

  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// 👥 GET STAFF
// ==========================
server.tool("get_staff", "Get all staff", async () => {
  try {
    const [rows] = await db.promise().query("SELECT id, name, email, role FROM users");

    const result = rows.map(u =>
      `#${u.id} | ${u.name} | ${u.email} | ${u.role}`
    ).join("\n");

    return { content: [{ type: "text", text: result }] };

  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// ➕ ADD STAFF
// ==========================
server.tool("add_staff", "Create new staff", async ({ name, email, role }) => {
  try {
    await db.promise().query(
      "INSERT INTO users (name, email, role) VALUES (?, ?, ?)",
      [name, email, role]
    );

    return { content: [{ type: "text", text: "Staff added successfully" }] };

  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// 🛠 ASSIGN TOOL
// ==========================
server.tool("assign_tool", "Assign tool to staff", async ({ tool_name, category, quantity, user_id }) => {
  try {
    await db.promise().query(
      "INSERT INTO tools (tool_name, category, quantity, user_id) VALUES (?, ?, ?, ?)",
      [tool_name, category, quantity, user_id]
    );

    return { content: [{ type: "text", text: "Tool assigned successfully" }] };

  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// 📊 FILTER TASKS
// ==========================
server.tool("filter_tasks", "Filter tasks", async ({ status }) => {
  try {
    const [rows] = await db.promise().query(
      "SELECT id, title, status FROM tasks WHERE status=?",
      [status]
    );

    const result = rows.map(t =>
      `#${t.id} - ${t.title} (${t.status})`
    ).join("\n");

    return { content: [{ type: "text", text: result }] };

  } catch (err) {
    return { content: [{ type: "text", text: err.message }] };
  }
});

// ==========================
// 🔥 MCP FIX (FINAL)
// ==========================
const sessions = new Map();

router.get("/mcp", async (req, res) => {
  console.log("🔥 MCP CONNECTED");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  const transport = new SSEServerTransport("/api/mcp", res);

  sessions.set(transport.sessionId, transport);

  res.on("close", () => {
    sessions.delete(transport.sessionId);
  });

  await server.connect(transport);
});

router.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.body?.sessionId;

    const transport = sessions.get(sessionId);

    if (!transport) {
      return res.status(400).send("Invalid session");
    }

    await transport.handlePostMessage(req, res);

  } catch (err) {
    console.error("MCP ERROR:", err);
    res.status(500).send("MCP error");
  }
});

module.exports = router;