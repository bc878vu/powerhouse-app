import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const isAdminRole = (role) => ["admin", "superadmin"].includes(String(role || "").toLowerCase());
const cleanText = (value, max = 12000) => String(value || "").trim().slice(0, max);
const clean = (value, depth = 0) => {
  if (depth > 5) return "[nested data omitted]";
  if (value === undefined || value === null) return value;
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") return value.length > 1800 ? `${value.slice(0, 1800)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 250).map((item) => clean(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 120).map(([k, v]) => [k, clean(v, depth + 1)]));
  return value;
};
const PRIVATE_COLLECTIONS = new Set(["powerhouse_users", "users", "powerhouse_fcm_tokens", "powerhouse_public_fcm_tokens", "sessions", "secrets", "api_keys", "credentials"]);
const USER_FILTERED = new Set(["tasks", "duties", "tools", "entries", "activities"]);
const CORE_COLLECTIONS = ["powerhouse_panels", "powerhouse_panel_routes", "tasks", "duties", "tools", "activities", "entries", "wapdaReadings", "engineServiceLogs", "powerhouse_machines", "powerhouse_settings", "powerhouse_alert_state", "powerhouse_alert_events", "powerhouse_alert_delivery"];

async function getUserByUid(uid) {
  const direct = await db.collection("powerhouse_users").doc(String(uid)).get();
  if (direct.exists) return { id: direct.id, ...direct.data() };
  const query = await db.collection("powerhouse_users").where("uid", "==", String(uid)).limit(1).get();
  return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
}
async function readCollection(name, max = 250) {
  try {
    const snap = await db.collection(name).limit(max).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) { console.warn(`AI skipped collection ${name}:`, error?.message); return []; }
}
function taskBelongsTo(record, uid) {
  const ids = record.assigned_user_ids || record.user_ids || record.assignedUsers || [];
  const list = Array.isArray(ids) ? ids : [ids];
  return list.some((item) => String(item?.id || item?.uid || item?.user_id || item) === String(uid)) || String(record.user_id || record.userId || record.assigned_user_id || record.uid || "") === String(uid);
}
function tokenize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").split(/\s+/).filter((x) => x.length > 1);
}
function relevanceScore(record, terms) {
  if (!terms.length) return 0;
  const haystack = JSON.stringify(clean(record)).toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
function prioritize(records, question, limit = 140) {
  const terms = tokenize(question);
  return [...records].sort((a, b) => relevanceScore(b, terms) - relevanceScore(a, terms)).slice(0, limit);
}
async function discoverCollections(adminUser) {
  if (!adminUser) return CORE_COLLECTIONS;
  try {
    const discovered = await db.listCollections();
    return [...new Set([...CORE_COLLECTIONS, ...discovered.map((item) => item.id)])].filter((name) => !PRIVATE_COLLECTIONS.has(name));
  } catch { return CORE_COLLECTIONS; }
}
function scopeRecords(name, records, user, adminUser) {
  if (adminUser) return records;
  if (!USER_FILTERED.has(name)) return [];
  const uid = user.uid || user.id;
  if (name === "tasks") return records.filter((item) => taskBelongsTo(item, uid));
  return records.filter((item) => String(item.user_id || item.userId || item.assigned_user_id || item.assignedUserId || item.uid || "") === String(uid));
}
async function buildContext(user, question) {
  const adminUser = isAdminRole(user.role);
  const names = await discoverCollections(adminUser);
  const loaded = await Promise.all(names.map(async (name) => [name, scopeRecords(name, await readCollection(name), user, adminUser)]));
  const datasets = {};
  for (const [name, records] of loaded) {
    if (!records.length) continue;
    const filtered = prioritize(records, question, adminUser ? 180 : 120);
    datasets[name] = clean(filtered);
  }
  const counts = Object.fromEntries(loaded.map(([name, records]) => [name, records.length]));
  return clean({
    generatedAt: new Date().toISOString(),
    access: adminUser ? "admin_full_operational" : "user_permitted_operational",
    currentUser: { uid: user.uid || user.id, name: user.name || user.displayName || null, role: user.role || "user" },
    availableCollections: Object.keys(datasets),
    recordCounts: counts,
    data: datasets
  });
}
function systemPrompt(adminUser) {
  return `You are PowerHouse AI, a highly capable operational intelligence assistant for an industrial power-house management system.

You receive live operational records from the application's accessible Firestore modules. Before answering, understand the user's intent, search mentally across the supplied datasets, connect related records where IDs, names, routes, machine codes, panel codes, task references or dates match, and give the most relevant complete answer.

DATA RULES:
- Use supplied project context for project-specific facts. Never invent missing readings, stock, statuses, dates, ratings, staff details or maintenance history.
- If the answer is not present in the supplied data, say clearly: "Is record mein yeh information available nahi hai." Then state what related data is available.
- Do not claim that every record was manually inspected. Say which modules or matching records support the answer when useful.
- For broad questions such as "overall status", combine relevant modules instead of answering from only one collection.
- For a specific task, machine, panel, fuel entry, service, route, duty, tool, alert or reading, return the useful fields in a natural order and explain relationships to other matching records.
- ${adminUser ? "This user is an administrator. Use all non-sensitive operational collections supplied in the context." : "This user is not an administrator. Never reveal data outside the supplied permitted records."}

WRITING STYLE:
- Answer in the user's language. Prefer simple Roman Urdu when the user writes Roman Urdu; use Urdu or English when requested.
- Write naturally for a person, not like a raw database export.
- Never output Markdown symbols such as **, ###, backticks, --- or table syntax.
- Use short clear headings and normal numbered points only when they improve understanding.
- Start with a direct answer, then important details, then recommendations if needed.
- Avoid unnecessary repetition, vague disclaimers and technical jargon.
- Keep field labels readable, for example: "Task number: 35" instead of raw JSON or code formatting.

SAFETY:
For electrical or maintenance advice, clearly separate what the record says from what should be checked, and recommend verification against equipment nameplates, drawings, manufacturer instructions and applicable safety procedures.`;
}
function parseImage(imageData) {
  const match = String(imageData || "").match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i);
  return match ? { mimeType: match[1], data: match[2] } : null;
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Firebase login required." });
    const decoded = await admin.auth().verifyIdToken(token);
    const user = await getUserByUid(decoded.uid);
    if (!user) return res.status(403).json({ error: "PowerHouse user profile not found." });
    const question = cleanText(req.body?.message, 10000);
    const imageData = req.body?.imageData ? String(req.body.imageData) : "";
    if (!question && !imageData) return res.status(400).json({ error: "Message or image is required." });
    if (imageData && (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(imageData) || imageData.length > 7_000_000)) return res.status(400).json({ error: "Unsupported or oversized image." });
    const key = String(process.env.GEMINI_API_KEY || "").trim();
    if (!key) return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
    const model = String(process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();
    const context = await buildContext({ ...user, uid: decoded.uid }, question);
    const parts = [{ text: `POWERHOUSE OPERATIONAL CONTEXT:\n${JSON.stringify(context)}\n\nUSER QUESTION:\n${question || "Analyze the uploaded image and relate it to the PowerHouse operational context."}` }];
    const image = parseImage(imageData);
    if (image) parts.push({ inlineData: image });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(isAdminRole(user.role)) }] }, contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 1800), temperature: 0.25 } })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Gemini request failed." });
    const answer = String((data?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []).map((part) => part?.text || "").join("\n")).trim();
    if (!answer) return res.status(502).json({ error: "Gemini returned an empty response." });
    return res.status(200).json({ answer, access: isAdminRole(user.role) ? "admin_full_operational" : "user_permitted_operational", modules: Object.keys(context.data || {}) });
  } catch (error) {
    console.error("PowerHouse AI API error", error?.message);
    return res.status(500).json({ error: error?.message || "PowerHouse AI could not complete the request." });
  }
}
