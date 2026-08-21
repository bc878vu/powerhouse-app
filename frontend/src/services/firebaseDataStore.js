import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, firebaseConfig, storage } from "../firebase";
import { getUser } from "../utils/auth";
import { listPanels, panelRequest } from "./firebasePanelStore";

const usersRef = collection(db, "powerhouse_users");
const tasksRef = collection(db, "tasks");
const dutiesRef = collection(db, "duties");
const toolsRef = collection(db, "tools");
const categoriesRef = collection(db, "categories");
const activitiesRef = collection(db, "activities");

const clean = (value) => {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
};

const fromDoc = (snapshot) => ({ id: snapshot.id, ...(clean(snapshot.data() || {})) });
const nowIso = () => new Date().toISOString();

function parseQuery(url) {
  const raw = String(url || "");
  const queryIndex = raw.indexOf("?");
  if (queryIndex === -1) return {};
  return Object.fromEntries(new URLSearchParams(raw.slice(queryIndex + 1)).entries());
}

function basePath(url) {
  return String(url || "").replace(/^\/api/, "").split("?")[0].replace(/^\/+/, "");
}

async function findById(refCollection, id) {
  const direct = await getDoc(doc(db, refCollection.id, String(id)));
  if (direct.exists()) return direct;
  const snap = await getDocs(query(refCollection, where("id", "==", String(id)), limit(1)));
  return snap.docs[0] || null;
}

async function allDocs(refCollection) {
  const snap = await getDocs(refCollection);
  return snap.docs.map(fromDoc);
}

async function uploadFile(file, folder) {
  if (!(file instanceof File) && !(file instanceof Blob)) return null;
  const safeName = String(file.name || `file-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return {
    url: await getDownloadURL(storageRef),
    path,
    name: file.name || safeName,
    type: file.type || "application/octet-stream",
    size: file.size || 0
  };
}

async function formDataToObject(formData) {
  const result = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      const uploaded = await uploadFile(value, "powerhouse/uploads");
      if (!uploaded) continue;
      if (key.endsWith("[]")) {
        const cleanKey = key.slice(0, -2);
        result[cleanKey] = [...(result[cleanKey] || []), uploaded];
      } else {
        result[key] = uploaded;
      }
      continue;
    }
    if (key.endsWith("[]")) {
      const cleanKey = key.slice(0, -2);
      result[cleanKey] = [...(result[cleanKey] || []), value];
    } else if (result[key] !== undefined) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  for (const key of ["assigned_user_ids", "user_ids", "removedFiles"]) {
    if (typeof result[key] === "string") {
      try { result[key] = JSON.parse(result[key]); } catch {}
    }
  }
  return result;
}

async function normalizePayload(data) {
  if (typeof FormData !== "undefined" && data instanceof FormData) return formDataToObject(data);
  return data || {};
}

function normalizeUser(user) {
  return { ...user, id: user.id ?? user.uid ?? null, uid: user.uid ?? user.id ?? null };
}

async function getUserDoc(id) {
  const direct = await getDoc(doc(db, "powerhouse_users", String(id)));
  if (direct.exists()) return direct;
  const snap = await getDocs(query(usersRef, where("id", "==", String(id)), limit(1)));
  if (!snap.empty) return snap.docs[0];
  const byUid = await getDocs(query(usersRef, where("uid", "==", String(id)), limit(1)));
  return byUid.docs[0] || null;
}

export async function listUsers() {
  return (await allDocs(usersRef)).map(normalizeUser).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export async function createUser(payload) {
  const { email, password, ...profile } = payload;
  if (!email || !password) throw new Error("Email and password are required.");
  let secondaryApp = getApps().find((item) => item.name === "powerhouse-user-create");
  if (!secondaryApp) secondaryApp = initializeApp(firebaseConfig, "powerhouse-user-create");
  const secondaryAuth = getAuth(secondaryApp);
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
  const uid = credential.user.uid;
  await setDoc(doc(db, "powerhouse_users", uid), {
    ...profile,
    uid,
    id: profile.id || uid,
    email: email.trim(),
    status: profile.status || "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  await signOut(secondaryAuth).catch(() => {});
  return normalizeUser({ ...profile, uid, id: profile.id || uid, email: email.trim(), status: profile.status || "active" });
}

export async function updateUser(id, payload) {
  const target = await getUserDoc(id);
  if (!target) throw new Error("User not found.");
  const next = { ...payload };
  delete next.password;
  delete next.id;
  await updateDoc(target.ref, { ...next, updatedAt: serverTimestamp() });
  return normalizeUser(await getUserDoc(target.id).then(fromDoc));
}

export async function deleteUser(id) {
  const target = await getUserDoc(id);
  if (!target) throw new Error("User not found.");
  await deleteDoc(target.ref);
  return { success: true };
}

function taskAssignedTo(task, userId) {
  const ids = task.assigned_user_ids || task.user_ids || [];
  return (Array.isArray(ids) ? ids : [ids]).some((item) => String(item?.id || item?.user_id || item) === String(userId)) || String(task.user_id || "") === String(userId);
}

async function getTask(id) {
  const target = await findById(tasksRef, id);
  return target ? fromDoc(target) : null;
}

export async function listTasks() {
  const tasks = await allDocs(tasksRef);
  return tasks.sort((a, b) => String(b.created_at || b.createdAt || "").localeCompare(String(a.created_at || a.createdAt || "")));
}

export async function assignTask(payload) {
  const ids = Array.isArray(payload.assigned_user_ids || payload.user_ids)
    ? (payload.assigned_user_ids || payload.user_ids).map(String)
    : payload.user_id ? [String(payload.user_id)] : [];
  const created = nowIso();
  const history = ids.map((userId) => ({ user_id: userId, assignment_cycle: 1, status: payload.status || "Pending", assigned_at: created }));
  const task = {
    ...payload,
    assigned_user_ids: ids,
    user_ids: ids,
    user_id: ids[0] || payload.user_id || "",
    status: payload.status || "Pending",
    assignment_cycle: 1,
    assignment_count: 1,
    assignment_history: history,
    created_at: created,
    updated_at: created,
    createdAt: serverTimestamp()
  };
  const docRef = await addDoc(tasksRef, task);
  await addDoc(activitiesRef, { type: "task_created", task_id: docRef.id, status: task.status, created_at: serverTimestamp() });
  return { ...task, id: docRef.id };
}

async function updateTask(id, payload) {
  const target = await findById(tasksRef, id);
  if (!target) throw new Error("Task not found.");
  const existing = fromDoc(target);
  const next = { ...payload };
  delete next.id;
  delete next.createdAt;
  await updateDoc(target.ref, { ...next, updated_at: nowIso() });
  return { ...existing, ...next, id: target.id, updated_at: nowIso() };
}

async function updateTaskStatus(id, payload) {
  const target = await findById(tasksRef, id);
  if (!target) throw new Error("Task not found.");
  const task = fromDoc(target);
  const status = payload.status || task.status || "Pending";
  const userId = String(payload.user_id || auth.currentUser?.uid || "");
  const cycle = Number(payload.assignment_cycle || task.assignment_cycle || 1);
  const history = Array.isArray(task.assignment_history) ? [...task.assignment_history] : [];
  const index = history.findIndex((item) => Number(item.assignment_cycle || 1) === cycle && (!userId || String(item.user_id) === userId));
  const event = { user_id: userId, assignment_cycle: cycle, status, updated_at: nowIso() };
  if (status === "In Progress") event.accepted_at = nowIso();
  if (status === "Completed") event.completed_at = nowIso();
  if (status === "Rejected") { event.rejected_at = nowIso(); event.rejection_reason = payload.rejection_reason || ""; }
  if (index >= 0) history[index] = { ...history[index], ...event };
  else history.push({ ...event, assigned_at: task.assigned_at || task.created_at || nowIso() });
  await updateDoc(target.ref, { status, assignment_history: history, assignment_cycle: cycle, updated_at: nowIso() });
  await addDoc(activitiesRef, { type: "task_status", task_id: target.id, status, user_id: userId, created_at: serverTimestamp() });
  return { ...task, status, assignment_history: history, id: target.id };
}

async function completeTask(id, payload) {
  const normalized = await normalizePayload(payload);
  const target = await findById(tasksRef, id);
  if (!target) throw new Error("Task not found.");
  const task = fromDoc(target);
  const report = {
    id: `completion-${Date.now()}`,
    completion_note: normalized.completion_note || normalized.note || "",
    submitted_by: { id: auth.currentUser?.uid || "", name: getUser()?.name || "User", email: auth.currentUser?.email || getUser()?.email || "" },
    submitted_at: nowIso(),
    media_files: Array.isArray(normalized.files) ? normalized.files : [],
    voice_notes: Array.isArray(normalized.voiceNotes) ? normalized.voiceNotes : []
  };
  const reports = Array.isArray(task.completion_reports) ? [...task.completion_reports, report] : [report];
  const updated = await updateTaskStatus(id, { status: "Completed", user_id: auth.currentUser?.uid || task.user_id, assignment_cycle: task.assignment_cycle });
  await updateDoc(target.ref, { completion_reports: reports, latest_completion: report, status: "Completed", updated_at: nowIso() });
  return { ...updated, completion_reports: reports, latest_completion: report };
}

function dateOnly(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }

export async function dutyStaff(year, month) {
  const users = await listUsers();
  const duties = await allDocs(dutiesRef);
  const selectedYear = Number(year || new Date().getFullYear());
  const selectedMonth = Number(month || new Date().getMonth() + 1);
  const today = new Date().toISOString().slice(0, 10);
  return users.map((user) => {
    const mine = duties.filter((item) => String(item.user_id) === String(user.id || user.uid));
    const monthDuties = mine.filter((item) => item.record_type === "status" && String(item.duty_date || "").startsWith(`${selectedYear}-${String(selectedMonth).padStart(2, "0")}`));
    const todayDuty = mine.filter((item) => item.record_type === "status" && item.duty_date === today).sort((a,b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))[0] || null;
    const shifts = mine.filter((item) => item.record_type === "shift").sort((a,b) => String(b.effective_from || b.created_at || "").localeCompare(String(a.effective_from || a.created_at || "")));
    const currentShift = shifts[0] || null;
    return {
      ...user,
      currentShift,
      todayDuty,
      monthlySummary: {
        dutyDays: monthDuties.filter((d) => d.status === "on_duty").length,
        leaveDays: monthDuties.filter((d) => d.status === "leave").length,
        offDays: monthDuties.filter((d) => d.status === "off_duty").length,
        recordedDays: monthDuties.length
      }
    };
  });
}

export async function dutySummary() {
  const users = await listUsers();
  const duties = await allDocs(dutiesRef);
  const today = new Date().toISOString().slice(0, 10);
  const todays = duties.filter((d) => d.record_type === "status" && d.duty_date === today);
  return {
    totalStaff: users.length,
    onDutyToday: todays.filter((d) => d.status === "on_duty").length,
    onLeaveToday: todays.filter((d) => d.status === "leave").length,
    offToday: todays.filter((d) => d.status === "off_duty").length
  };
}

export async function markDuty(payload) {
  const id = `${payload.user_id}_${payload.duty_date}`;
  const record = { ...payload, id, record_type: "status", updated_at: nowIso(), created_at: nowIso() };
  await setDoc(doc(db, "duties", id), record, { merge: true });
  return record;
}

export async function assignShift(payload) {
  const record = { ...payload, user_id: String(payload.user_id), record_type: "shift", created_at: nowIso(), updated_at: nowIso() };
  const refDoc = await addDoc(dutiesRef, record);
  return { ...record, id: refDoc.id };
}

export async function dutyHistory(userId) {
  const records = (await allDocs(dutiesRef)).filter((item) => String(item.user_id) === String(userId));
  return { shifts: records.filter((item) => item.record_type === "shift").sort((a,b) => String(b.effective_from || "").localeCompare(String(a.effective_from || ""))), duties: records.filter((item) => item.record_type === "status").sort((a,b) => String(b.duty_date || "").localeCompare(String(a.duty_date || ""))) };
}

export async function userTools(userId) {
  return (await allDocs(toolsRef)).filter((item) => String(item.user_id || item.assigned_to || "") === String(userId));
}

export async function activityStats() {
  const [users, tasks, panels, summary] = await Promise.all([listUsers(), listTasks(), listPanels(), dutySummary()]);
  const counts = {
    Pending: tasks.filter((t) => t.status === "Pending").length,
    "In Progress": tasks.filter((t) => t.status === "In Progress").length,
    Completed: tasks.filter((t) => t.status === "Completed").length,
    Rejected: tasks.filter((t) => t.status === "Rejected").length
  };
  return {
    staffCount: users.length,
    taskCount: tasks.length,
    pendingCount: counts.Pending,
    inProgressCount: counts["In Progress"],
    completedCount: counts.Completed,
    rejectedCount: counts.Rejected,
    activities: tasks.slice(0, 100),
    onDutyToday: { count: summary.onDutyToday, staff: users.filter((u) => false) },
    panelsUnderWork: { count: panels.filter((p) => p.status === "live").length, panels: panels.filter((p) => p.status === "live") },
    panelsOff: { count: panels.filter((p) => p.status === "off").length, panels: panels.filter((p) => p.status === "off") },
    panelsMaintenance: { count: panels.filter((p) => p.status === "maintenance").length, panels: panels.filter((p) => p.status === "maintenance") },
    operationalSummary: { onDutyCount: summary.onDutyToday, panelsUnderWorkCount: panels.filter((p) => p.status === "live").length, panelsOffCount: panels.filter((p) => p.status === "off").length, panelsMaintenanceCount: panels.filter((p) => p.status === "maintenance").length },
    serverDate: nowIso()
  };
}

export async function requestFirebase(method, url, data, params = {}) {
  const path = basePath(url);
  const payload = await normalizePayload(data);
  const queryParams = { ...parseQuery(url), ...params };

  if (path.startsWith("panels")) return panelRequest(method, `/${path}`, payload);
  if (method === "GET" && path === "user/all") return listUsers();
  if (method === "POST" && path === "user") return { message: "Staff member created successfully.", user: await createUser(payload) };
  if (method === "GET" && path.startsWith("user/full/")) {
    const id = path.split("/")[2];
    const userDoc = await getUserDoc(id);
    if (!userDoc) throw new Error("User not found.");
    const user = normalizeUser(fromDoc(userDoc));
    const tasks = (await listTasks()).filter((task) => taskAssignedTo(task, id));
    const tools = await userTools(id);
    return { user, tasks, tools };
  }
  if (path.startsWith("user/")) {
    const id = path.split("/")[1];
    if (method === "GET") {
      const target = await getUserDoc(id);
      if (!target) throw new Error("User not found.");
      return normalizeUser(fromDoc(target));
    }
    if (method === "PUT") return { message: "User updated successfully.", user: await updateUser(id, payload) };
    if (method === "DELETE") return deleteUser(id);
  }
  if (path === "duty/staff") return { staff: await dutyStaff(queryParams.year, queryParams.month) };
  if (path === "duty/summary") return dutySummary();
  if (path === "duty/mark-status" && method === "POST") return { message: "Duty status saved successfully.", ...(await markDuty(payload)) };
  if (path === "duty/assign-shift" && method === "POST") return { message: "Shift assigned successfully.", ...(await assignShift(payload)) };
  if (path.startsWith("duty/user/") && path.endsWith("/history")) return dutyHistory(path.split("/")[2]);
  if (path.startsWith("tools/user/") && method === "GET") return userTools(path.split("/")[2]);
  if (path === "activity/stats" && method === "GET") return activityStats();
  if (path === "task/my-tasks/" + String(path.split("/").pop()) && method === "GET") return (await listTasks()).filter((task) => taskAssignedTo(task, path.split("/").pop()));
  if (path.startsWith("task/my-tasks/") && method === "GET") return (await listTasks()).filter((task) => taskAssignedTo(task, path.split("/").pop()));
  if (path === "task/assign" && method === "POST") return assignTask(payload);
  if (path.startsWith("task/update-status/") && method === "PUT") return updateTaskStatus(path.split("/")[2], payload);
  if (path.startsWith("task/complete-work/") && method === "POST") return completeTask(path.split("/")[2], data);
  if (path.startsWith("task/") && path.split("/").length === 2) {
    const id = path.split("/")[1];
    if (method === "GET") { const task = await getTask(id); if (!task) throw new Error("Task not found."); return { task }; }
    if (method === "PUT") return updateTask(id, payload);
    if (method === "DELETE") { const target = await findById(tasksRef, id); if (!target) throw new Error("Task not found."); await deleteDoc(target.ref); return { success: true }; }
  }
  if (path === "tools" && method === "GET") return allDocs(toolsRef);
  if (path === "tools" && method === "POST") {
    const r = await addDoc(toolsRef, { ...payload, created_at: nowIso() });
    return { id: r.id, ...payload };
  }
  if (path === "tools/assign" && method === "POST") {
    const userId = String(payload.userId || payload.user_id || payload.assigned_to || "").trim();
    const toolName = String(payload.toolName || payload.tool_name || "").trim();
    if (!userId) throw new Error("Please select a staff member.");
    if (!toolName) throw new Error("Tool name is required.");

    const record = {
      ...payload,
      userId,
      user_id: userId,
      assigned_to: userId,
      userName: String(payload.userName || ""),
      toolName,
      tool_name: toolName,
      category: String(payload.category || "General"),
      quantity: Math.max(1, Number(payload.quantity) || 1),
      date: payload.date || new Date().toISOString().slice(0, 10),
      status: payload.status || "assigned",
      assigned_at: nowIso(),
      created_at: nowIso(),
      assigned_by: auth.currentUser?.uid || ""
    };
    const r = await addDoc(toolsRef, record);
    return { id: r.id, ...record };
  }
  if (path === "categories" && method === "GET") return allDocs(categoriesRef);
  if (path === "categories" && method === "POST") { const r = await addDoc(categoriesRef, payload); return { id: r.id, ...payload }; }
  throw new Error(`Firebase migration: unsupported endpoint ${method} ${url}`);
}
