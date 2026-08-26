const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { buildContext } = require("../services/aiContext");
const { adminNumbers, sendWhatsApp, adminReport, userReport } = require("../services/whatsapp");

const query = (sql, values = []) => new Promise((resolve, reject) => db.query(sql, values, (err, rows) => err ? reject(err) : resolve(rows || [])));
const roleOf = (req) => String(req.headers["x-user-role"] || req.headers.role || "").toLowerCase();
const userIdOf = (req) => String(req.headers["x-user-id"] || req.headers["x-userid"] || "").trim();
const isAdmin = (role) => ["admin", "superadmin"].includes(String(role || "").toLowerCase());

function instructions(role) {
  return `You are PowerHouse AI, the operational assistant inside a factory PowerHouse Management Portal. Answer in the user's language; if they use Roman Urdu, use clear Roman Urdu. Use only the supplied project context for project-specific facts. Never invent readings, loads, fuel values, panel states, tasks or incidents. ${isAdmin(role) ? "The user is an administrator. They may receive full operational information from the supplied context, including staff/task summaries." : "The user is a normal staff account. Give only their own task/duty/tool/account information plus non-sensitive general panel/system guidance. Never disclose other staff names, phone numbers, emails, tasks, private profiles or admin-only statistics."} For electrical advice, clearly label estimates and recommend verification against site drawings, equipment nameplates and applicable electrical standards. Be concise but useful. If data is missing, say exactly what is missing.`;
}

async function askAI({ message, context, role }) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error("OPENAI_API_KEY is not configured on the backend."), { statusCode: 503 });
  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-5",
    input: [
      { role: "developer", content: instructions(role) },
      { role: "user", content: `PROJECT CONTEXT:\n${JSON.stringify(context)}\n\nUSER QUESTION:\n${String(message || "").slice(0, 6000)}` },
    ],
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 1200),
    store: false,
  };
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI request failed (${response.status}).`), { statusCode: response.status });
  const answer = data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("\n").trim();
  return answer || "AI ne koi readable response return nahi kiya.";
}

router.get("/status", (_req, res) => res.json({ success: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY), whatsappConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) }));

router.post("/chat", async (req, res) => {
  try {
    const role = roleOf(req); const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: "Login is required for PowerHouse AI." });
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ success: false, message: "Please enter a question." });
    const context = await buildContext({ userId, role });
    const answer = await askAI({ message, context, role });
    return res.json({ success: true, answer, scope: isAdmin(role) ? "admin_full" : "user_limited" });
  } catch (error) {
    console.error("AI CHAT ERROR", error);
    return res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || "AI request failed." });
  }
});

router.post("/send-report", async (req, res) => {
  try {
    const role = roleOf(req); const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, message: "Login is required." });
    const context = await buildContext({ userId, role });
    if (isAdmin(role)) {
      const recipients = adminNumbers();
      if (!recipients.length) return res.status(400).json({ success: false, message: "ADMIN_WHATSAPP_NUMBERS is not configured." });
      const answer = await askAI({ message: String(req.body?.message || "Prepare a concise full PowerHouse operational report for the administrator."), context, role });
      const results = await Promise.all(recipients.map((number) => sendWhatsApp(number, adminReport(context, answer))));
      return res.json({ success: true, sent: results.length, results });
    }
    const rows = await query("SELECT phone FROM users WHERE id = ? LIMIT 1", [Number(userId)]);
    const phone = rows[0]?.phone;
    if (!phone) return res.status(400).json({ success: false, message: "Your account does not have a WhatsApp phone number." });
    const answer = await askAI({ message: String(req.body?.message || "Prepare a short personal PowerHouse status update for this staff member."), context, role });
    const result = await sendWhatsApp(phone, userReport(context, answer));
    return res.json({ success: true, sent: result.sent, result });
  } catch (error) {
    console.error("AI WHATSAPP REPORT ERROR", error);
    return res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || "WhatsApp report failed." });
  }
});

module.exports = router;
