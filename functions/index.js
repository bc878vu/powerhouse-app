const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const REGION = "us-central1";
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const OPENAI_MODEL = defineString("OPENAI_MODEL", { default: "gpt-5" });
const OPENAI_MAX_OUTPUT_TOKENS = defineString("OPENAI_MAX_OUTPUT_TOKENS", { default: "1200" });

const clean = (value, depth = 0) => {
  if (depth > 3) return "[truncated]";
  if (value === undefined || value === null) return value;
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 120).map((item) => clean(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 80).map(([k, v]) => [k, clean(v, depth + 1)]));
  return value;
};
const isAdminRole = (role) => ["admin", "superadmin"].includes(String(role || "").toLowerCase());
const cleanText = (value, max = 500) => String(value || "").trim().slice(0, max);

async function getUserByUid(uid) {
  if (!uid) return null;
  const snap = await db.collection("powerhouse_users").doc(String(uid)).get();
  if (snap.exists) return { id: snap.id, ...snap.data() };
  const query = await db.collection("powerhouse_users").where("uid", "==", String(uid)).limit(1).get();
  return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
}
async function requireAdmin(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Firebase login required.");
  const user = await getUserByUid(request.auth.uid);
  if (!user || !isAdminRole(user.role)) throw new HttpsError("permission-denied", "Admin access required.");
  return user;
}
async function readCollection(name, max = 120) {
  try { const snap = await db.collection(name).limit(max).get(); return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })); }
  catch (error) { logger.warn(`Collection ${name} skipped`, error.message); return []; }
}
function taskBelongsTo(task, uid) {
  const ids = task.assigned_user_ids || task.user_ids || [];
  const list = Array.isArray(ids) ? ids : [ids];
  return list.some((item) => String(item?.id || item?.uid || item?.user_id || item) === String(uid)) || String(task.user_id || "") === String(uid);
}
async function buildContext(user, roleOverride) {
  const role = roleOverride || user?.role || "user";
  const adminUser = isAdminRole(role);
  const [panels, routes, tasks, duties, tools, activities, entries, wapda, services] = await Promise.all([
    readCollection("powerhouse_panels", 120), readCollection("powerhouse_panel_routes", 120), readCollection("tasks", 160), readCollection("duties", 100), readCollection("tools", 100), readCollection("activities", 120), readCollection("entries", 120), readCollection("wapdaReadings", 120), readCollection("engineServiceLogs", 100)
  ]);
  const scopedTasks = adminUser ? tasks : tasks.filter((item) => taskBelongsTo(item, user?.uid || user?.id));
  const scopedDuties = adminUser ? duties : duties.filter((item) => String(item.user_id || item.assigned_user_id || item.uid || "") === String(user?.uid || user?.id));
  const scopedTools = adminUser ? tools : tools.filter((item) => String(item.user_id || item.assigned_user_id || item.uid || "") === String(user?.uid || user?.id));
  const scopedEntries = adminUser ? entries : entries.filter((item) => String(item.userId || item.uid || "") === String(user?.uid || user?.id));
  return clean({ generatedAt: new Date().toISOString(), access: adminUser ? "admin_full" : "user_limited", currentUser: { uid: user?.uid || user?.id || null, name: user?.name || user?.displayName || null, role, employeeID: user?.employeeID || null, status: user?.status || null, phone: user?.phone || null }, summary: { panelCount: panels.filter((p) => p.is_deleted !== true).length, routeCount: routes.length, taskCount: scopedTasks.length, dutyCount: scopedDuties.length, toolCount: scopedTools.length, fuelEntryCount: scopedEntries.length, wapdaReadingCount: adminUser ? wapda.length : 0, serviceLogCount: adminUser ? services.length : 0, activityCount: adminUser ? activities.length : 0 }, panels: panels.filter((p) => p.is_deleted !== true), routes, tasks: scopedTasks, duties: scopedDuties, tools: scopedTools, fuelEntries: scopedEntries, wapdaReadings: adminUser ? wapda : [], engineServiceLogs: adminUser ? services : [], activities: adminUser ? activities : [] });
}
function systemPrompt(adminUser) { return `You are PowerHouse AI, an operational assistant for an industrial power-house management system. Answer in the user's language (Roman Urdu/Urdu/English) and keep answers practical. Use only the supplied project context for project-specific facts. Never invent live readings, fuel stock, task status, electrical ratings, maintenance dates, or staff information. ${adminUser ? "The user is an admin and may receive the full operational context." : "The user is a staff account; never reveal other staff members' private information or admin-only operational datasets."} For electrical or maintenance advice, clearly distinguish observations from recommendations and advise verification against equipment nameplates, drawings, manufacturer instructions, and applicable safety procedures.`; }
async function askOpenAI(question, context, adminUser) {
  const key = OPENAI_API_KEY.value(); if (!key) throw new Error("OPENAI_API_KEY is not configured in Firebase Secret Manager.");
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: OPENAI_MODEL.value(), input: [{ role: "system", content: [{ type: "input_text", text: systemPrompt(adminUser) }] }, { role: "user", content: [{ type: "input_text", text: `PROJECT CONTEXT:\n${JSON.stringify(context)}\n\nUSER QUESTION:\n${question}` }] }], max_output_tokens: Number(OPENAI_MAX_OUTPUT_TOKENS.value()) || 1200 }) });
  const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status}).`);
  return data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("\n").trim() || "AI ne koi response generate nahi kiya.";
}
exports.aiChat = onCall({ region: REGION, secrets: [OPENAI_API_KEY] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Firebase login required.");
  const user = await getUserByUid(request.auth.uid); if (!user) throw new HttpsError("permission-denied", "PowerHouse user profile not found.");
  const question = String(request.data?.message || "").trim(); if (!question) throw new HttpsError("invalid-argument", "Message is required.");
  const adminUser = isAdminRole(user.role); const context = await buildContext({ ...user, uid: request.auth.uid }, user.role); const answer = await askOpenAI(question, context, adminUser);
  return { answer, access: adminUser ? "admin_full" : "user_limited" };
});
exports.aiStatus = onCall({ region: REGION, secrets: [OPENAI_API_KEY] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Firebase login required.");
  return { aiConfigured: Boolean(OPENAI_API_KEY.value()), whatsappConfigured: false };
});

async function getAlertSettings() {
  const d = (await db.doc("powerhouse_settings/alerts").get()).data() || {};
  return { enabled: d.enabled !== false && d.alertsEnabled !== false, threshold: Number(d.lowStockLevel ?? d.lowDieselThreshold ?? 0), repeatMinutes: Math.max(1, Number(d.repeatIntervalMinutes ?? d.repeatMinutes ?? 5) || 5), pushEnabled: d.pushEnabled !== false, silentMode: d.silentMode === true || d.silent === true };
}
function stockFromEntry(d) { return Number(d?.currentStock ?? d?.stock ?? d?.remainingStock ?? d?.closingStock); }
async function getCurrentStock() {
  const snap = await db.collection("entries").orderBy("createdAt", "desc").limit(1).get();
  return stockFromEntry(snap.docs[0]?.data());
}
async function getAllPushTokens() {
  const [userTokens, publicTokens] = await Promise.all([db.collection("powerhouse_fcm_tokens").get(), db.collection("powerhouse_public_fcm_tokens").get()]);
  const seen = new Set(); const out = [];
  for (const doc of [...userTokens.docs, ...publicTokens.docs]) { const token = String(doc.data()?.token || ""); if (token.length > 20 && !seen.has(token)) { seen.add(token); out.push({ ref: doc.ref, token }); } }
  return out;
}
async function sendPush(alert) {
  const targets = await getAllPushTokens(); if (!targets.length) return { sent: 0, failed: 0 };
  const data = { type: String(alert.type), alertId: String(alert.alertId), title: String(alert.title), body: String(alert.body), currentStock: String(alert.currentStock ?? 0), lowStockLevel: String(alert.lowStockLevel ?? 0), route: String(alert.route || "/") };
  const result = await admin.messaging().sendEachForMulticast({ tokens: targets.map((x) => x.token), data, webpush: { headers: { Urgency: "high" }, notification: { title: alert.title, body: alert.body, tag: `powerhouse-${alert.alertId}`, requireInteraction: true, renotify: true }, fcmOptions: { link: alert.route || "/" } }, android: { priority: "high", notification: { sound: "default", channelId: "powerhouse_alerts" } }, apns: { payload: { aps: { sound: "default", contentAvailable: true } } } });
  await Promise.all(result.responses.map((r, i) => !r.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(r.error?.code) ? targets[i].ref.delete().catch(() => {}) : null));
  return { sent: result.successCount, failed: result.failureCount };
}
async function publishAlert(input) {
  const alertId = cleanText(input.alertId || `alert-${Date.now()}`, 120);
  const payload = { active: true, alertId, type: cleanText(input.type || "manual", 40), title: cleanText(input.title || "POWERHOUSE ALERT", 120), body: cleanText(input.body || "Please check the PowerHouse dashboard."), currentStock: Number(input.currentStock ?? 0) || 0, lowStockLevel: Number(input.lowStockLevel ?? 0) || 0, route: cleanText(input.route || "/", 200), source: cleanText(input.source || "system", 100), createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + Math.max(1, Number(input.expiresMinutes || 60)) * 60000) };
  await db.doc("powerhouse_alert_state/current").set(payload, { merge: true });
  await db.collection("powerhouse_alert_events").doc(alertId).set(payload, { merge: true });
  const delivery = await sendPush(payload);
  await db.collection("powerhouse_alert_delivery").doc(alertId).set({ alertId, ...delivery, sentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { alertId, delivery };
}
exports.sendPowerhouseAlert = onCall({ region: REGION }, async (request) => {
  const user = await requireAdmin(request); const stock = await getCurrentStock();
  const result = await publishAlert({ alertId: `manual-${Date.now()}`, type: "manual", title: request.data?.title || "POWERHOUSE ALERT", body: request.data?.body || `Current diesel stock: ${Number.isFinite(stock) ? stock.toLocaleString() : "N/A"} L`, currentStock: request.data?.currentStock ?? stock ?? 0, lowStockLevel: request.data?.lowStockLevel ?? 0, route: request.data?.route || "/", expiresMinutes: request.data?.expiresMinutes ?? 60, source: `admin:${user.id}` });
  return { success: true, ...result };
});
exports.clearPowerhouseAlert = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request); await db.doc("powerhouse_alert_state/current").set({ active: false, clearedAt: admin.firestore.FieldValue.serverTimestamp(), clearedBy: request.auth.uid }, { merge: true }); return { success: true };
});
exports.autoLowDieselAlert = onDocumentWritten({ region: REGION, document: "entries/{entryId}" }, async (event) => {
  if (!event.data?.after.exists) return null; const stock = stockFromEntry(event.data.after.data()); if (!Number.isFinite(stock)) return null;
  const settings = await getAlertSettings(); if (!settings.enabled || settings.threshold <= 0 || stock > settings.threshold) return null;
  const current = (await db.doc("powerhouse_alert_state/current").get()).data() || {}; const last = current.createdAt?.toMillis?.() || 0;
  if (current.active === true && current.type === "low_diesel" && Date.now() - last < settings.repeatMinutes * 60000) return null;
  return publishAlert({ alertId: `low-diesel-${event.params.entryId}-${Date.now()}`, type: "low_diesel", title: "LOW DIESEL STOCK", body: `Current stock: ${stock.toLocaleString()} L | Alert level: ${settings.threshold.toLocaleString()} L`, currentStock: stock, lowStockLevel: settings.threshold, route: "/fuel-management", expiresMinutes: settings.repeatMinutes, source: "automatic" });
});
