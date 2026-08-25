import { requestFirebase } from "./services/firebaseDataStore";
import { getUser } from "./utils/auth";

// Firebase-only API adapter.
// Preserve the existing axios-like { data } contract used throughout the UI.
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

const normalizeTask = (task) => {
  if (!task || typeof task !== "object") return task;
  const publicId = /^\d+$/.test(String(task.task_number ?? ""))
    ? String(task.task_number)
    : /^\d+$/.test(String(task.display_id ?? ""))
      ? String(task.display_id)
      : null;
  if (!publicId) return task;
  return { ...task, firestore_id: task.firestore_id || task.id || null, id: publicId, task_number: publicId, display_id: publicId };
};

const normalizeTaskResponse = (result) => {
  if (Array.isArray(result)) return result.map(normalizeTask);
  if (!result || typeof result !== "object") return result;
  if (result.task && typeof result.task === "object") return { ...result, task: normalizeTask(result.task) };
  if (result.tasks && Array.isArray(result.tasks)) return { ...result, tasks: result.tasks.map(normalizeTask) };
  if (result.id || result.task_number || result.display_id) return normalizeTask(result);
  return result;
};

const normalizeTaskRequest = (method, url, data) => {
  const path = String(url || "").replace(/^\/api\/?/, "").split("?")[0];
  if (method === "PUT" && path.startsWith("task/update-status/") && data && typeof data === "object" && !(data instanceof FormData)) {
    const user = getUser();
    return { ...data, user_id: data.user_id || user?.id || user?.user_id || user?.uid || "" };
  }
  if (method === "PUT" && path.startsWith("task/") && typeof FormData !== "undefined" && data instanceof FormData) {
    const status = String(data.get("status") || "").toLowerCase();
    if ((status === "completed" || status === "rejected") && !data.get("reassign_task")) data.append("reassign_task", "true");
  }
  return data;
};

const requestFirebaseApi = (method, url, data, config = {}) =>
  withTimeout(
    requestFirebase(method, url, normalizeTaskRequest(method, url, data), config?.params || {}),
    config?.timeout || 20000,
    `Firebase request timed out: ${method} ${url}`
  );

const request = async (method, url, data, config = {}) => {
  try {
    const result = await requestFirebaseApi(method, url, data, config);
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
