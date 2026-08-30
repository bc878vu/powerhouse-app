import axios from "axios";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { requestFirebase } from "./services/firebaseDataStore";
import { db } from "./firebase";
import { getUser } from "./utils/auth";
import { listUserTasks } from "./services/taskService";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
});

const withTimeout = async (promise, ms, message) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

class DisplayIdArray extends Array {
  static get [Symbol.species]() { return Array; }
  constructor(values = [], displayValues = []) {
    if (typeof values === "number") {
      super(values);
      this._displayValues = [];
      return;
    }
    super(...values);
    this._displayValues = Array.isArray(displayValues) ? displayValues : [];
  }
  join(separator = ",") {
    return this._displayValues.join(separator);
  }
}

const makeDisplayIds = (values, assignedUsers = [], fallbackNames = []) => {
  if (!Array.isArray(values)) return values;
  const names = Array.isArray(assignedUsers)
    ? assignedUsers.map((user) => String(user?.name || user?.full_name || user?.displayName || user?.email || "").trim()).filter(Boolean)
    : [];
  const displayNames = names.length
    ? names
    : Array.isArray(fallbackNames)
      ? fallbackNames.map(String).filter(Boolean)
      : [];
  return new DisplayIdArray(values, displayNames);
};

const normalizeAssignedUsers = (task) => {
  if (!task || typeof task !== "object") return task;
  const assignedUsers = Array.isArray(task.assigned_users)
    ? task.assigned_users.map((user) => {
        if (!user || typeof user !== "object") return null;
        const name = String(user.name || user.full_name || user.displayName || user.email || "User").trim();
        return {
          ...user,
          id: user.id ?? user.user_id ?? user.uid ?? null,
          user_id: user.user_id ?? user.id ?? user.uid ?? null,
          uid: user.uid ?? user.firebaseUid ?? null,
          name: name || "User",
          email: user.email || "",
          role: user.role || "",
        };
      }).filter(Boolean)
    : [];
  const staffNames = Array.isArray(task.assigned_staff_names)
    ? task.assigned_staff_names.filter(Boolean).map(String)
    : assignedUsers.map((user) => user.name).filter(Boolean);
  const staffEmails = Array.isArray(task.assigned_staff_emails)
    ? task.assigned_staff_emails.filter(Boolean).map(String)
    : assignedUsers.map((user) => user.email).filter(Boolean);
  const staffRoles = Array.isArray(task.assigned_staff_roles)
    ? task.assigned_staff_roles.filter(Boolean).map(String)
    : assignedUsers.map((user) => user.role).filter(Boolean);
  const rawAssignedIds = Array.isArray(task.assigned_user_ids)
    ? task.assigned_user_ids.map((value) => String(value))
    : null;

  return {
    ...task,
    assigned_users: assignedUsers.length ? assignedUsers : task.assigned_users,
    assigned_staff_names: staffNames,
    assigned_staff_emails: staffEmails,
    assigned_staff_roles: staffRoles,
    assigned_user_ids: rawAssignedIds
      ? makeDisplayIds(rawAssignedIds, assignedUsers, staffNames)
      : task.assigned_user_ids,
  };
};

const normalizeTask = (task) => {
  if (!task || typeof task !== "object") return task;
  const normalized = normalizeAssignedUsers(task);
  const publicId = /^\d+$/.test(String(normalized.task_number ?? ""))
    ? String(normalized.task_number)
    : /^\d+$/.test(String(normalized.display_id ?? ""))
      ? String(normalized.display_id)
      : /^\d+$/.test(String(normalized.public_id ?? ""))
        ? String(normalized.public_id)
        : null;

  return publicId
    ? {
        ...normalized,
        firestore_id: normalized.firestore_id || null,
        id: publicId,
        task_number: publicId,
        display_id: publicId,
        public_id: Number(publicId),
      }
    : normalized;
};

const priorityRank = { critical: 0, urgent: 0, high: 1, medium: 2, low: 3 };
const statusRank = { pending: 0, new: 0, "in progress": 1, running: 1, rejected: 2, completed: 3 };
const normStatus = (v) => String(v || "Pending").trim().toLowerCase().replace(/_/g, " ");
const sortTasks = (tasks) => [...(Array.isArray(tasks) ? tasks : [])].sort((a, b) => {
  const sa = statusRank[normStatus(a?.status)] ?? 1;
  const sb = statusRank[normStatus(b?.status)] ?? 1;
  if (sa !== sb) return sa - sb;
  if (sa === 0) {
    const pa = priorityRank[String(a?.priority || "Medium").toLowerCase()] ?? 2;
    const pb = priorityRank[String(b?.priority || "Medium").toLowerCase()] ?? 2;
    if (pa !== pb) return pa - pb;
  }
  const ta = new Date(a?.assigned_at || a?.created_at || a?.updated_at || 0).getTime() || 0;
  const tb = new Date(b?.assigned_at || b?.created_at || b?.updated_at || 0).getTime() || 0;
  return tb - ta || Number(b?.id || 0) - Number(a?.id || 0);
});

const normalizeTaskResponse = (result) => {
  if (Array.isArray(result)) return sortTasks(result.map(normalizeTask));
  if (!result || typeof result !== "object") return result;
  if (result.task && typeof result.task === "object") return { ...result, task: normalizeTask(result.task) };
  if (result.tasks && Array.isArray(result.tasks)) return { ...result, tasks: sortTasks(result.tasks.map(normalizeTask)) };
  if (result.activities && Array.isArray(result.activities)) {
    return {
      ...result,
      activities: result.activities.map((item) => item?.task && typeof item.task === "object"
        ? { ...item, task: normalizeTask(item.task) }
        : normalizeTask(item)),
    };
  }
  if (result.id || result.task_number || result.display_id || result.public_id) return normalizeTask(result);
  return result;
};

const taskPath = (url) => String(url || "").replace(/^\/api\/?/, "").split("?")[0].replace(/^\/+/, "");

const normalizeTaskRequest = (method, url, data) => {
  const path = taskPath(url);
  if (
    method === "PUT" &&
    path.startsWith("task/update-status/") &&
    data &&
    typeof data === "object" &&
    typeof FormData !== "undefined" &&
    !(data instanceof FormData)
  ) {
    const user = getUser();
    return {
      ...data,
      user_id: data.user_id || user?.id || user?.numericId || user?.firebaseUid || user?.uid || user?.user_id || "",
    };
  }
  return data;
};

const taskReadCache = new Map();
const taskReadPromises = new Map();
const TASK_READ_TTL = 1500;
const TASK_CACHE_TTL = 1000 * 60 * 15;
const taskCacheKey = (userId) => `powerhouse_tasks_cache_v4_${String(userId)}`;

const readPersistentTaskCache = (userId) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(taskCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tasks) || Date.now() - Number(parsed.at || 0) > TASK_CACHE_TTL) return null;
    return sortTasks(parsed.tasks);
  } catch {
    return null;
  }
};

const writePersistentTaskCache = (userId, tasks) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(taskCacheKey(userId), JSON.stringify({ at: Date.now(), tasks: sortTasks(tasks) }));
  } catch {}
};

const invalidateTaskCache = (userId) => {
  const identity = String(userId || getUser()?.id || getUser()?.uid || getUser()?.firebaseUid || "").trim();
  if (identity) taskReadCache.delete(identity);
};

const getPrimaryIdentity = (suppliedId) => {
  const user = getUser();
  return String(suppliedId ?? user?.id ?? user?.numericId ?? user?.uid ?? user?.firebaseUid ?? user?.user_id ?? "").trim();
};

const timedTaskQuery = async (field, identity) => {
  try {
    const snapshot = await Promise.race([
      getDocs(query(collection(db, "tasks"), where(field, "array-contains", identity), limit(100))),
      new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    return snapshot?.docs || [];
  } catch {
    return [];
  }
};

const refreshMyTasksFromFirestore = async (identity) => {
  const found = new Map();
  const fields = ["assigned_user_ids", "user_ids", "assigned_staff_ids"];
  const results = await Promise.all(fields.map((field) => timedTaskQuery(field, identity)));
  results.flat().forEach((item) => found.set(item.id, { id: item.id, ...item.data() }));
  if (found.size) {
    const result = sortTasks([...found.values()].map(normalizeTask));
    taskReadCache.set(identity, { at: Date.now(), value: result });
    writePersistentTaskCache(identity, result);
    return result;
  }
  const fallback = await listUserTasks(identity).catch(() => []);
  const result = sortTasks(Array.isArray(fallback) ? fallback.map(normalizeTask) : []);
  taskReadCache.set(identity, { at: Date.now(), value: result });
  writePersistentTaskCache(identity, result);
  return result;
};

const fastListMyTasks = async (userId, force = false) => {
  const identity = getPrimaryIdentity(userId);
  if (!identity) return [];
  const memory = taskReadCache.get(identity);
  if (!force && memory && Date.now() - memory.at < TASK_READ_TTL) return sortTasks(memory.value);
  if (!force && taskReadPromises.has(identity)) return taskReadPromises.get(identity);
  const promise = refreshMyTasksFromFirestore(identity).finally(() => taskReadPromises.delete(identity));
  taskReadPromises.set(identity, promise);
  return promise;
};

const requestTaskHttp = async (method, path, data, config = {}) => {
  const normalizedPath = `/${String(path || "").replace(/^\/+/, "")}`;
  const response = await httpClient.request({
    method,
    url: normalizedPath,
    data,
    params: config?.params,
    headers: config?.headers,
    timeout: config?.timeout || 20000,
  });
  return response.data;
};

const isTaskPath = (path = "") => /(^|\/)(tasks?|my-tasks?|task-view|task-completion|task-report)(\/|$)|task/.test(String(path || "").toLowerCase());

const requestTaskApi = async (method, url, data, config = {}) => {
  const path = taskPath(url);
  if (!isTaskPath(path)) return null;
  const payload = normalizeTaskRequest(method, url, data);
  // SQL-backed task routes are the single source of truth for assignment,
  // status, history and completion evidence.
  return requestTaskHttp(method, path, payload, config);
};

const requestFirebaseApi = async (method, url, data, config = {}) => {
  const taskResult = await requestTaskApi(method, url, data, config);
  if (taskResult) return withTimeout(Promise.resolve(taskResult), config?.timeout || 20000, `Task request timed out: ${method} ${url}`);

  const path = taskPath(url);
  if (path.startsWith("user/full/") && method === "GET") {
    return withTimeout(
      requestFirebase(method, url, normalizeTaskRequest(method, url, data), config?.params || {})
        .then(async (result) => ({ ...result, tasks: sortTasks(await listUserTasks(path.split("/").pop())) })),
      config?.timeout || 20000,
      `Staff profile request timed out: ${method} ${url}`,
    );
  }

  return withTimeout(
    requestFirebase(method, url, normalizeTaskRequest(method, url, data), config?.params || {}),
    config?.timeout || 20000,
    `Firebase request timed out: ${method} ${url}`,
  );
};

const request = async (method, url, data, config = {}) => {
  try {
    const path = taskPath(url);
    const result = path === "activity/stats" && method === "GET"
      ? await requestTaskHttp("GET", "activity/stats", undefined, config)
      : await requestFirebaseApi(method, url, data, config);

    return {
      data: normalizeTaskResponse(result),
      status: 200,
      headers: {},
    };
  } catch (error) {
    const message = error?.response?.data?.message
      || error?.response?.data?.msg
      || error?.message
      || `Request failed: ${method} ${url}`;
    error.message = message;
    error.response = {
      status: error?.response?.status || 500,
      data: {
        success: false,
        message,
        msg: message,
        ...(error?.response?.data || {}),
      },
    };
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
