import axios from "axios";
import { requestFirebase } from "./services/firebaseDataStore";
import { getUser } from "./utils/auth";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");
const httpClient = axios.create({ baseURL: API_BASE_URL, timeout: 20000, withCredentials: true });
const taskPath = (url) => String(url || "").replace(/^\/api\/?/, "").split("?")[0].replace(/^\/+/, "");
const isTaskPath = (path = "") => /(^|\/)(tasks?|my-tasks?|task-view|task-completion|task-report)(\/|$)|task/.test(String(path || "").toLowerCase());
const isSqlStatsEnabled = () => String(import.meta.env.VITE_ENABLE_SQL_STATS || "").toLowerCase() === "true";
const isNetworkFailure = (error) => !error?.response || String(error?.code || "").startsWith("ERR_NETWORK") || String(error?.message || "").toLowerCase().includes("network error");
const withTimeout = async (promise, ms, message) => { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); } finally { clearTimeout(timer); } };

const asArray = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : (() => { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : [parsed]; } catch { return [value]; } })();
const normalizeAssignedUsers = (task) => {
  if (!task || typeof task !== "object") return task;
  const rawUsers = asArray(task.assigned_users).length ? asArray(task.assigned_users) : asArray(task.assignees).length ? asArray(task.assignees) : asArray(task.assigned_staff).length ? asArray(task.assigned_staff) : asArray(task.assigned_to);
  const names = asArray(task.assigned_staff_names).length ? asArray(task.assigned_staff_names) : asArray(task.staff_names);
  const ids = asArray(task.assigned_user_ids).length ? asArray(task.assigned_user_ids) : asArray(task.user_ids);
  const emails = asArray(task.assigned_staff_emails);
  const roles = asArray(task.assigned_staff_roles);
  const assignedUsers = rawUsers.map((user, index) => {
    const source = user && typeof user === "object" ? user : {};
    const name = source.name || source.full_name || source.displayName || source.staff_name || names[index] || (typeof user === "string" && !/^\d+$/.test(user) ? user : "") || task.staff_name || "";
    const id = source.id ?? source.user_id ?? source.uid ?? ids[index] ?? (typeof user === "string" && /^\d+$/.test(user) ? user : null) ?? task.user_id ?? null;
    return { ...source, id, user_id: source.user_id ?? id, uid: source.uid ?? source.firebaseUid ?? null, name: String(name || "User").trim() || "User", email: source.email || emails[index] || "", role: source.role || roles[index] || "" };
  }).filter((u) => u.id != null || u.name !== "User");
  if (!assignedUsers.length && (ids.length || names.length || task.user_id || task.staff_name)) {
    const count = Math.max(ids.length, names.length, emails.length, roles.length, 1);
    for (let i = 0; i < count; i++) assignedUsers.push({ id: ids[i] ?? task.user_id ?? null, user_id: ids[i] ?? task.user_id ?? null, name: String(names[i] ?? task.staff_name ?? "User").trim() || "User", email: emails[i] || "", role: roles[i] || "" });
  }
  const primary = assignedUsers[0] || null;
  return {
    ...task,
    assigned_users: assignedUsers,
    assigned_staff_names: assignedUsers.map((u) => u.name).filter(Boolean),
    assigned_staff_emails: assignedUsers.map((u) => u.email).filter(Boolean),
    assigned_staff_roles: assignedUsers.map((u) => u.role).filter(Boolean),
    assigned_user_ids: assignedUsers.map((u) => u.user_id ?? u.id).filter((v) => v != null).map(String),
    user_id: task.user_id ?? primary?.user_id ?? primary?.id ?? null,
    staff_name: task.staff_name || primary?.name || ""
  };
};
const normalizeTask = (task) => {
  if (!task || typeof task !== "object") return task;
  const normalized = normalizeAssignedUsers(task);
  const publicId = /^\d+$/.test(String(normalized.task_number ?? "")) ? String(normalized.task_number) : /^\d+$/.test(String(normalized.display_id ?? "")) ? String(normalized.display_id) : /^\d+$/.test(String(normalized.public_id ?? "")) ? String(normalized.public_id) : null;
  return publicId ? { ...normalized, id: publicId, task_number: publicId, display_id: publicId, public_id: Number(publicId), firestore_id: normalized.firestore_id || null } : normalized;
};
const priorityRank = { critical: 0, urgent: 0, high: 1, medium: 2, low: 3 }, statusRank = { pending: 0, new: 0, "in progress": 1, running: 1, rejected: 2, completed: 3 };
const normStatus = (v) => String(v || "Pending").trim().toLowerCase().replace(/_/g, " ");
const sortTasks = (tasks) => [...(Array.isArray(tasks) ? tasks : [])].sort((a, b) => { const sa = statusRank[normStatus(a?.status)] ?? 1, sb = statusRank[normStatus(b?.status)] ?? 1; if (sa !== sb) return sa - sb; if (sa === 0) { const pa = priorityRank[String(a?.priority || "Medium").toLowerCase()] ?? 2, pb = priorityRank[String(b?.priority || "Medium").toLowerCase()] ?? 2; if (pa !== pb) return pa - pb; } const ta = new Date(a?.assigned_at || a?.created_at || a?.updated_at || 0).getTime() || 0, tb = new Date(b?.assigned_at || b?.created_at || b?.updated_at || 0).getTime() || 0; return tb - ta || Number(b?.id || 0) - Number(a?.id || 0); });
const normalizeTaskResponse = (result) => { if (Array.isArray(result)) return sortTasks(result.map(normalizeTask)); if (!result || typeof result !== "object") return result; if (result.task && typeof result.task === "object") return { ...result, task: normalizeTask(result.task) }; if (Array.isArray(result.tasks)) return { ...result, tasks: sortTasks(result.tasks.map(normalizeTask)) }; if (Array.isArray(result.activities)) return { ...result, activities: result.activities.map((item) => item?.task && typeof item.task === "object" ? { ...item, task: normalizeTask(item.task) } : normalizeTask(item)) }; return (result.id || result.task_number || result.display_id || result.public_id) ? normalizeTask(result) : result; };
const normalizeTaskRequest = (method, url, data) => { const path = taskPath(url); if (method === "PUT" && path.startsWith("task/update-status/") && data && typeof data === "object" && typeof FormData !== "undefined" && !(data instanceof FormData)) { const user = getUser(); return { ...data, user_id: data.user_id || user?.id || user?.numericId || user?.user_id || "" }; } return data; };
const requestTaskHttp = async (method, path, data, config = {}) => (await httpClient.request({ method, url: `/${String(path || "").replace(/^\/+/, "")}`, data, params: config?.params, headers: config?.headers, timeout: config?.timeout || 20000 })).data;
const requestFirebaseApi = async (method, url, data, config = {}) => withTimeout(requestFirebase(method, url, normalizeTaskRequest(method, url, data), config?.params || {}), config?.timeout || 20000, `Firebase request timed out: ${method} ${url}`);
const requestData = async (method, url, data, config = {}) => { const path = taskPath(url), payload = normalizeTaskRequest(method, url, data); if (path === "activity/stats" && method === "GET") return isSqlStatsEnabled() ? requestTaskHttp(method, path, undefined, config) : requestFirebaseApi(method, url, undefined, config); if (!isTaskPath(path)) return requestFirebaseApi(method, url, payload, config); try { return await requestTaskHttp(method, path, payload, config); } catch (error) { if (!isNetworkFailure(error)) throw error; return requestFirebaseApi(method, url, payload, config); } };
const request = async (method, url, data, config = {}) => { try { const result = await requestData(method, url, data, config); return { data: normalizeTaskResponse(result), status: 200, headers: {} }; } catch (error) { const message = error?.response?.data?.message || error?.response?.data?.msg || error?.message || `Request failed: ${method} ${url}`; error.message = message; error.response = { status: error?.response?.status || 500, data: { success: false, message, msg: message, ...(error?.response?.data || {}) } }; throw error; } };
const API = { get: (url, config = {}) => request("GET", url, undefined, config), post: (url, data, config = {}) => request("POST", url, data, config), put: (url, data, config = {}) => request("PUT", url, data, config), patch: (url, data, config = {}) => request("PATCH", url, data, config), delete: (url, config = {}) => request("DELETE", url, undefined, config) };
export default API;
