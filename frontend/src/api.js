import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { requestFirebase } from "./services/firebaseDataStore";
import { db } from "./firebase";
import { getUser } from "./utils/auth";
import {
  activityStats as taskActivityStats,
  assignTask as createTask,
  completeTask,
  deleteTask,
  getTask,
  isTaskPath,
  listMyTasks,
  listUserTasks,
  updateTask,
  updateTaskStatus,
} from "./services/taskService";

const withTimeout = async (promise, ms, message) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    );
  } finally {
    clearTimeout(timer);
  }
};

class DisplayIdArray extends Array {
  static get [Symbol.species]() { return Array; }
  constructor(values = [], displayValues = []) {
    if (typeof values === "number") { super(values); this._displayValues = []; return; }
    super(...values);
    this._displayValues = Array.isArray(displayValues) ? displayValues : [];
  }
  join(separator = ",") { return this._displayValues.join(separator); }
}

const makeDisplayIds = (values, assignedUsers = [], fallbackNames = []) => {
  if (!Array.isArray(values)) return values;
  const names = Array.isArray(assignedUsers)
    ? assignedUsers.map((user) => String(user?.name || user?.full_name || user?.displayName || user?.email || "").trim()).filter(Boolean)
    : [];
  const displayNames = names.length ? names : Array.isArray(fallbackNames) ? fallbackNames.map(String).filter(Boolean) : [];
  return new DisplayIdArray(values, displayNames);
};

const normalizeAssignedUsers = (task) => {
  if (!task || typeof task !== "object") return task;
  const assignedUsers = Array.isArray(task.assigned_users)
    ? task.assigned_users.map((user) => {
        if (!user || typeof user !== "object") return null;
        const name = String(user.name || user.full_name || user.displayName || user.email || "User").trim();
        return { ...user, id: user.id ?? user.user_id ?? user.uid ?? null, user_id: user.user_id ?? user.id ?? user.uid ?? null, uid: user.uid ?? user.firebaseUid ?? null, name: name || "User", email: user.email || "", role: user.role || "" };
      }).filter(Boolean)
    : [];
  const staffNames = Array.isArray(task.assigned_staff_names) ? task.assigned_staff_names.filter(Boolean).map(String) : assignedUsers.map((user) => user.name).filter(Boolean);
  const staffEmails = Array.isArray(task.assigned_staff_emails) ? task.assigned_staff_emails.filter(Boolean).map(String) : assignedUsers.map((user) => user.email).filter(Boolean);
  const staffRoles = Array.isArray(task.assigned_staff_roles) ? task.assigned_staff_roles.filter(Boolean).map(String) : assignedUsers.map((user) => user.role).filter(Boolean);
  const rawAssignedIds = Array.isArray(task.assigned_user_ids) ? task.assigned_user_ids.map((value) => String(value)) : null;
  return { ...task, assigned_users: assignedUsers.length ? assignedUsers : task.assigned_users, assigned_staff_names: staffNames, assigned_staff_emails: staffEmails, assigned_staff_roles: staffRoles, assigned_user_ids: rawAssignedIds ? makeDisplayIds(rawAssignedIds, assignedUsers, staffNames) : task.assigned_user_ids };
};

const normalizeTask = (task) => {
  if (!task || typeof task !== "object") return task;
  const normalized = normalizeAssignedUsers(task);
  const publicId = /^\d+$/.test(String(normalized.task_number ?? "")) ? String(normalized.task_number) : /^\d+$/.test(String(normalized.display_id ?? "")) ? String(normalized.display_id) : /^\d+$/.test(String(normalized.public_id ?? "")) ? String(normalized.public_id) : null;
  if (!publicId) return normalized;
  return { ...normalized, firestore_id: normalized.firestore_id || null, id: publicId, task_number: publicId, display_id: publicId, public_id: Number(publicId) };
};

const normalizeTaskResponse = (result) => {
  if (Array.isArray(result)) return result.map(normalizeTask);
  if (!result || typeof result !== "object") return result;
  if (result.task && typeof result.task === "object") return { ...result, task: normalizeTask(result.task) };
  if (result.tasks && Array.isArray(result.tasks)) return { ...result, tasks: result.tasks.map(normalizeTask) };
  if (result.activities && Array.isArray(result.activities)) return { ...result, activities: result.activities.map((item) => item?.task && typeof item.task === "object" ? { ...item, task: normalizeTask(item.task) } : normalizeTask(item)) };
  if (result.id || result.task_number || result.display_id || result.public_id) return normalizeTask(result);
  return result;
};

const taskPath = (url) => String(url || "").replace(/^\/api\/?/, "").split("?")[0].replace(/^\/+/, "");

const normalizeTaskRequest = (method, url, data) => {
  const path = taskPath(url);
  if (method === "PUT" && path.startsWith("task/update-status/") && data && typeof data === "object" && typeof FormData !== "undefined" && !(data instanceof FormData)) {
    const user = getUser();
    return { ...data, user_id: data.user_id || user?.firebaseUid || user?.uid || user?.id || user?.user_id || "" };
  }
  if (method === "PUT" && path.startsWith("task/") && typeof FormData !== "undefined" && data instanceof FormData) {
    const status = String(data.get("status") || "").toLowerCase();
    if ((status === "completed" || status === "rejected") && !data.get("reassign_task")) data.append("reassign_task", "true");
  }
  return data;
};

const taskReadCache = new Map();
const taskReadPromises = new Map();
const TASK_READ_TTL = 15000;
const TASK_CACHE_TTL = 1000 * 60 * 15;
const taskCacheKey = (userId) => `powerhouse_tasks_cache_v3_${String(userId)}`;

const readPersistentTaskCache = (userId) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(taskCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tasks) || Date.now() - Number(parsed.at || 0) > TASK_CACHE_TTL) return null;
    return parsed.tasks;
  } catch { return null; }
};

const writePersistentTaskCache = (userId, tasks) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(taskCacheKey(userId), JSON.stringify({ at: Date.now(), tasks: Array.isArray(tasks) ? tasks : [] })); } catch {}
};

const getPrimaryIdentity = (suppliedId) => {
  const user = getUser();
  return String(suppliedId ?? user?.id ?? user?.numericId ?? user?.uid ?? user?.firebaseUid ?? user?.user_id ?? "").trim();
};

const fastListMyTasks = async (userId) => {
  const identity = getPrimaryIdentity(userId);
  if (!identity) return [];
  const cacheKey = identity;
  const memory = taskReadCache.get(cacheKey);
  if (memory && Date.now() - memory.at < TASK_READ_TTL) return memory.value;
  const persistent = readPersistentTaskCache(identity);
  if (persistent) {
    taskReadCache.set(cacheKey, { at: Date.now(), value: persistent });
    // Return cache immediately; one background refresh will still update it below.
    void refreshMyTasksFromFirestore(identity).catch(() => {});
    return persistent;
  }
  if (taskReadPromises.has(cacheKey)) return taskReadPromises.get(cacheKey);
  const promise = refreshMyTasksFromFirestore(identity).finally(() => taskReadPromises.delete(cacheKey));
  taskReadPromises.set(cacheKey, promise);
  return promise;
};

const refreshMyTasksFromFirestore = async (identity) => {
  const found = new Map();
  // The old implementation queried every possible identity against every field (up to 18 reads).
  // Use the canonical current user id first: 3 parallel indexed reads max.
  const fields = ["assigned_user_ids", "user_ids", "assigned_staff_ids"];
  await Promise.all(fields.map(async (field) => {
    try {
      const snapshot = await getDocs(query(collection(db, "tasks"), where(field, "array-contains", identity), limit(100)));
      snapshot.docs.forEach((item) => found.set(item.id, { id: item.id, ...item.data() }));
    } catch {}
  }));

  let result = [...found.values()];
  if (!result.length) {
    try { result = await listMyTasks(identity); } catch { result = []; }
  }
  result = Array.isArray(result) ? result.map(normalizeTask) : [];
  taskReadCache.set(identity, { at: Date.now(), value: result });
  writePersistentTaskCache(identity, result);
  return result;
};

const requestTaskApi = async (method, url, data) => {
  const path = taskPath(url);
  if (!isTaskPath(path)) return null;
  const payload = normalizeTaskRequest(method, url, data);
  if (path === "task/assign" && method === "POST") return createTask(payload);
  if (path.startsWith("task/my-tasks/") && method === "GET") return fastListMyTasks(path.split("/").pop());
  if (path.startsWith("task/update-status/") && method === "PUT") return updateTaskStatus(path.split("/")[2], payload);
  if (path.startsWith("task/complete-work/") && method === "POST") return completeTask(path.split("/")[2], payload);
  if (path.startsWith("task/") && path.split("/").length === 2) {
    const id = path.split("/")[1];
    if (method === "GET") return getTask(id).then((task) => ({ task }));
    if (method === "PUT") return updateTask(id, payload);
    if (method === "DELETE") return deleteTask(id);
  }
  return null;
};

const requestFirebaseApi = async (method, url, data, config = {}) => {
  const taskResult = await requestTaskApi(method, url, data);
  if (taskResult) return withTimeout(Promise.resolve(taskResult), config?.timeout || 20000, `Task request timed out: ${method} ${url}`);
  const path = taskPath(url);
  if (path.startsWith("user/full/") && method === "GET") {
    return withTimeout(requestFirebase(method, url, normalizeTaskRequest(method, url, data), config?.params || {}).then(async (result) => {
      const id = path.split("/")[2];
      const canonicalTasks = await listUserTasks(id);
      return { ...result, tasks: canonicalTasks };
    }), config?.timeout || 20000, `Staff profile request timed out: ${method} ${url}`);
  }
  return withTimeout(requestFirebase(method, url, normalizeTaskRequest(method, url, data), config?.params || {}), config?.timeout || 20000, `Firebase request timed out: ${method} ${url}`);
};

const request = async (method, url, data, config = {}) => {
  try {
    const path = taskPath(url);
    const result = path === "activity/stats" && method === "GET"
      ? await withTimeout(taskActivityStats(), config?.timeout || 20000, "Task dashboard request timed out")
      : await requestFirebaseApi(method, url, data, config);
    return { data: normalizeTaskResponse(result), status: 200, headers: {} };
  } catch (error) {
    const message = error?.response?.data?.message || error?.response?.data?.msg || error?.message || `Firebase request failed: ${method} ${url}`;
    error.message = message;
    error.response = { status: error?.response?.status || 500, data: { success: false, message, msg: message } };
    throw error;
  }
};

const API = {
  get: (url, config = {}) => request("GET", url, undefined, config),
  post: (url, data, config = {}) => request("POST", url, data, config),
  put: (url, data, config = {}) => request("PUT", url, data, config),
  patch: (url, data, config = {}) => request("PATCH", url, data, config),
  delete: (url, config = {}) => request("DELETE", url, undefined, config),
};

export default API;
