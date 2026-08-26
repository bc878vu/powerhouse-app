const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { buildContext } = require("../services/aiContext");
const { sendWhatsApp, verifyTwilioSignature, adminNumbers, adminReport, userReport } = require("../services/whatsapp");
const { askForWhatsApp } = require("../services/whatsappAi");

const query = (sql, values = []) => new Promise((resolve, reject) => db.query(sql, values, (err, rows) => err ? reject(err) : resolve(rows || [])));
const normalize = (value) => String(value || "").replace(/^whatsapp:/i, "").replace(/[^+\d]/g, "");
const roleFrom = (req) => String(req.headers["x-user-role"] || req.headers.role || "").toLowerCase();
const isAdmin = (role) => ["admin", "superadmin"].includes(role);

router.get("/status", (_req, res) => res.json({ success: true, configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM), adminRecipients: adminNumbers().length }));

router.post("/send", async (req, res) => {
  try {
    const role = roleFrom(req); const userId = String(req.headers["x-user-id"] || "");
    if (!userId) return res.status(401).json({ success: false, message: "Login is required." });
    const context = await buildContext({ userId, role });
    let to = req.body?.to;
    if (isAdmin(role)) {
      if (!to) to = adminNumbers()[0];
      if (!to) return res.status(400).json({ success: false, message: "WhatsApp recipient is not configured." });
    } else {
      const rows = await query("SELECT phone FROM users WHERE id = ? LIMIT 1", [Number(userId)]);
      to = rows[0]?.phone;
      if (!to) return res.status(400).json({ success: false, message: "Your account does not have a WhatsApp number." });
    }
    const body = String(req.body?.message || (isAdmin(role) ? adminReport(context, "PowerHouse report requested from the portal.") : userReport(context, "Your PowerHouse update was requested from the portal."))).slice(0, 4000);
    const result = await sendWhatsApp(to, body);
    res.json({ success: true, result });
  } catch (error) { res.status(500).json({ success: false, message: error.message || "WhatsApp send failed." }); }
});

router.post("/webhook", async (req, res) => {
  try {
    if (!verifyTwilioSignature(req)) return res.status(403).type("text/plain").send("Forbidden");
    const from = normalize(req.body?.From); const message = String(req.body?.Body || "").trim();
    if (!from || !message) return res.type("text/plain").send("OK");
    const admins = adminNumbers().map(normalize);
    const admin = admins.includes(from);
    let user = null;
    if (!admin) {
      const rows = await query("SELECT id,name,role,phone,status FROM users WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(','') LIKE ? LIMIT 1", [`%${from.replace(/^\+/, "").slice(-10)}%`]);
      user = rows[0] || null;
    }
    if (!admin && !user) return res.type("text/plain").send("This WhatsApp number is not linked to a PowerHouse account.");
    const role = admin ? "admin" : String(user.role || "electrician");
    const userId = admin ? String(process.env.AI_ADMIN_CONTEXT_USER_ID || user?.id || "1") : String(user.id);
    const context = await buildContext({ userId, role });
    const answer = await askForWhatsApp({ message, context, role });
    const body = admin ? adminReport(context, answer) : userReport(context, answer);
    const result = await sendWhatsApp(from, body);
    console.log("📱 WhatsApp AI reply:", result);
    return res.type("text/plain").send("OK");
  } catch (error) {
    console.error("WHATSAPP WEBHOOK ERROR", error);
    return res.type("text/plain").send("PowerHouse AI could not process the request.");
  }
});
module.exports = router;
