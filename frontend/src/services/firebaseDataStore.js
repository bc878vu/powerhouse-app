import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, firebaseConfig, storage } from "../firebase";
import { getUser } from "../utils/auth";
import { listPanels, panelRequest } from "./firebasePanelStore";
import { createNotification, sendPushNotification } from "./notificationService";
import { socket } from "../utils/socket";

const usersRef = collection(db, "powerhouse_users");
const tasksRef = collection(db, "tasks");
const dutiesRef = collection(db, "duties");
const toolsRef = collection(db, "tools");
const categoriesRef = collection(db, "categories");
const activitiesRef = collection(db, "activities");
const taskCounterRef = doc(db, "system_counters", "tasks");
const READ_CACHE_TTL = 10000;

let usersCache = null, usersCacheAt = 0, usersPromise = null;
let dutiesCache = null, dutiesCacheAt = 0, dutiesPromise = null;
let tasksCache = null, tasksCacheAt = 0, tasksPromise = null;
let toolsCache = null, toolsCacheAt = 0, toolsPromise = null;

const clean = (value) => {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
};
const fromDoc = (snapshot) => ({ id: snapshot.id, ...(clean(snapshot.data() || {})) });
const nowIso = () => new Date().toISOString();
function parseQuery(url) { const raw = String(url || ""); const queryIndex = raw.indexOf("?"); if (queryIndex === -1) return {}; return Object.fromEntries(new URLSearchParams(raw.slice(queryIndex + 1)).entries()); }
function basePath(url) { return String(url || "").replace(/^\/api/, "").split("?")[0].replace(/^\/+/, ""); }
async function allDocs(refCollection) { const snap = await getDocs(refCollection); return snap.docs.map(fromDoc); }
function invalidateUsers() { usersCache = null; usersCacheAt = 0; }
function invalidateDuties() { dutiesCache = null; dutiesCacheAt = 0; }
function invalidateTasks() { tasksCache = null; tasksCacheAt = 0; }
function invalidateTools() { toolsCache = null; toolsCacheAt = 0; }

async function listDuties() {
  if (dutiesCache && Date.now() - dutiesCacheAt < READ_CACHE_TTL) return dutiesCache;
  if (dutiesPromise) return dutiesPromise;
  dutiesPromise = allDocs(dutiesRef).then((items) => { dutiesCache = items; dutiesCacheAt = Date.now(); return items; }).finally(() => { dutiesPromise = null; });
  return dutiesPromise;
}
async function listTools() {
  if (toolsCache && Date.now() - toolsCacheAt < READ_CACHE_TTL) return toolsCache;
  if (toolsPromise) return toolsPromise;
  toolsPromise = allDocs(toolsRef).then((items) => { toolsCache = items; toolsCacheAt = Date.now(); return items; }).finally(() => { toolsPromise = null; });
  return toolsPromise;
}
async function uploadFile(file, folder) {
  if (!(file instanceof File) && !(file instanceof Blob)) return null;
  const safeName = String(file.name || `file-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return { url: await getDownloadURL(storageRef), path, name: file.name || safeName, type: file.type || "application/octet-stream", size: file.size || 0 };
}
async function formDataToObject(formData) {
  const result = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      const uploaded = await uploadFile(value, "powerhouse/uploads");
      if (!uploaded) continue;
      if (key.endsWith("[]")) { const cleanKey = key.slice(0, -2); result[cleanKey] = [...(result[cleanKey] || []), uploaded]; } else result[key] = uploaded;
      continue;
    }
    if (key.endsWith("[]")) { const cleanKey = key.slice(0, -2); result[cleanKey] = [...(result[cleanKey] || []), value]; }
    else if (result[key] !== undefined) result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    else result[key] = value;
  }
  for (const key of ["assigned_user_ids", "user_ids", "removedFiles"]) if (typeof result[key] === "string") { try { result[key] = JSON.parse(result[key]); } catch {} }
  return result;
}
async function normalizePayload(data) { if (typeof FormData !== "undefined" && data instanceof FormData) return formDataToObject(data); return data || {}; }
function normalizeUser(user) { return { ...user, id: user.id ?? user.uid ?? null, uid: user.uid ?? user.id ?? null }; }

export async function listUsers() {
  if (usersCache && Date.now() - usersCacheAt < READ_CACHE_TTL) return usersCache;
  if (usersPromise) return usersPromise;
  usersPromise = allDocs(usersRef).then((items) => items.map(normalizeUser).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))).then((items) => { usersCache = items; usersCacheAt = Date.now(); return items; }).finally(() => { usersPromise = null; });
  return usersPromise;
}
async function getUserDoc(id) {
  const direct = await getDoc(doc(db, "powerhouse_users", String(id)));
  if (direct.exists()) return direct;
  const snap = await getDocs(query(usersRef, where("id", "==", String(id)), limit(1)));
  if (!snap.empty) return snap.docs[0];
  const byUid = await getDocs(query(usersRef, where("uid", "==", String(id)), limit(1)));
  return byUid.docs[0] || null;
}
export async function createUser(payload) {
  const { email, password, ...profile } = payload;
  if (!email || !password) throw new Error("Email and password are required.");
  let secondaryApp = getApps().find((item) => item.name === "powerhouse-user-create");
  if (!secondaryApp) secondaryApp = initializeApp(firebaseConfig, "powerhouse-user-create");
  const secondaryAuth = getAuth(secondaryApp);
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
  const uid = credential.user.uid;
  await setDoc(doc(db, "powerhouse_users", uid), { ...profile, uid, id: profile.id || uid, email: email.trim(), status: profile.status || "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  await signOut(secondaryAuth).catch(() => {});
  invalidateUsers();
  return normalizeUser({ ...profile, uid, id: profile.id || uid, email: email.trim(), status: profile.status || "active" });
}
export async function updateUser(id, payload) { const target = await getUserDoc(id); if (!target) throw new Error("User not found."); const next = { ...payload }; delete next.password; delete next.id; await updateDoc(target.ref, { ...next, updatedAt: serverTimestamp() }); invalidateUsers(); return normalizeUser(await getUserDoc(target.id).then(fromDoc)); }
export async function deleteUser(id) { const target = await getUserDoc(id); if (!target) throw new Error("User not found."); await deleteDoc(target.ref); invalidateUsers(); invalidateDuties(); return { success: true }; }

function taskAssignedTo(task, userId) { const ids = task.assigned_user_ids || task.user_ids || []; return (Array.isArray(ids) ? ids : [ids]).some((item) => String(item?.id || item?.user_id || item) === String(userId)) || String(task.user_id || "") === String(userId); }
export async function listTasks() {
  if (tasksCache && Date.now() - tasksCacheAt < READ_CACHE_TTL) return tasksCache;
  if (tasksPromise) return tasksPromise;
  tasksPromise = allDocs(tasksRef).then((tasks) => tasks.sort((a, b) => String(b.created_at || b.createdAt || "").localeCompare(String(a.created_at || a.createdAt || "")))).then((items) => { tasksCache = items; tasksCacheAt = Date.now(); return items; }).finally(() => { tasksPromise = null; });
  return tasksPromise;
}
function publicTaskNumber(task, fallbackIndex = 0) { const numeric = Number(task?.task_number ?? task?.display_id ?? task?.public_id); return Number.isInteger(numeric) && numeric > 0 ? numeric : fallbackIndex + 1; }
async function nextPublicTaskNumber(existingTasks = []) {
  const maxExisting = existingTasks.reduce((max, task) => Math.max(max, publicTaskNumber(task, 0)), 0);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskCounterRef);
    const stored = Number(snapshot.exists() ? snapshot.data()?.value : 0);
    const next = Math.max(stored, maxExisting) + 1;
    transaction.set(taskCounterRef, { value: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });
}

async function findTaskById(id) {
  const raw = String(id ?? "").trim();
  if (!raw) return null;

  // Preferred path for CRUD actions: the private Firestore document id.
  const direct = await getDoc(doc(db, "tasks", raw));
  if (direct.exists()) return direct;

  // Support legacy documents where a separate id field was stored.
  const byStoredId = await getDocs(query(tasksRef, where("id", "==", raw), limit(1)));
  if (!byStoredId.empty) return byStoredId.docs[0];

  // Numeric public IDs may exist as strings or numbers in older task records.
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    const [byTaskNumberString, byTaskNumberNumber, byDisplayString, byDisplayNumber] = await Promise.all([
      getDocs(query(tasksRef, where("task_number", "==", raw), limit(1))),
      getDocs(query(tasksRef, where("task_number", "==", numeric), limit(1))),
      getDocs(query(tasksRef, where("display_id", "==", raw), limit(1))),
      getDocs(query(tasksRef, where("display_id", "==", numeric), limit(1))),
    ]);
    if (!byTaskNumberString.empty) return byTaskNumberString.docs[0];
    if (!byTaskNumberNumber.empty) return byTaskNumberNumber.docs[0];
    if (!byDisplayString.empty) return byDisplayString.docs[0];
    if (!byDisplayNumber.empty) return byDisplayNumber.docs[0];

    // Last-resort legacy mapping: the dashboard may display an index for an
    // old task that never had task_number/display_id fields.
    const tasks = await listTasks();
    const sorted = [...tasks].sort((a, b) => new Date(a.created_at || a.createdAt || 0).getTime() - new Date(b.created_at || b.createdAt || 0).getTime());
    const indexed = sorted[numeric - 1];
    if (indexed?.id) return getDoc(doc(db, "tasks", String(indexed.id)));
  }
  return null;
}
async function getTask(id) { const target = await findTaskById(id); return target ? fromDoc(target) : null; }
function normalizeUserIds(payload = {}) { const raw = payload.assigned_user_ids ?? payload.user_ids ?? payload.user_id ?? []; return [...new Set((Array.isArray(raw) ? raw : [raw]).map((item) => String(item?.id ?? item?.user_id ?? item).trim()).filter(Boolean))]; }
function latestCycleForUsers(task, userIds) { const history = Array.isArray(task?.assignment_history) ? task.assignment_history : []; const cycles = history.filter((item) => userIds.includes(String(item.user_id))).map((item) => Number(item.assignment_cycle) || 0); return cycles.length ? Math.max(...cycles) : Number(task?.assignment_cycle) || 0; }
function buildCycleHistory(userIds, cycle, created, status = "Pending", previousHistory = []) { const previous = Array.isArray(previousHistory) ? previousHistory : []; return [...previous, ...userIds.map((userId) => ({ user_id: String(userId), assignment_cycle: cycle, status, assigned_at: created, accepted_at: null, completed_at: null, rejected_at: null, rejection_reason: "" }))]; }
async function notifyTaskAssigned(task, userIds, { reassigned = false } = {}) {
  const numericId = publicTaskNumber(task);
  const title = reassigned ? "Task Reassigned" : "New Task Assigned";
  const body = reassigned ? `Task #${numericId} has been reassigned to you.` : `Task #${numericId} has been assigned to you.`;
  const route = `/task-view/${numericId}`;
  await Promise.allSettled(userIds.map(async (userId) => { const notificationId = await createNotification(userId, { title, body, type: reassigned ? "task_reassigned" : "task_assigned", route, taskId: numericId, sourceId: task.id }); await sendPushNotification({ title, body, route, userIds: [userId], notificationId }); }));
  try { socket.emit(reassigned ? "taskReassigned" : "taskAssigned", { taskId: numericId, task_id: numericId, title: task.title || "Task", userIds, user_ids: userIds, assignment_cycle: task.assignment_cycle, status: task.status }); } catch (error) { console.warn("Task socket notification skipped:", error?.message || error); }
}

export async function assignTask(payload) {
  const ids = normalizeUserIds(payload);
  if (!ids.length) throw new Error("Please select at least one staff member.");
  const created = nowIso();
  const existingTasks = await listTasks();
  const numericId = await nextPublicTaskNumber(existingTasks);
  const numericTaskId = String(numericId);
  const status = payload.status || "Pending";
  const history = buildCycleHistory(ids, 1, created, status);
  const task = { ...payload, task_number: numericTaskId, display_id: numericTaskId, public_id: numericId, assigned_user_ids: ids, user_ids: ids, user_id: ids[0] || "", status, assignment_cycle: 1, assignment_count: 1, assignment_history: history, created_at: created, updated_at: created, createdAt: serverTimestamp() };
  delete task.id;
  const docRef = await addDoc(tasksRef, task);
  const storedTask = { ...task, id: docRef.id, firestore_id: docRef.id };
  await addDoc(activitiesRef, { type: "task_created", task_id: docRef.id, status, task_number: numericTaskId, public_id: numericId, created_at: serverTimestamp() });
  invalidateTasks();
  await notifyTaskAssigned(storedTask, ids);
  return storedTask;
}

async function updateTask(id, payload) {
  const target = await findTaskById(id);
  if (!target) throw new Error("Task not found.");
  const existing = fromDoc(target);
  const next = { ...payload };
  delete next.id; delete next.firestore_id; delete next.createdAt; delete next.task_number; delete next.display_id; delete next.public_id;
  const requestedIds = normalizeUserIds(payload);
  const existingIds = normalizeUserIds(existing);
  const assignmentChanged = requestedIds.length > 0 && (requestedIds.length !== existingIds.length || requestedIds.some((item) => !existingIds.includes(item)));
  const explicitReassign = [true, "true", 1, "1", "yes"].includes(payload.reassign_task);
  const resetCompletedAsNewCycle = (existing.status === "Completed" || existing.status === "Rejected") && String(payload.status || "").toLowerCase() === "pending";
  const shouldStartNewCycle = assignmentChanged || explicitReassign || resetCompletedAsNewCycle;
  const updatedAt = nowIso();
  if (shouldStartNewCycle) {
    const currentCycle = Number(existing.assignment_cycle) || latestCycleForUsers(existing, existingIds) || 1;
    const nextCycle = currentCycle + 1;
    const assignedIds = requestedIds.length ? requestedIds : existingIds;
    const history = buildCycleHistory(assignedIds, nextCycle, updatedAt, "Pending", existing.assignment_history);
    const cyclePayload = { ...next, assigned_user_ids: assignedIds, user_ids: assignedIds, user_id: assignedIds[0] || existing.user_id || "", status: "Pending", assignment_cycle: nextCycle, assignment_count: nextCycle, assignment_history: history, assigned_at: updatedAt, accepted_at: null, completed_at: null, rejected_at: null, rejection_reason: "", updated_at: updatedAt };
    await updateDoc(target.ref, cyclePayload);
    invalidateTasks();
    const result = { ...existing, ...cyclePayload, id: target.id, firestore_id: target.id, task_number: existing.task_number, display_id: existing.display_id, public_id: existing.public_id };
    await notifyTaskAssigned(result, assignedIds, { reassigned: true });
    return result;
  }
  await updateDoc(target.ref, { ...next, updated_at: updatedAt });
  invalidateTasks();
  return { ...existing, ...next, id: target.id, firestore_id: target.id, updated_at: updatedAt, task_number: existing.task_number, display_id: existing.display_id, public_id: existing.public_id };
}
function findHistoryIndex(history, cycle, userId) { return history.findIndex((item) => Number(item.assignment_cycle || 1) === Number(cycle) && String(item.user_id || "") === String(userId || "")); }

async function updateTaskStatus(id, payload) {
  const target = await findTaskById(id);
  if (!target) throw new Error("Task not found.");
  const task = fromDoc(target);
  const status = payload.status || task.status || "Pending";
  const userId = String(payload.user_id || auth.currentUser?.uid || task.user_id || "");
  const cycle = Number(payload.assignment_cycle || task.assignment_cycle || 1);
  const history = Array.isArray(task.assignment_history) ? [...task.assignment_history] : [];
  const index = findHistoryIndex(history, cycle, userId);
  const currentRecord = index >= 0 ? history[index] : null;
  if (status === "Completed" && (currentRecord?.status === "Completed" || (task.status === "Completed" && Number(task.assignment_cycle) === cycle))) throw new Error("This assignment cycle is already completed.");
  const stamp = nowIso();
  const event = { user_id: userId, assignment_cycle: cycle, status, updated_at: stamp };
  if (status === "In Progress") event.accepted_at = currentRecord?.accepted_at || stamp;
  if (status === "Completed") event.completed_at = stamp;
  if (status === "Rejected") { event.rejected_at = stamp; event.rejection_reason = payload.rejection_reason || ""; }
  if (index >= 0) history[index] = { ...history[index], ...event }; else history.push({ ...event, assigned_at: task.assigned_at || task.created_at || stamp });
  await updateDoc(target.ref, { status, assignment_history: history, assignment_cycle: cycle, updated_at: stamp, accepted_at: status === "In Progress" ? (currentRecord?.accepted_at || stamp) : null, completed_at: status === "Completed" ? stamp : null, rejected_at: status === "Rejected" ? stamp : null, rejection_reason: status === "Rejected" ? (payload.rejection_reason || "") : "" });
  await addDoc(activitiesRef, { type: "task_status", task_id: target.id, status, user_id: userId, assignment_cycle: cycle, task_number: task.task_number || task.display_id || null, created_at: serverTimestamp() });
  invalidateTasks();
  try { socket.emit("taskUpdate", { taskId: publicTaskNumber(task), task_id: publicTaskNumber(task), status, userId, user_id: userId, assignment_cycle: cycle }); } catch {}
  return { ...task, status, assignment_history: history, assignment_cycle: cycle, id: target.id, firestore_id: target.id };
}

async function completeTask(id, payload) {
  const normalized = await normalizePayload(payload);
  const target = await findTaskById(id);
  if (!target) throw new Error("Task not found.");
  const task = fromDoc(target);
  const currentCycle = Number(normalized.assignment_cycle || task.assignment_cycle || 1);
  const userId = String(normalized.user_id || auth.currentUser?.uid || task.user_id || "");
  const history = Array.isArray(task.assignment_history) ? task.assignment_history : [];
  const currentIndex = findHistoryIndex(history, currentCycle, userId);
  const currentRecord = currentIndex >= 0 ? history[currentIndex] : null;
  if (task.status === "Completed" || currentRecord?.status === "Completed") throw new Error("This task cycle is already completed. Wait for a new assignment cycle.");
  if (currentRecord && currentRecord.status !== "In Progress") throw new Error("Task must be accepted and In Progress before it can be completed.");
  const report = { id: `completion-${Date.now()}`, assignment_cycle: currentCycle, completion_note: normalized.completion_note || normalized.note || "", submitted_by: { id: userId, name: getUser()?.name || "User", email: auth.currentUser?.email || getUser()?.email || "" }, submitted_at: nowIso(), media_files: Array.isArray(normalized.files) ? normalized.files : [], voice_notes: Array.isArray(normalized.voiceNotes) ? normalized.voiceNotes : [] };
  const reports = Array.isArray(task.completion_reports) ? [...task.completion_reports, report] : [report];
  await updateTaskStatus(id, { status: "Completed", user_id: userId, assignment_cycle: currentCycle });
  await updateDoc(target.ref, { completion_reports: reports, latest_completion: report, status: "Completed", updated_at: nowIso() });
  invalidateTasks();
  return { ...task, status: "Completed", assignment_history: history, completion_reports: reports, latest_completion: report, id: target.id, firestore_id: target.id };
}

export async function dutyStaff(year, month) {
  const [users, duties] = await Promise.all([listUsers(), listDuties()]);
  const selectedYear = Number(year || new Date().getFullYear()); const selectedMonth = Number(month || new Date().getMonth() + 1); const prefix = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`; const today = new Date().toISOString().slice(0, 10);
  return users.map((user) => { const userId = String(user.id || user.uid); const mine = duties.filter((item) => String(item.user_id) === userId); const monthDuties = mine.filter((item) => item.record_type === "status" && String(item.duty_date || "").startsWith(prefix)); const todayDuty = mine.filter((item) => item.record_type === "status" && item.duty_date === today).sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))[0] || null; const shifts = mine.filter((item) => item.record_type === "shift").sort((a, b) => String(b.effective_from || b.created_at || "").localeCompare(String(a.effective_from || a.created_at || ""))); return { ...user, currentShift: shifts[0] || null, todayDuty, monthlySummary: { dutyDays: monthDuties.filter((d) => d.status === "on_duty").length, leaveDays: monthDuties.filter((d) => d.status === "leave").length, offDays: monthDuties.filter((d) => d.status === "off_duty").length, recordedDays: monthDuties.length } }; });
}
export async function dutySummary() { const [users, duties] = await Promise.all([listUsers(), listDuties()]); const today = new Date().toISOString().slice(0, 10); const todays = duties.filter((d) => d.record_type === "status" && d.duty_date === today); return { totalStaff: users.length, onDutyToday: todays.filter((d) => d.status === "on_duty").length, onLeaveToday: todays.filter((d) => d.status === "leave").length, offToday: todays.filter((d) => d.status === "off_duty").length }; }
export async function markDuty(payload) { const id = `${payload.user_id}_${payload.duty_date}`; const record = { ...payload, id, record_type: "status", updated_at: nowIso(), created_at: nowIso() }; await setDoc(doc(db, "duties", id), record, { merge: true }); invalidateDuties(); return record; }
export async function assignShift(payload) { const record = { ...payload, user_id: String(payload.user_id), record_type: "shift", created_at: nowIso(), updated_at: nowIso() }; const refDoc = await addDoc(dutiesRef, record); invalidateDuties(); return { ...record, id: refDoc.id }; }
export async function dutyHistory(userId) { const records = (await listDuties()).filter((item) => String(item.user_id) === String(userId)); return { shifts: records.filter((item) => item.record_type === "shift").sort((a, b) => String(b.effective_from || "").localeCompare(String(a.effective_from || ""))), duties: records.filter((item) => item.record_type === "status").sort((a, b) => String(b.duty_date || "").localeCompare(String(a.duty_date || ""))) }; }
export async function userTools(userId) { return (await listTools()).filter((item) => String(item.user_id || item.assigned_to || "") === String(userId)); }

export async function activityStats() {
  const [users, tasks, panels, summary] = await Promise.all([listUsers(), listTasks(), listPanels(), dutySummary()]);
  const counts = { Pending: tasks.filter((t) => t.status === "Pending").length, "In Progress": tasks.filter((t) => t.status === "In Progress").length, Completed: tasks.filter((t) => t.status === "Completed").length, Rejected: tasks.filter((t) => t.status === "Rejected").length };
  const activities = tasks.slice(0, 100).map((task, index) => { const numeric = publicTaskNumber(task, index); return { ...task, id: numeric, firestore_id: task.id, task_number: String(numeric), display_id: String(numeric), public_id: numeric }; });
  return { staffCount: users.length, taskCount: tasks.length, pendingCount: counts.Pending, inProgressCount: counts["In Progress"], completedCount: counts.Completed, rejectedCount: counts.Rejected, activities, onDutyToday: { count: summary.onDutyToday, staff: [] }, panelsUnderWork: { count: panels.filter((p) => p.status === "live").length, panels: panels.filter((p) => p.status === "live") }, panelsOff: { count: panels.filter((p) => p.status === "off").length, panels: panels.filter((p) => p.status === "off") }, panelsMaintenance: { count: panels.filter((p) => p.status === "maintenance").length, panels: panels.filter((p) => p.status === "maintenance") }, operationalSummary: { onDutyCount: summary.onDutyToday, panelsUnderWorkCount: panels.filter((p) => p.status === "live").length, panelsOffCount: panels.filter((p) => p.status === "off").length, panelsMaintenanceCount: panels.filter((p) => p.status === "maintenance").length }, serverDate: nowIso() };
}

export async function requestFirebase(method, url, data, params = {}) {
  const path = basePath(url); const payload = await normalizePayload(data); const queryParams = { ...parseQuery(url), ...params };
  if (path.startsWith("panels")) return panelRequest(method, `/${path}`, payload);
  if (method === "GET" && path === "user/all") return listUsers();
  if (method === "POST" && path === "user") return { message: "Staff member created successfully.", user: await createUser(payload) };
  if (method === "GET" && path.startsWith("user/full/")) { const id = path.split("/")[2]; const userDoc = await getUserDoc(id); if (!userDoc) throw new Error("User not found."); const user = normalizeUser(fromDoc(userDoc)); const tasks = (await listTasks()).filter((task) => taskAssignedTo(task, id)); const tools = await userTools(id); return { user, tasks, tools }; }
  if (path.startsWith("user/")) { const id = path.split("/")[1]; if (method === "GET") { const target = await getUserDoc(id); if (!target) throw new Error("User not found."); return normalizeUser(fromDoc(target)); } if (method === "PUT") return { message: "User updated successfully.", user: await updateUser(id, payload) }; if (method === "DELETE") return deleteUser(id); }
  if (path === "duty/staff") return { staff: await dutyStaff(queryParams.year, queryParams.month) };
  if (path === "duty/summary") return dutySummary();
  if (path === "duty/mark-status" && method === "POST") return { message: "Duty status saved successfully.", ...(await markDuty(payload)) };
  if (path === "duty/assign-shift" && method === "POST") return { message: "Shift assigned successfully.", ...(await assignShift(payload)) };
  if (path.startsWith("duty/user/") && path.endsWith("/history")) return dutyHistory(path.split("/")[2]);
  if (path.startsWith("tools/user/") && method === "GET") return userTools(path.split("/")[2]);
  if (path === "activity/stats" && method === "GET") return activityStats();
  if (path.startsWith("task/my-tasks/") && method === "GET") return (await listTasks()).filter((task) => taskAssignedTo(task, path.split("/").pop()));
  if (path === "task/assign" && method === "POST") return assignTask(payload);
  if (path.startsWith("task/update-status/") && method === "PUT") return updateTaskStatus(path.split("/")[2], payload);
  if (path.startsWith("task/complete-work/") && method === "POST") return completeTask(path.split("/")[2], data);
  if (path.startsWith("task/") && path.split("/").length === 2) {
    const id = path.split("/")[1];
    if (method === "GET") { const task = await getTask(id); if (!task) throw new Error("Task not found."); return { task: { ...task, firestore_id: task.id, id: publicTaskNumber(task) } }; }
    if (method === "PUT") return updateTask(id, payload);
    if (method === "DELETE") { const target = await findTaskById(id); if (!target) throw new Error(`Task not found: ${id}`); await deleteDoc(target.ref); invalidateTasks(); return { success: true, deleted_id: target.id, task_number: publicTaskNumber(fromDoc(target)) }; }
  }
  if (path === "tools" && method === "GET") return listTools();
  if (path === "tools" && method === "POST") { const r = await addDoc(toolsRef, { ...payload, created_at: nowIso() }); invalidateTools(); return { id: r.id, ...payload }; }
  if (path === "tools/assign" && method === "POST") { const userId = String(payload.userId || payload.user_id || payload.assigned_to || "").trim(); const toolName = String(payload.toolName || payload.tool_name || "").trim(); if (!userId) throw new Error("Please select a staff member."); if (!toolName) throw new Error("Tool name is required."); const record = { ...payload, userId, user_id: userId, assigned_to: userId, userName: String(payload.userName || ""), toolName, tool_name: toolName, category: String(payload.category || "General"), quantity: Math.max(1, Number(payload.quantity) || 1), date: payload.date || new Date().toISOString().slice(0, 10), status: payload.status || "assigned", assigned_at: nowIso(), created_at: nowIso(), assigned_by: auth.currentUser?.uid || "" }; const r = await addDoc(toolsRef, record); invalidateTools(); return { id: r.id, ...record }; }
  if (path === "categories" && method === "GET") return allDocs(categoriesRef);
  if (path === "categories" && method === "POST") { const r = await addDoc(categoriesRef, payload); return { id: r.id, ...payload }; }
  throw new Error(`Firebase migration: unsupported endpoint ${method} ${url}`);
}
