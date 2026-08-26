const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const WHATSAPP_ACCESS_TOKEN = defineSecret("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_APP_SECRET = defineSecret("WHATSAPP_APP_SECRET");
const WHATSAPP_VERIFY_TOKEN = defineSecret("WHATSAPP_VERIFY_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const ADMIN_WHATSAPP_NUMBERS = defineSecret("ADMIN_WHATSAPP_NUMBERS");
const OPENAI_MODEL = defineString("OPENAI_MODEL", { default: "gpt-5" });
const OPENAI_MAX_OUTPUT_TOKENS = defineString("OPENAI_MAX_OUTPUT_TOKENS", { default: "1200" });
const REGION = "us-central1";

const clean = (value, depth = 0) => {
  if (depth > 3) return "[truncated]";
  if (value === undefined || value === null) return value;
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 120).map((item) => clean(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 80).map(([k, v]) => [k, clean(v, depth + 1)]));
  return value;
};

const normalizePhone = (value) => String(value || "").replace(/[^0-9]/g, "");
const isAdminRole = (role) => ["admin", "superadmin"].includes(String(role || "").toLowerCase());

async function getUserByUid(uid) {
  if (!uid) return null;
  const snap = await db.collection("powerhouse_users").doc(String(uid)).get();
  if (snap.exists) return { id: snap.id, ...snap.data() };
  const query = await db.collection("powerhouse_users").where("uid", "==", String(uid)).limit(1).get();
  return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
}

async function getUserByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const snap = await db.collection("powerhouse_users").get();
  const match = snap.docs.find((doc) => normalizePhone(doc.data()?.phone || doc.data()?.whatsapp || doc.data()?.whatsappNumber) === normalized);
  return match ? { id: match.id, ...match.data() } : null;
}

async function readCollection(name, max = 120) {
  try {
    const snap = await db.collection(name).limit(max).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    logger.warn(`Collection ${name} skipped`, error.message);
    return [];
  }
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
    readCollection("powerhouse_panels", 120),
    readCollection("powerhouse_panel_routes", 120),
    readCollection("tasks", 160),
    readCollection("duties", 100),
    readCollection("tools", 100),
    readCollection("activities", 120),
    readCollection("entries", 120),
    readCollection("wapdaReadings", 120),
    readCollection("engineServiceLogs", 100),
  ]);

  const scopedTasks = adminUser ? tasks : tasks.filter((item) => taskBelongsTo(item, user?.uid || user?.id));
  const scopedDuties = adminUser ? duties : duties.filter((item) => String(item.user_id || item.assigned_user_id || item.uid || "") === String(user?.uid || user?.id));
  const scopedTools = adminUser ? tools : tools.filter((item) => String(item.user_id || item.assigned_user_id || item.uid || "") === String(user?.uid || user?.id));
  const scopedEntries = adminUser ? entries : entries.filter((item) => String(item.userId || item.uid || "") === String(user?.uid || user?.id));

  return clean({
    generatedAt: new Date().toISOString(),
    access: adminUser ? "admin_full" : "user_limited",
    currentUser: {
      uid: user?.uid || user?.id || null,
      name: user?.name || user?.displayName || null,
      role,
      employeeID: user?.employeeID || null,
      status: user?.status || null,
      phone: user?.phone || null,
    },
    summary: {
      panelCount: panels.filter((p) => p.is_deleted !== true).length,
      routeCount: routes.length,
      taskCount: scopedTasks.length,
      dutyCount: scopedDuties.length,
      toolCount: scopedTools.length,
      fuelEntryCount: scopedEntries.length,
      wapdaReadingCount: adminUser ? wapda.length : 0,
      serviceLogCount: adminUser ? services.length : 0,
      activityCount: adminUser ? activities.length : 0,
    },
    panels: panels.filter((p) => p.is_deleted !== true),
    routes,
    tasks: scopedTasks,
    duties: scopedDuties,
    tools: scopedTools,
    fuelEntries: scopedEntries,
    wapdaReadings: adminUser ? wapda : [],
    engineServiceLogs: adminUser ? services : [],
    activities: adminUser ? activities : [],
  });
}

function systemPrompt(adminUser) {
  return `You are PowerHouse AI, an operational assistant for an industrial power-house management system. Answer in the user's language (Roman Urdu/Urdu/English) and keep answers practical. Use only the supplied project context for project-specific facts. Never invent live readings, fuel stock, task status, electrical ratings, maintenance dates, or staff information. ${adminUser ? "The user is an admin and may receive the full operational context." : "The user is a staff account; never reveal other staff members' private information or admin-only operational datasets."} For electrical or maintenance advice, clearly distinguish observations from recommendations and advise verification against equipment nameplates, drawings, manufacturer instructions, and applicable safety procedures.`;
}

async function askOpenAI(question, context, adminUser) {
  const key = OPENAI_API_KEY.value();
  if (!key) throw new Error("OPENAI_API_KEY is not configured in Firebase Secret Manager.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_MODEL.value(),
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt(adminUser) }] },
        { role: "user", content: [{ type: "input_text", text: `PROJECT CONTEXT:\n${JSON.stringify(context)}\n\nUSER QUESTION:\n${question}` }] },
      ],
      max_output_tokens: Number(OPENAI_MAX_OUTPUT_TOKENS.value()) || 1200,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status}).`);
  const answer = data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("\n").trim();
  return answer || "AI ne koi response generate nahi kiya.";
}

function adminNumbers() {
  return String(ADMIN_WHATSAPP_NUMBERS.value() || "").split(",").map(normalizePhone).filter(Boolean);
}

async function sendWhatsApp(to, body) {
  const token = WHATSAPP_ACCESS_TOKEN.value();
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID.value();
  if (!token || !phoneNumberId) throw new Error("WhatsApp credentials are not configured in Firebase Secret Manager.");
  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(to), type: "text", text: { preview_url: false, body: String(body).slice(0, 4096) } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `WhatsApp request failed (${response.status}).`);
  return data;
}

function shortUserReport(context) {
  const u = context.currentUser || {};
  return `PowerHouse Update\n\nUser: ${u.name || "User"}\nStatus: ${u.status || "N/A"}\nPending/assigned tasks: ${context.summary.taskCount}\nDuties: ${context.summary.dutyCount}\nTools: ${context.summary.toolCount}\nFuel entries recorded by you: ${context.summary.fuelEntryCount}\n\nAap PowerHouse AI ko WhatsApp par apna task, duty ya status pooch sakte hain.`;
}

function adminReport(context) {
  const s = context.summary;
  const fuel = context.fuelEntries || [];
  const latest = [...fuel].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  return `PowerHouse Admin Report\n\nPanels: ${s.panelCount}\nCable routes: ${s.routeCount}\nTasks: ${s.taskCount}\nDuties: ${s.dutyCount}\nTools: ${s.toolCount}\nFuel entries: ${s.fuelEntryCount}\nWAPDA readings: ${s.wapdaReadingCount}\nEngine service logs: ${s.serviceLogCount}\nActivities: ${s.activityCount}\n\nLatest fuel entry: ${latest?.date || "N/A"}\nCurrent stock: ${latest?.currentStock ?? latest?.stock ?? "N/A"} L\nTotal consumption: ${latest?.totalConsumption ?? "N/A"} L\nIncoming: ${latest?.incoming ?? "N/A"} L\n\nPowerHouse AI is available on WhatsApp for detailed questions.`;
}

exports.aiChat = onCall({ region: REGION, secrets: [OPENAI_API_KEY] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Firebase login required.");
  const user = await getUserByUid(request.auth.uid);
  if (!user) throw new HttpsError("permission-denied", "PowerHouse user profile not found.");
  const question = String(request.data?.message || "").trim();
  if (!question) throw new HttpsError("invalid-argument", "Message is required.");
  const adminUser = isAdminRole(user.role);
  const context = await buildContext({ ...user, uid: request.auth.uid }, user.role);
  const answer = await askOpenAI(question, context, adminUser);
  return { answer, access: adminUser ? "admin_full" : "user_limited" };
});

exports.aiStatus = onCall({ region: REGION, secrets: [OPENAI_API_KEY, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Firebase login required.");
  return { aiConfigured: Boolean(OPENAI_API_KEY.value()), whatsappConfigured: Boolean(WHATSAPP_ACCESS_TOKEN.value() && WHATSAPP_PHONE_NUMBER_ID.value()) };
});

exports.sendWhatsAppReport = onCall({ region: REGION, secrets: [OPENAI_API_KEY, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ADMIN_WHATSAPP_NUMBERS] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Firebase login required.");
  const user = await getUserByUid(request.auth.uid);
  if (!user) throw new HttpsError("permission-denied", "PowerHouse user profile not found.");
  const adminUser = isAdminRole(user.role);
  const context = await buildContext({ ...user, uid: request.auth.uid }, user.role);
  const recipients = adminUser ? adminNumbers() : [normalizePhone(user.phone || user.whatsapp || user.whatsappNumber)];
  if (!recipients.length) throw new HttpsError("failed-precondition", adminUser ? "ADMIN_WHATSAPP_NUMBERS is empty." : "Your WhatsApp number is not saved in your PowerHouse profile.");
  const body = adminUser ? adminReport(context) : shortUserReport(context);
  const results = await Promise.allSettled(recipients.map((to) => sendWhatsApp(to, body)));
  const sent = results.filter((x) => x.status === "fulfilled").length;
  return { success: sent > 0, sent, failed: recipients.length - sent };
});

exports.whatsappWebhook = onRequest({ region: REGION, secrets: [WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID, OPENAI_API_KEY, ADMIN_WHATSAPP_NUMBERS] }, async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN.value()) return res.status(200).send(challenge);
    return res.status(403).send("Forbidden");
  }
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const signature = String(req.get("x-hub-signature-256") || "");
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = `sha256=${crypto.createHmac("sha256", WHATSAPP_APP_SECRET.value()).update(rawBody).digest("hex")}`;
    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).send("Invalid signature");

    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        for (const message of change.value?.messages || []) {
          if (message.type !== "text") continue;
          const from = normalizePhone(message.from);
          const text = String(message.text?.body || "").trim();
          if (!from || !text) continue;
          const user = await getUserByPhone(from);
          const adminUser = adminNumbers().includes(from) || isAdminRole(user?.role);
          if (!user && !adminUser) {
            await sendWhatsApp(from, "Aapka WhatsApp number PowerHouse account ke sath registered nahi hai. Admin se number register karwaen.");
            continue;
          }
          const profile = user || { uid: from, id: from, name: "Admin", role: "admin", phone: from };
          const context = await buildContext(profile, adminUser ? "admin" : profile.role);
          const answer = await askOpenAI(text, context, adminUser);
          await sendWhatsApp(from, answer);
        }
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  } catch (error) {
    logger.error("WhatsApp webhook error", error);
    return res.status(500).send("Webhook processing failed");
  }
});

exports.notifyTaskCreatedWhatsApp = onDocumentCreated({ region: REGION, document: "tasks/{taskId}", secrets: [WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ADMIN_WHATSAPP_NUMBERS] }, async (event) => {
  const task = event.data?.data();
  if (!task) return;
  const ids = task.assigned_user_ids || task.user_ids || [];
  const userIds = (Array.isArray(ids) ? ids : [ids]).map((item) => String(item?.id || item?.uid || item?.user_id || item)).filter(Boolean);
  const recipients = new Set(adminNumbers());
  for (const uid of userIds) {
    const user = await getUserByUid(uid);
    const phone = normalizePhone(user?.phone || user?.whatsapp || user?.whatsappNumber);
    if (phone) recipients.add(phone);
  }
  const number = task.task_number || task.display_id || task.public_id || event.params.taskId;
  const body = `PowerHouse Task Alert\n\nTask #${number}\nTitle: ${task.title || "Untitled"}\nStatus: ${task.status || "Pending"}\nPriority: ${task.priority || "Normal"}\n\nPowerHouse app mein task details check karein.`;
  await Promise.allSettled([...recipients].map((to) => sendWhatsApp(to, body)));
});
