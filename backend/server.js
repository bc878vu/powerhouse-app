require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./config/db");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
server.keepAliveTimeout = 60000; server.headersTimeout = 65000;
process.on("uncaughtException",(err)=>console.error("🔥 UNCAUGHT EXCEPTION:",err));process.on("unhandledRejection",(err)=>console.error("🔥 UNHANDLED REJECTION:",err));
const allowedOrigins=["http://localhost:5173","http://127.0.0.1:5173","https://powerhouse-app-eight.vercel.app",process.env.FRONTEND_URL].filter(Boolean),uniqueAllowedOrigins=[...new Set(allowedOrigins)];
const corsOptions={origin:(origin,callback)=>{if(!origin)return callback(null,true);if(uniqueAllowedOrigins.includes(origin))return callback(null,true);console.warn("⚠️ CORS blocked origin:",origin);return callback(new Error(`CORS blocked origin: ${origin}`));},methods:["GET","POST","PUT","PATCH","DELETE","OPTIONS"],allowedHeaders:["Origin","X-Requested-With","Content-Type","Accept","Authorization","role","Role","x-user-id","X-User-Id","x-user-role","X-User-Role","x-auth-token","X-Auth-Token"],exposedHeaders:["Content-Disposition","Content-Length"],credentials:true,optionsSuccessStatus:204,preflightContinue:false};
app.use(cors(corsOptions));app.use((req,res,next)=>{const origin=req.headers.origin;if(origin&&uniqueAllowedOrigins.includes(origin))res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Access-Control-Allow-Methods","GET, POST, PUT, PATCH, DELETE, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Origin, X-Requested-With, Content-Type, Accept, Authorization, role, Role, x-user-id, X-User-Id, x-user-role, X-User-Role, x-auth-token, X-Auth-Token");res.setHeader("Access-Control-Expose-Headers","Content-Disposition, Content-Length");if(req.method==="OPTIONS")return res.sendStatus(204);next()});
app.use(express.json({limit:"50mb"}));app.use(express.urlencoded({extended:true,limit:"50mb"}));// Log only the pathname. Query strings can contain download tokens or personal data.
app.use((req,res,next)=>{console.log(`📥 ${req.method} ${req.path}`);next()});
// Deployment-controlled protection for legacy /uploads URLs.
// Turn on only after attachment clients are migrated to send ID tokens.
// Never accept identity or authorization from x-user-id / role headers.
const privateUploadsEnabled = process.env.PRIVATE_UPLOADS_ENABLED === "true";
async function authorizePrivateUpload(req, res, next) {
  if (!privateUploadsEnabled) return next();
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return res.status(401).json({ success: false, message: "Authentication required for attachments" });
  try {
    const admin = require("./firebaseAdmin");
    if (!admin.apps.length) return res.status(503).json({ success: false, message: "Attachment authentication unavailable" });
    const decoded = await admin.auth().verifyIdToken(token);
    const doc = await admin.firestore().collection("powerhouse_users").doc(decoded.uid).get();
    const profile = doc.exists ? doc.data() : null;
    if (profile && ["inactive", "blocked"].includes(String(profile.status || "").toLowerCase())) {
      return res.status(403).json({ success: false, message: "Account disabled" });
    }
    if (!profile) return res.status(403).json({ success: false, message: "Staff profile required" });
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, message: "Invalid or expired authentication" });
  }
}
app.use("/uploads", authorizePrivateUpload);
const uploadDir=path.resolve(__dirname,"uploads");if(!fs.existsSync(uploadDir))fs.mkdirSync(uploadDir,{recursive:true});app.use("/uploads",(req,res,next)=>{const origin=req.headers.origin;if(origin&&uniqueAllowedOrigins.includes(origin))res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Cross-Origin-Resource-Policy","cross-origin");res.setHeader("Cache-Control","no-cache, no-store, must-revalidate");res.setHeader("Pragma","no-cache");res.setHeader("Expires","0");next()});app.use("/uploads",express.static(uploadDir,{fallthrough:true,setHeaders:(res)=>{res.setHeader("Cross-Origin-Resource-Policy","cross-origin");res.setHeader("Cache-Control","no-cache, no-store, must-revalidate")}}));app.use("/uploads",(req,res)=>res.status(404).json({success:false,message:"Upload file not found",requested_path:req.originalUrl}));
const io=new Server(server,{cors:{origin:(origin,callback)=>{if(!origin)return callback(null,true);if(uniqueAllowedOrigins.includes(origin))return callback(null,true);return callback(new Error(`Socket.IO CORS blocked origin: ${origin}`))},methods:["GET","POST"],allowedHeaders:["Origin","Content-Type","Authorization","role","x-user-id","X-User-Id"],credentials:true},transports:["websocket","polling"]});app.set("io",io);
// Socket events must never trust arbitrary room names or client-originated task updates.
// Unauthenticated users can connect, but cannot subscribe to private events.
const firebaseAdmin = require("./firebaseAdmin");
async function socketIdentity(socket) {
  if (!firebaseAdmin.apps.length) return null;
  const raw = String(socket.handshake.auth?.token || "").replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  try {
    const decoded = await firebaseAdmin.auth().verifyIdToken(raw);
    const doc = await firebaseAdmin.firestore().collection("powerhouse_users").doc(decoded.uid).get();
    const profile = doc.exists ? doc.data() : null;
    if (!profile || ["blocked", "inactive"].includes(String(profile.status || "").toLowerCase())) return null;
    const admin = ["admin", "superadmin"].includes(String(profile.role || "").toLowerCase()) ||
      String(decoded.email || "").toLowerCase() === "admin@powerhouse.com";
    return { uid: decoded.uid, admin };
  } catch (error) {
    console.warn("Socket authentication rejected:", error.code || error.message);
    return null;
  }
}
io.on("connection", socket => {
  let identityPromise = socketIdentity(socket);
  socket.on("joinUser", async userId => {
    const identity = await identityPromise;
    if (identity && String(userId) === identity.uid) socket.join("user_" + identity.uid);
  });
  socket.on("joinAdmin", async () => {
    const identity = await identityPromise;
    if (identity?.admin) socket.join("admins");
  });
  socket.on("joinPanelMonitoring", async () => {
    const identity = await identityPromise;
    if (identity) socket.join("panel_monitoring");
  });
  // Task notifications are emitted only by trusted backend routes using io.
  // Accepting client-supplied taskAssigned/taskUpdate broadcasts would enable spoofing.
  socket.emit("connected", "Welcome Client");
});
const userCompatRoutes=require("./routes/userCompat"),userRoutes=require("./routes/user"),authRoutes=require("./routes/auth"),taskRoutes=require("./routes/task"),taskCompatRoutes=require("./routes/taskCompat"),activityRoutes=require("./routes/activity"),taskFastRoutes=require("./routes/taskFast"),activityFastRoutes=require("./routes/activityFast"),toolsRoutes=require("./routes/tools"),mcpRoutes=require("./routes/mcp"),panelRoutes=require("./routes/panels"),dutyRoutes=require("./routes/duty"),taskFirebaseFallback=require("./routes/taskFirebaseFallback"),notificationRoutes=require("./routes/notifications"),aiRoutes=require("./routes/ai"),whatsappRoutes=require("./routes/whatsapp"),machineImageRoutes=require("./routes/machineImage");
app.use("/api",mcpRoutes);app.use("/api/user",userCompatRoutes);app.use("/api/user",userRoutes);app.use("/api/auth",authRoutes);app.get("/api/task/:id",taskFirebaseFallback);app.use("/api/task",taskFastRoutes);app.use("/api/task",taskRoutes);app.use("/api/task-compat",taskCompatRoutes);app.use("/api/tasks",taskRoutes);app.use("/api/activity",activityFastRoutes);app.use("/api/activity",activityRoutes);app.use("/api/tools",toolsRoutes);app.use("/api/panels",panelRoutes);app.use("/api/duty",dutyRoutes);app.use("/api/notifications",notificationRoutes);app.use("/api/ai",aiRoutes);app.use("/api/whatsapp",whatsappRoutes);app.use("/api/machine-image",machineImageRoutes);
app.get("/test-db",async(req,res)=>{try{const[rows]=await db.promise().query("SELECT 1 AS database_test");return res.status(200).json({success:true,msg:"DB OK",result:rows})}catch(err){console.error("❌ DB TEST ERROR:",err);return res.status(500).json({success:false,error:err.message})}});app.get("/test-cors",(req,res)=>res.status(200).json({success:true,message:"CORS is working correctly",origin:req.headers.origin||null,user_id:req.headers["x-user-id"]||null,role:req.headers.role||null,time:new Date().toISOString()}));app.use((req,res)=>res.status(404).json({success:false,message:"API route not found",method:req.method,path:req.originalUrl}));
const PORT=Number(process.env.PORT)||5000;server.listen(PORT,"0.0.0.0",()=>{console.log("============================================================");console.log(`🚀 PowerHouse backend running on port ${PORT}`);console.log("✅ Canonical task router mounted at /api/task");console.log("🤖 PowerHouse AI mounted at /api/ai");console.log("📱 WhatsApp integration mounted at /api/whatsapp");console.log("============================================================")});module.exports={app,server,io};
