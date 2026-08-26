import { requestFirebase } from "./services/firebaseDataStore";
import { getUser } from "./utils/auth";
import {
  activityStats as taskActivityStats,
  assignTask as createTask,
  completeTask,
  deleteTask,
  getTask,
  isTaskPath,
  listMyTasks,
  listTasks,
  listUserTasks,
  updateTask,
  updateTaskStatus,
} from "./services/taskService";

const withTimeout = async (promise, ms, message) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]);
  } finally { clearTimeout(timer); }
};

const normalizeTask = (task) => {
  if (!task || typeof task !== "object") return task;
  const publicId = /^\d+$/.test(String(task.task_number ?? "")) ? String(task.task_number) : /^\d+$/.test(String(task.display_id ?? "")) ? String(task.display_id) : null;
  if (!publicId) return task;
  return { ...task, firestore_id: task.firestore_id || null, id: publicId, task_number: publicId, display_id: publicId };
};
const normalizeTaskResponse = (result) => {
  if (Array.isArray(result)) return result.map(normalizeTask);
  if (!result || typeof result !== "object") return result;
  if (result.task && typeof result.task === "object") return { ...result, task: normalizeTask(result.task) };
  if (result.tasks && Array.isArray(result.tasks)) return { ...result, tasks: result.tasks.map(normalizeTask) };
  if (result.id || result.task_number || result.display_id) return normalizeTask(result);
  return result;
};
const taskPath = (url) => String(url || "").replace(/^\/api\/?/, "").split("?")[0].replace(/^\/+/, "");
const normalizeTaskRequest = (method, url, data) => {
  const path = taskPath(url);
  if (method === "PUT" && path.startsWith("task/update-status/") && data && typeof data === "object" && !(data instanceof FormData)) {
    const user = getUser();
    return { ...data, user_id: data.user_id || user?.firebaseUid || user?.uid || user?.id || user?.user_id || "" };
  }
  if (method === "PUT" && path.startsWith("task/") && typeof FormData !== "undefined" && data instanceof FormData) {
    const status = String(data.get("status") || "").toLowerCase();
    if ((status === "completed" || status === "rejected") && !data.get("reassign_task")) data.append("reassign_task", "true");
  }
  return data;
};

// Resolve the public sequential task number (shown throughout the UI)
// to the real Firestore document id before any single-task operation.
// This keeps old/legacy tasks working even when task_number/display_id
// were not stored on the original document but public_id was.
const resolveTaskServiceId = async (id) => {
  const raw = String(id ?? "").trim();
  if (!raw) return raw;

  try {
    const numeric = Number(raw);
    const tasks = await listTasks({ migrate: true });
    const match = tasks.find((task) => {
      const firestoreId = String(task?.firestore_id ?? "").trim();
      const taskId = String(task?.id ?? "").trim();
      const taskNumber = String(task?.task_number ?? "").trim();
      const displayId = String(task?.display_id ?? "").trim();
      const publicId = String(task?.public_id ?? "").trim();

      return (
        firestoreId === raw ||
        taskId === raw ||
        taskNumber === raw ||
        displayId === raw ||
        publicId === raw ||
        (Number.isInteger(numeric) && numeric > 0 && (
          Number(taskNumber) === numeric ||
          Number(displayId) === numeric ||
          Number(publicId) === numeric ||
          Number(taskId) === numeric
        ))
      );
    });

    return match?.firestore_id || match?.id || raw;
  } catch (error) {
    console.warn("Task public-id resolver fallback:", error?.message || error);
    return raw;
  }
};

const requestTaskApi = async (method, url, data) => {
  const path = taskPath(url);
  if (!isTaskPath(path)) return null;
  const payload = normalizeTaskRequest(method, url, data);

  if (path === "task/assign" && method === "POST") return createTask(payload);
  if (path.startsWith("task/my-tasks/") && method === "GET") return listMyTasks(path.split("/").pop());

  if (path.startsWith("task/update-status/") && method === "PUT") {
    const id = await resolveTaskServiceId(path.split("/")[2]);
    return updateTaskStatus(id, payload);
  }

  if (path.startsWith("task/complete-work/") && method === "POST") {
    const id = await resolveTaskServiceId(path.split("/")[2]);
    return completeTask(id, payload);
  }

  if (path.startsWith("task/") && path.split("/").length === 2) {
    const id = await resolveTaskServiceId(path.split("/")[1]);
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
