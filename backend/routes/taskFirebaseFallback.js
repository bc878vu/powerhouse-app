const admin = require("../firebaseAdmin");

function clean(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clean(item)])
    );
  }
  return value;
}

function normalizeTask(snapshot) {
  if (!snapshot || !snapshot.exists) return null;
  const data = clean(snapshot.data() || {});
  return {
    ...data,
    id: snapshot.id,
    task_number: data.task_number || data.display_id || data.id || snapshot.id,
    display_id: data.display_id || data.task_number || data.id || snapshot.id,
    completion_reports: Array.isArray(data.completion_reports)
      ? data.completion_reports
      : [],
    latest_completion: data.latest_completion || null,
    has_completion_report:
      Boolean(data.has_completion_report) ||
      (Array.isArray(data.completion_reports) && data.completion_reports.length > 0) ||
      Boolean(data.latest_completion),
  };
}

async function findFirebaseTask(rawId) {
  if (!admin?.apps?.length) return null;

  const firestore = admin.firestore();
  const tasks = firestore.collection("tasks");
  const raw = String(rawId || "").trim();
  if (!raw) return null;

  const direct = await tasks.doc(raw).get();
  if (direct.exists) return normalizeTask(direct);

  const stringFields = ["id", "task_number", "display_id"];
  for (const field of stringFields) {
    const snap = await tasks.where(field, "==", raw).limit(1).get();
    if (!snap.empty) return normalizeTask(snap.docs[0]);
  }

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    for (const field of ["id", "task_number", "display_id"]) {
      const snap = await tasks.where(field, "==", numeric).limit(1).get();
      if (!snap.empty) return normalizeTask(snap.docs[0]);
    }

    if (Number.isInteger(numeric) && numeric > 0) {
      const all = await tasks.get();
      const ordered = all.docs
        .map(normalizeTask)
        .filter(Boolean)
        .sort((a, b) => {
          const da = new Date(a.created_at || a.createdAt || 0).getTime();
          const db = new Date(b.created_at || b.createdAt || 0).getTime();
          if (da !== db) return da - db;
          return String(a.id || "").localeCompare(String(b.id || ""));
        });
      return ordered[numeric - 1] || null;
    }
  }

  return null;
}

module.exports = async function taskFirebaseFallback(req, res, next) {
  if (req.method !== "GET") return next();

  try {
    const task = await findFirebaseTask(req.params.id);
    if (!task) return next();

    console.log(`✅ Task View Firebase fallback resolved task ${req.params.id}`);
    return res.json({ success: true, task });
  } catch (error) {
    // Never break the existing MySQL route because Firebase is unavailable.
    console.warn("⚠️ Firebase task fallback skipped:", error.message);
    return next();
  }
};
