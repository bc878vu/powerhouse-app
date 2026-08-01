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

// Remove duplicate origins automatically
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
    // Allow Postman, curl, mobile apps and server-to-server
    // requests where no Origin header is sent.
    if (!origin) {
      return callback(null, true);
    }

    if (uniqueAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("⚠️ CORS blocked origin:", origin);

    return callback(
      new Error(`CORS blocked origin: ${origin}`)
    );
  },

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",

    // Custom application headers
    "role",
    "Role",

    "x-user-id",
    "X-User-Id",

    "x-user-role",
    "X-User-Role",

    "x-auth-token",
    "X-Auth-Token",
  ],

  exposedHeaders: [
    "Content-Disposition",
    "Content-Length",
  ],

  credentials: true,

  optionsSuccessStatus: 204,

  preflightContinue: false,
};

// ==========================================================
// CORS MIDDLEWARE
// IMPORTANT: MUST BE BEFORE ALL API ROUTES
// ==========================================================

app.use(cors(corsOptions));

// ==========================================================
// MANUAL CORS FALLBACK HEADERS
// ==========================================================

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && uniqueAllowedOrigins.includes(origin)) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );
  }

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ].join(", ")
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
    [
      "Content-Disposition",
      "Content-Length",
    ].join(", ")
  );

  if (req.method === "OPTIONS") {
    console.log(
      `🌐 CORS PREFLIGHT: ${req.method} ${req.originalUrl}`
    );

    return res.sendStatus(204);
  }

  next();
});

// ==========================================================
// BODY PARSERS
// ==========================================================

app.use(
  express.json({
    limit: "50mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

// ==========================================================
// REQUEST DEBUG LOGGER
// ==========================================================

app.use((req, res, next) => {
  console.log(
    `📥 ${req.method} ${req.originalUrl}`
  );

  if (req.headers["x-user-id"]) {
    console.log(
      "👤 X-User-Id:",
      req.headers["x-user-id"]
    );
  }

  if (req.headers.role) {
    console.log(
      "🛡️ Role:",
      req.headers.role
    );
  }

  next();
});

// ==========================================================
// STATIC UPLOAD FILES
// PROFILE PICTURE + MEDIA SUPPORT
// IMPORTANT: uploadDir IS DECLARED ONLY ONCE
// ==========================================================

const uploadDir = path.resolve(
  __dirname,
  "uploads"
);

// Create uploads folder automatically if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });

  console.log(
    "📁 Upload directory created:",
    uploadDir
  );
}

console.log(
  "📂 Static uploads directory:",
  uploadDir
);

// ==========================================================
// UPLOADS CORS + CACHE HEADERS
// ==========================================================

app.use(
  "/uploads",
  (req, res, next) => {
    const origin = req.headers.origin;

    if (
      origin &&
      uniqueAllowedOrigins.includes(origin)
    ) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        origin
      );
    }

    res.setHeader(
      "Access-Control-Allow-Credentials",
      "true"
    );

    res.setHeader(
      "Cross-Origin-Resource-Policy",
      "cross-origin"
    );

    // Prevent stale/broken image cache during development
    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    next();
  }
);

// ==========================================================
// SERVE UPLOADED FILES
// ==========================================================

app.use(
  "/uploads",
  express.static(uploadDir, {
    fallthrough: true,

    setHeaders: (res) => {
      res.setHeader(
        "Cross-Origin-Resource-Policy",
        "cross-origin"
      );

      res.setHeader(
        "Cache-Control",
        "no-cache, no-store, must-revalidate"
      );
    },
  })
);

// ==========================================================
// UPLOAD FILE NOT FOUND DEBUG
// ==========================================================

app.use(
  "/uploads",
  (req, res) => {
    console.warn(
      `❌ Upload file not found: ${req.originalUrl}`
    );

    return res.status(404).json({
      success: false,
      message: "Upload file not found",
      requested_path: req.originalUrl,
      uploads_directory: uploadDir,
    });
  }
);

// ==========================================================
// SOCKET.IO SETUP
// ==========================================================

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (uniqueAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(
        "⚠️ Socket.IO CORS blocked origin:",
        origin
      );

      return callback(
        new Error(
          `Socket.IO CORS blocked origin: ${origin}`
        )
      );
    },

    methods: [
      "GET",
      "POST",
    ],

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

  transports: [
    "websocket",
    "polling",
  ],
});

// Make Socket.IO accessible inside routes
app.set("io", io);

// ==========================================================
// SOCKET.IO CONNECTION
// ==========================================================

io.on("connection", (socket) => {
  console.log(
    "⚡ Client connected:",
    socket.id
  );

  socket.onAny((event, ...args) => {
    console.log(
      "📡 EVENT:",
      event,
      args
    );
  });

  // ========================================================
  // USER-SPECIFIC ROOM
  // ========================================================

  socket.on("joinUser", (userId) => {
    if (!userId) {
      return;
    }

    socket.join(`user_${userId}`);

    console.log(
      `👤 User joined room: user_${userId}`
    );
  });

  // ========================================================
  // PANEL MONITORING ROOM
  // ========================================================

  socket.on(
    "joinPanelMonitoring",
    () => {
      socket.join("panel_monitoring");

      console.log(
        `⚡ Client joined panel monitoring room: ${socket.id}`
      );
    }
  );

  socket.emit(
    "connected",
    "Welcome Client ✅"
  );

  socket.on("disconnect", (reason) => {
    console.log(
      "❌ Client disconnected:",
      socket.id,
      "| Reason:",
      reason
    );
  });
});

// ==========================================================
// ROUTES IMPORT
// ==========================================================

const userRoutes = require("./routes/user");
const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/task");
const activityRoutes = require("./routes/activity");
const toolsRoutes = require("./routes/tools");
const mcpRoutes = require("./routes/mcp");
const panelRoutes = require("./routes/panels");
const dutyRoutes = require("./routes/duty");

// ==========================================================
// API ROUTES
// IMPORTANT: ALL ROUTES MUST STAY AFTER CORS
// ==========================================================

// MCP
app.use(
  "/api",
  mcpRoutes
);

// USERS
app.use(
  "/api/user",
  userRoutes
);

// AUTHENTICATION
app.use(
  "/api/auth",
  authRoutes
);

// TASKS
app.use(
  "/api/task",
  taskRoutes
);

// ACTIVITIES
app.use(
  "/api/activity",
  activityRoutes
);

// TOOLS
app.use(
  "/api/tools",
  toolsRoutes
);

// ==========================================================
// INTERACTIVE PANEL MAP + PANEL MANAGEMENT + HISTORY API
// ==========================================================

app.use(
  "/api/panels",
  panelRoutes
);

// ==========================================================
// STAFF DUTY MANAGEMENT API
//
// GET    /api/duty/summary
// GET    /api/duty/staff
// GET    /api/duty/user/:userId
// GET    /api/duty/user/:userId/monthly
// GET    /api/duty/user/:userId/history
// POST   /api/duty/assign-shift
// PUT    /api/duty/shift/:id
// POST   /api/duty/mark-status
// PUT    /api/duty/record/:id
// DELETE /api/duty/record/:id
// ==========================================================

app.use(
  "/api/duty",
  dutyRoutes
);

// ==========================================================
// DATABASE TEST ROUTE
// ==========================================================

app.get(
  "/test-db",
  async (req, res) => {
    try {
      const [rows] = await db
        .promise()
        .query(
          "SELECT 1 AS database_test"
        );

      return res.status(200).json({
        success: true,
        msg: "DB OK",
        result: rows,
      });
    } catch (err) {
      console.error(
        "❌ DB TEST ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }
);

// ==========================================================
// CORS TEST ROUTE
// ==========================================================

app.get(
  "/test-cors",
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "CORS is working correctly",
      origin: req.headers.origin || null,

      user_id:
        req.headers["x-user-id"] || null,

      role:
        req.headers.role || null,

      time: new Date().toISOString(),
    });
  }
);

// ==========================================================
// API HEALTH CHECK
// ==========================================================

app.get(
  "/api/health",
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "PowerHouse API is healthy",

      server_time:
        new Date().toISOString(),

      allowed_origins:
        uniqueAllowedOrigins,
    });
  }
);

// ==========================================================
// UPLOADS DEBUG TEST
// ==========================================================

app.get(
  "/test-uploads",
  (req, res) => {
    try {
      const files = fs.existsSync(uploadDir)
        ? fs.readdirSync(uploadDir)
        : [];

      const baseUrl =
        `${req.protocol}://${req.get("host")}`;

      const fileDetails = files
        .slice(0, 100)
        .map((fileName) => ({
          filename: fileName,

          url:
            `${baseUrl}/uploads/${encodeURIComponent(fileName)}`,

          exists: fs.existsSync(
            path.join(uploadDir, fileName)
          ),
        }));

      return res.status(200).json({
        success: true,

        message:
          "Uploads directory is accessible",

        upload_directory:
          uploadDir,

        total_files:
          files.length,

        files:
          fileDetails,
      });
    } catch (err) {
      console.error(
        "❌ UPLOADS TEST ERROR:",
        err
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to read uploads directory",

        error:
          err.message,
      });
    }
  }
);

// ==========================================================
// DUTY API TEST ROUTE
// ==========================================================

app.get(
  "/test-duty-api",
  async (req, res) => {
    try {
      const [dutyTables] = await db
        .promise()
        .query(`
          SHOW TABLES LIKE 'staff_duties'
        `);

      const [shiftTables] = await db
        .promise()
        .query(`
          SHOW TABLES LIKE 'staff_shifts'
        `);

      return res.status(200).json({
        success: true,

        message:
          dutyTables.length > 0 &&
          shiftTables.length > 0
            ? "Staff Duty database tables are available"
            : "One or more Staff Duty database tables are missing",

        staff_duties_exists:
          dutyTables.length > 0,

        staff_shifts_exists:
          shiftTables.length > 0,

        endpoints: {
          summary:
            "/api/duty/summary",

          staff:
            "/api/duty/staff?year=2026&month=7",

          assignShift:
            "/api/duty/assign-shift",

          markStatus:
            "/api/duty/mark-status",
        },
      });
    } catch (err) {
      console.error(
        "❌ DUTY API TEST ERROR:",
        err
      );

      return res.status(500).json({
        success: false,

        message:
          "Staff Duty database test failed",

        error:
          err.message,
      });
    }
  }
);

// ==========================================================
// PANEL API TEST ROUTE
// ==========================================================

app.get(
  "/test-panels-api",
  async (req, res) => {
    try {
      const [panels] = await db
        .promise()
        .query(`
          SELECT
            id,
            panel_code,
            panel_name,
            status
          FROM panels
          ORDER BY id ASC
        `);

      return res.status(200).json({
        success: true,

        message:
          "Panel database and API are working correctly",

        panel_count:
          panels.length,

        panels,
      });
    } catch (err) {
      console.error(
        "❌ PANEL API TEST ERROR:",
        err
      );

      return res.status(500).json({
        success: false,

        message:
          "Panel database test failed",

        error:
          err.message,
      });
    }
  }
);

// ==========================================================
// PANEL HISTORY API TEST ROUTE
// ==========================================================

app.get(
  "/test-panel-history-api",
  async (req, res) => {
    try {
      const [columns] = await db
        .promise()
        .query(`
          SHOW COLUMNS
          FROM panels
          LIKE 'deleted_at'
        `);

      return res.status(200).json({
        success: true,

        message:
          columns.length > 0
            ? "Panel history database support is available"
            : "deleted_at column is missing from panels table",

        deleted_at_column_exists:
          columns.length > 0,
      });
    } catch (err) {
      console.error(
        "❌ PANEL HISTORY TEST ERROR:",
        err
      );

      return res.status(500).json({
        success: false,

        message:
          "Panel history database test failed",

        error:
          err.message,
      });
    }
  }
);

// ==========================================================
// ROOT HEALTH CHECK
// ==========================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,

    message:
      "🚀 PowerHouse API Running...",

    port:
      process.env.PORT || 5000,

    server_time:
      new Date().toISOString(),
  });
});

// ==========================================================
// 404 API HANDLER
// MUST ALWAYS STAY AFTER ALL API ROUTES
// ==========================================================

app.use(
  "/api",
  (req, res) => {
    return res.status(404).json({
      success: false,
      message: "API route not found",
      method: req.method,
      path: req.originalUrl,
    });
  }
);

// ==========================================================
// GLOBAL ERROR HANDLER
// ==========================================================

app.use(
  (err, req, res, next) => {
    console.error(
      "🔥 Global Error:",
      err
    );

    if (
      err.message &&
      err.message.startsWith(
        "CORS blocked origin:"
      )
    ) {
      return res.status(403).json({
        success: false,
        message: err.message,
      });
    }

    if (
      err.message &&
      err.message.startsWith(
        "Socket.IO CORS blocked origin:"
      )
    ) {
      return res.status(403).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(
      err.status || 500
    ).json({
      success: false,

      message:
        err.message ||
        "Something went wrong",
    });
  }
);

// ==========================================================
// START SERVER
// ==========================================================

const PORT =
  process.env.PORT || 5000;

server.listen(
  PORT,
  () => {
    console.log("");

    console.log(
      "=========================================="
    );

    console.log(
      "⚡ POWERHOUSE BACKEND SERVER"
    );

    console.log(
      "=========================================="
    );

    console.log(
      `🚀 Server running on port ${PORT}`
    );

    console.log(
      `❤️ Health: http://localhost:${PORT}/`
    );

    console.log(
      `❤️ API Health: http://localhost:${PORT}/api/health`
    );

    console.log(
      `🌐 CORS Test: http://localhost:${PORT}/test-cors`
    );

    console.log(
      `🧪 DB Test: http://localhost:${PORT}/test-db`
    );

    console.log(
      `📁 Uploads Test: http://localhost:${PORT}/test-uploads`
    );

    console.log(
      `👥 Duty Test: http://localhost:${PORT}/test-duty-api`
    );

    console.log(
      `📊 Duty Summary: http://localhost:${PORT}/api/duty/summary`
    );

    console.log(
      `📅 Duty Staff: http://localhost:${PORT}/api/duty/staff?year=2026&month=7`
    );

    console.log(
      `⚡ Panel Test: http://localhost:${PORT}/test-panels-api`
    );

    console.log(
      `📦 Panel History DB Test: http://localhost:${PORT}/test-panel-history-api`
    );

    console.log(
      `📋 Panels API: http://localhost:${PORT}/api/panels`
    );

    console.log(
      `🗃️ Panel History API: http://localhost:${PORT}/api/panels/history/deleted`
    );

    console.log(
      "=========================================="
    );

    console.log(
      "✅ Staff Duty API mounted at /api/duty"
    );

    console.log(
      "✅ Static uploads mounted at /uploads"
    );

    console.log(
      "=========================================="
    );

    console.log("");
  }
);