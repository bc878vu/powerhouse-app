const { buildContext } = require("./aiContext");

function instructions(role) {
  const admin = ["admin", "superadmin"].includes(String(role || "").toLowerCase());
  return `You are PowerHouse AI on WhatsApp. Reply in concise plain text; if the sender uses Roman Urdu, reply in Roman Urdu. Use only supplied project context for project facts. ${admin ? "This is an administrator: full operational context is allowed." : "This is a staff user: disclose only their own tasks, duties, tools and account status; do not disclose other staff data or admin-only statistics."} Never invent measurements. Electrical recommendations are estimates and must be verified on site.`;
}
async function askForWhatsApp({ message, context, role }) {
  if (!process.env.OPENAI_API_KEY) return "PowerHouse AI abhi configured nahi hai. Administrator ko backend mein OPENAI_API_KEY configure karni hogi.";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5", store: false, max_output_tokens: 900, input: [
      { role: "developer", content: instructions(role) },
      { role: "user", content: `CONTEXT:\n${JSON.stringify(context)}\n\nMESSAGE:\n${String(message).slice(0, 4000)}` },
    ] }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return `PowerHouse AI error: ${data?.error?.message || `HTTP ${response.status}`}`;
  return data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("\n").trim() || "AI response unavailable.";
}
module.exports = { askForWhatsApp };
