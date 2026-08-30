import axios from "axios";
import { requestFirebase } from "./services/firebaseDataStore";
import { getUser } from "./utils/auth";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
});

const taskPath = (url) => String(url || "").replace(/^\/api\/?/, "").split("?")[0].replace(/^\/+/, "");
const isTaskPath = (path = "") => /(^|\/)(tasks?|my-tasks?|task-view|task-completion|task-report)(\/|$)|task/.test(String(path || "").toLowerCase());

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

const normalizeAssignedUsers = (task) => {
  if (!task || typeof task !== "object") return task;

  const assignedUsers = Array.isArray(task.assigned_users)
    ? task.assigned_users.map((user) => {
        if (!user || typeof user !== "object") return null;
        return {
          ...user,
          id: user.id ?? user.user_id ?? user.uid ?? null,
          user_id: user.user_id ?? user.id ?? user.uid ?? null,
          uid: user.uid ?? user.firebaseUid ?? null,
          name: String(user.name || user.full_name || user.displayName || user.email || "User").trim() || "User",
          email: user.email || "",
          role: user.role || "",
        };
      }).filter(Boolean)
    : [];

  return {
    ...task,
    assigned_users: assignedUsers.length ? assignedUsers : task.assigned_users,
    assigned_staff_names: Array.isArray(task.assigned_staff_names) ? task.assigned_staff_names.filter(Boolean).map(String) : assignedUsers.map((user) => user.name).filter(Boolean),
    assigned_staff_emails: Array.isArray(task.assigned_staff_emails) ? task.assigned_staff_emails.filter(Boolean).map(String) : assignedUsers.map((user) => user.email).filter(Boolean),
    assigned_staff_roles: Array.isArray(task.assigned_staff_roles) ? task.assigned_staff_roles.filter(Boolean).map(String) : assignedUsers.map((user) => user.role).filter(Boolean),
    assigned_user_ids: Array.isArray(task.assigned_user_ids) ? task.assigned_user_ids.map(String) : task.assigned_user_ids,
  };
};

const normalizeTask = (task) => {
  if (!task || typeof task !== "object") return task;
  const normalized = normalizeAssignedUsers(task);
  const publicId = /^\d+$/.test(String(normalized.task_number ?? "")) ? String(normalized.task_number)
    : /^\d+$/.test(String(normalized.display_id ?? "")) ? String(normalized.display_id)
    : /^\d+$/.test(String(normalized.public_id ?? "")) ? String(normalized.public_id) : null;
  if (!publicId) return normalized;
  return { ...normalized, id: publicId, task_number: publicId, display_id: publicId, public_id: Number(publicId), firestore_id: normalized.firestore_id || null };
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
  if (Array.isArray(result.tasks)) return { ...result, tasks: sortTasks(result.tasks.map(normalizeTask)) };
  if (Array.isArray(result.activities)) return { ...result, activities: result.activities.map((item) => item?.task && typeof item.task === "object" ? { ...item, task: normalizeTask(item.task) } : normalizeTask(item)) };
  if (result.id || result.task_number || result.display_id || result.public_id) return normalizeTask(result);
  return result;
};

const normalizeTaskRequest = (method, url, data) => {
  const path = taskPath(url);
  if (method === "PUT" && path.startsWith("task/update-status/") && data && typeof data === "object" && typeof FormData !== "undefined" && !(data instanceof FormData)) {
    const user = getUser();
    return { ...data, user_id: data.user_id || user?.id || user?.numericId || user?.user_id || "" };
  }
  return data;
};

const requestTaskHttp = async (method, path, data, config = {}) => {
  const response = await httpClient.request({ method, url: `/${String(path || "").replace(/^\/+/, "")}`, data, params: config?.params, headers: config?.headers, timeout: config?.timeout || 20000 });
  return response.data;
};

const requestTaskApi = async (method, url, data, config = {}) => {
  const path = taskPath(url);
  if (!isTaskPath(path)) return null;
  return requestTaskHttp(method, path, normalizeTaskRequest(method, url, data), config);
};

const requestFirebaseApi = async (method, url, data, config = {}) => {
  const taskResult = await requestTaskApi(method, url, data, config);
  if (taskResult !== null) return taskResult;
  return withTimeout(requestFirebase(method, url, normalizeTaskRequest(method, url, data), config?.params || {}), config?.timeout || 20000, `Firebase request timed out: ${method} ${url}`);
};

// Dashboard stats are compatibility-safe: prefer the SQL endpoint when it is
// available, but never leave the production dashboard blank when that backend
// URL is unavailable. Existing Firebase stats remain a non-destructive fallback.
const requestActivityStats = async (config = {}) => {
  try {
    return await requestTaskHttp("GET", "activity/stats", undefined, config);
  } catch (sqlError) {
    console.warn("Dashboard SQL stats unavailable; using existing Firebase stats fallback.", sqlError?.message);
    return withTimeout(requestFirebase("GET", "/activity/stats", undefined, config?.params || {}), config?.timeout || 20000, "Firebase activity stats request timed out");
  }
};

const request = async (method, url, data, config = {}) => {
  try {
    const path = taskPath(url);
    const result = path === "activity/stats" && method === "GET"
      ? await requestActivityStats(config)
      : await requestFirebaseApi(method, url, data, config);
    return { data: normalizeTaskResponse(result), status: 200, headers: {} };
  } catch (error) {
    const message = error?.response?.data?.message || error?.response?.data?.msg || error?.message || `Request failed: ${method} ${url}`;
    error.message = message;
    error.response = { status: error?.response?.status || 500, data: { success: false, message, msg: message, ...(error?.response?.data || {}) } };
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
