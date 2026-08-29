import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const isAdminRole = (role) => ["admin", "superadmin"].includes(String(role || "").toLowerCase());
const cleanText = (value, max = 500) => String(value || "").trim().slice(0, max);
const clean = (value, depth = 0) => {
  if (depth > 3) return "[truncated]";
  if (value === undefined || value === null) return value;
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 120).map((item) => clean(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 80).map(([k, v]) => [k, clean(v, depth + 1)]));
  return value;
};
async function getUserByUid(uid) {
  const direct = await db.collection("powerhouse_users").doc(String(uid)).get();
  if (direct.exists) return { id: direct.id, ...direct.data() };
  const query = await db.collection("powerhouse_users").where("uid", "==", String(uid)).limit(1).get();
  return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
}
async function readCollection(name, max = 120) {
  try { const snap = await db.collection(name).limit(max).get(); return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })); }
  catch { return []; }
}
function taskBelongsTo(task, uid) {
  const ids = task.assigned_user_ids || task.user_ids || [];
  const list = Array.isArray(ids) ? ids : [ids];
  return list.some((item) => String(item?.id || item?.uid || item?.user_id || item) === String(uid)) || String(task.user_id || "") === String(uid);
}
async function buildContext(user) {
  const adminUser = isAdminRole(user.role);
  const [panels, routes, tasks, duties, tools, activities, entries, wapda, services, machines] = await Promise.all([
    readCollection("powerhouse_panels"), readCollection("powerhouse_panel_routes"), readCollection("tasks", 160), readCollection("duties", 100), readCollection("tools", 100), readCollection("activities"), readCollection("entries"), readCollection("wapdaReadings"), readCollection("engineServiceLogs", 100), readCollection("powerhouse_machines", 100)
  ]);
  const uid = user.uid || user.id;
  return clean({ generatedAt: new Date().toISOString(), access: adminUser ? "admin_full" : "user_limited", currentUser: { uid, name: user.name || user.displayName || null, role: user.role || "user" }, panels: panels.filter((p) => p.is_deleted !== true), routes, tasks: adminUser ? tasks : tasks.filter((x) => taskBelongsTo(x, uid)), duties: adminUser ? duties : duties.filter((x) => String(x.user_id || x.assigned_user_id || x.uid || "") === String(uid)), tools: adminUser ? tools : tools.filter((x) => String(x.user_id || x.assigned_user_id || x.uid || "") === String(uid)), fuelEntries: adminUser ? entries : entries.filter((x) => String(x.userId || x.uid || "") === String(uid)), wapdaReadings: adminUser ? wapda : [], engineServiceLogs: adminUser ? services : [], activities: adminUser ? activities : [], machines: adminUser ? machines : [] });
}
function systemPrompt(adminUser) {
  return `You are PowerHouse AI, an operational assistant for an industrial power-house management system. Answer in the user's language (Roman Urdu/Urdu/English) and keep answers practical and structured. Use only the supplied project context for project-specific facts. Never invent live readings, fuel stock, task status, electrical ratings, maintenance dates, machine states, panel states, or staff information. ${adminUser ? "The user is an admin and may receive the full operational context supplied to you." : "The user is a staff account; never reveal other staff members' private information or admin-only operational datasets."} For electrical or maintenance advice, distinguish observations from recommendations and advise verification against equipment nameplates, drawings, manufacturer instructions, and applicable safety procedures.`;
}
function parseImage(imageData) {
  const match = String(imageData || "").match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
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
    const context = await buildContext({ ...user, uid: decoded.uid });
    const parts = [{ text: `PROJECT CONTEXT:\n${JSON.stringify(context)}\n\nUSER QUESTION:\n${question || "Analyze the uploaded image and relate it to the supplied PowerHouse operational context."}` }];
    const image = parseImage(imageData);
    if (image) parts.push({ inlineData: image });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(isAdminRole(user.role)) }] }, contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 1200) } })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Gemini request failed." });
    const answer = String((data?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []).map((part) => part?.text || "").join("\n")).trim();
    if (!answer) return res.status(502).json({ error: "Gemini returned an empty response." });
    return res.status(200).json({ answer, access: isAdminRole(user.role) ? "admin_full" : "user_limited" });
  } catch (error) {
    console.error("PowerHouse AI API error", error?.message);
    return res.status(500).json({ error: error?.message || "PowerHouse AI could not complete the request." });
  }
}
