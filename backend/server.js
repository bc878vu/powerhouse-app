require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./config/db");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");

// ==========================================================
// APP + HTTP SERVER
// ==========================================================

const app = express();
const server = http.createServer(app);

// ==========================================================
// SERVER TIMEOUT SETTINGS
// ==========================================================

server.keepAliveTimeout = 60000;
server.headersTimeout = 65000;

// ==========================================================
// GLOBAL PROCESS ERROR HANDLING
// ==========================================================

process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 UNHANDLED REJECTION:", err);
});

// ==========================================================
// FRONTEND ALLOWED ORIGINS
// ==========================================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://powerhouse-app-eight.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

console.log("🌐 Allowed frontend origins:");
uniqueAllowedOrigins.forEach((origin) => {
  console.log(`   ✅ ${origin}`);
});

// ==========================================================
// SHARED CORS OPTIONS
// ==========================================================

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (uniqueAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("⚠️ CORS blocked origin:", origin);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "role",
    "Role",
    "x-user-id",
    "X-User-Id",
    "x-user-role",
    "X-User-Role",
    "x-auth-token",
    "X-Auth-Token",
  ],

  exposedHeaders: ["Content-Disposition", "Content-Length"],
  credentials: true,
  optionsSuccessStatus: 204,
  preflightContinue: false,
};

app.use(cors(corsOptions));

// ==========================================================
// MANUAL CORS FALLBACK HEADERS
// ==========================================================

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && uniqueAllowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].join(", ")
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "role",
      "Role",
      "x-user-id",
      "X-User-Id",
      "x-user-role",
      "X-User-Role",
      "x-auth-token",
      "X-Auth-Token",
    ].join(", ")
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    ["Content-Disposition", "Content-Length"].join(", ")
  );

  if (req.method === "OPTIONS") {
    console.log(`🌐 CORS PREFLIGHT: ${req.method} ${req.originalUrl}`);
    return res.sendStatus(204);
  }

  next();
});

// ==========================================================
// BODY PARSERS
// ==========================================================

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ==========================================================
// REQUEST DEBUG LOGGER
// ==========================================================

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl}`);

  if (req.headers["x-user-id"]) {
    console.log("👤 X-User-Id:", req.headers["x-user-id"]);
  }

  if (req.headers.role) {
    console.log("🛡️ Role:", req.headers.role);
  }

  next();
});

// ==========================================================
// STATIC UPLOAD FILES
// ==========================================================

const uploadDir = path.resolve(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Upload directory created:", uploadDir);
}

console.log("📂 Static uploads directory:", uploadDir);

app.use("/uploads", (req, res, next) => {
  const origin = req.headers.origin;

  if (origin && uniqueAllowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(
  "/uploads",
  express.static(uploadDir, {
    fallthrough: true,
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    },
  })
);

app.use("/uploads", (req, res) => {
  console.warn(`❌ Upload file not found: ${req.originalUrl}`);
  return res.status(404).json({
    success: false,
    message: "Upload file not found",
    requested_path: req.originalUrl,
    uploads_directory: uploadDir,
  });
});

// ==========================================================
// SOCKET.IO SETUP
// ==========================================================

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (uniqueAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("⚠️ Socket.IO CORS blocked origin:", origin);
      return callback(new Error(`Socket.IO CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST"],
    allowedHeaders: [
      "Origin",
      "Content-Type",
      "Authorization",
      "role",
      "x-user-id",
      "X-User-Id",
    ],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.onAny((event, ...args) => {
    console.log("📡 EVENT:", event, args);
  });

  socket.on("joinUser", (userId) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
    console.log(`👤 User joined room: user_${userId}`);
  });

  socket.on("joinPanelMonitoring", () => {
    socket.join("panel_monitoring");
    console.log(`⚡ Client joined panel monitoring room: ${socket.id}`);
  });

  socket.emit("connected", "Welcome Client ✅");

  socket.on("disconnect", (reason) => {
    console.log("❌ Client disconnected:", socket.id, "| Reason:", reason);
  });
});

// ==========================================================
// ROUTES IMPORT
// ==========================================================

const userRoutes = require("./routes/user");
const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/task");
const taskCompatRoutes = require("./routes/taskCompat");
const activityRoutes = require("./routes/activity");
const toolsRoutes = require("./routes/tools");
const mcpRoutes = require("./routes/mcp");
const panelRoutes = require("./routes/panels");
const dutyRoutes = require("./routes/duty");

// ==========================================================
// API ROUTES
// ==========================================================

app.use("/api", mcpRoutes);
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);

// ==========================================================
// TASK ROUTE — CRITICAL ORDER
//
// taskCompatRoutes MUST be mounted BEFORE taskRoutes.
// This is now done directly in server.js instead of depending on
// NODE_OPTIONS, Docker CMD, Railway start-command overrides, or
// Express monkey-patching. Therefore `node server.js`, `npm start`,
// Railway and Docker all expose the same task compatibility API.
//
// Supported compatibility endpoints:
// GET  /api/task/:id
// GET  /api/task/:id/pre
// GET  /api/task/single/:id
// POST /api/task/complete-work/:id
// ==========================================================

app.use("/api/task", taskCompatRoutes);
console.log("✅ Task compatibility routes mounted first");

app.use("/api/task", taskRoutes);

app.use("/api/activity", activityRoutes);
app.use("/api/tools", toolsRoutes);
app.use("/api/panels", panelRoutes);
app.use("/api/duty", dutyRoutes);

// ==========================================================
// DATABASE TEST ROUTE
// ==========================================================

app.get("/test-db", async (req, res) => {
  try {
    const [rows] = await db.promise().query("SELECT 1 AS database_test");

    return res.status(200).json({
      success: true,
      msg: "DB OK",
      result: rows,
    });
  } catch (err) {
    console.error("❌ DB TEST ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ==========================================================
// CORS TEST ROUTE
// ==========================================================

app.get("/test-cors", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "CORS is working correctly",
    origin: req.headers.origin || null,
    user_id: req.headers["x-user-id"] || null,
    role: req.headers.role || null,
    time: new Date().toISOString(),
  });
});

// ==========================================================
// 404 DEBUG HANDLER
// ==========================================================

app.use((req, res) => {
  console.warn("❌ API 404:", req.method, req.originalUrl);

  return res.status(404).json({
    success: false,
    message: "API route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

// ==========================================================
// SERVER START
// ==========================================================

const PORT = Number(process.env.PORT) || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("============================================================");
  console.log(`🚀 PowerHouse backend running on port ${PORT}`);
  console.log("✅ Task compatibility API is mounted before task router");
  console.log("============================================================");
});

module.exports = { app, server, io };
