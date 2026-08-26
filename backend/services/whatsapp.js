const crypto = require("crypto");

function configured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}
function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw.replace(/[^+\d]/g, "")}`;
}
function adminNumbers() {
  return String(process.env.ADMIN_WHATSAPP_NUMBERS || "").split(",").map(normalizePhone).filter(Boolean);
}
async function sendWhatsApp(to, body) {
  if (!configured()) return { sent: false, skipped: true, reason: "WhatsApp credentials are not configured." };
  const destination = normalizePhone(to);
  if (!destination) return { sent: false, skipped: true, reason: "Recipient WhatsApp number is missing." };
  const params = new URLSearchParams({ From: normalizePhone(process.env.TWILIO_WHATSAPP_FROM), To: destination, Body: String(body || "").slice(0, 4000) });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Twilio request failed (${response.status}).`);
  return { sent: true, sid: data.sid, status: data.status };
}
function verifyTwilioSignature(req) {
  if (String(process.env.TWILIO_VALIDATE_SIGNATURE || "true").toLowerCase() === "false") return true;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get("X-Twilio-Signature");
  if (!token || !signature) return false;
  const baseUrl = `${String(process.env.PUBLIC_BACKEND_URL || "").replace(/\/$/, "")}/api/whatsapp/webhook`;
  const params = Object.keys(req.body || {}).sort().reduce((acc, key) => acc + key + req.body[key], baseUrl);
  const expected = crypto.createHmac("sha1", token).update(params).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
function adminReport(context, answer) {
  const summary = context.summary || {};
  return `⚡ POWERHOUSE ADMIN AI\n\n${answer}\n\nSystem snapshot: Panels ${summary.panelCount ?? 0} | Routes ${summary.routeCount ?? 0} | Tasks ${summary.taskCount ?? 0} | Duties ${summary.dutyCount ?? 0} | Tools ${summary.toolCount ?? 0}`.slice(0, 4000);
}
function userReport(context, answer) {
  const user = context.currentUser || {};
  const summary = context.summary || {};
  return `⚡ PowerHouse\n\n${answer}\n\nYour account: ${user.name || "User"} | Status: ${user.status || "active"} | Your tasks: ${summary.taskCount ?? 0}`.slice(0, 2500);
}
module.exports = { configured, normalizePhone, adminNumbers, sendWhatsApp, verifyTwilioSignature, adminReport, userReport };
