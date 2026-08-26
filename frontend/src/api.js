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
    ]);
  } finally {
    clearTimeout(timer);
  }
};

class DisplayIdArray extends Array {
  constructor(values = [], displayValues = []) {
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
    ? assignedUsers
        .map((user) => String(user?.name || user?.full_name || user?.displayName || user?.email || "").trim())
        .filter(Boolean)
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
    ? task.assigned_users
        .map((user) => {
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
        })
        .filter(Boolean)
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

  const publicId =
    /^\d+$/.test(String(normalized.task_number ?? ""))
      ? String(normalized.task_number)
      : /^\d+$/.test(String(normalized.display_id ?? ""))
      ? String(normalized.display_id)
      : /^\d+$/.test(String(normalized.public_id ?? ""))
      ? String(normalized.public_id)
      : null;

  if (!publicId) return normalized;

  return {
    ...normalized,
    firestore_id: normalized.firestore_id || null,
    id: publicId,
    task_number: publicId,
    display_id: publicId,
    public_id: Number(publicId),
  };
};

const normalizeTaskResponse = (result) => {
  if (Array.isArray(result)) return result.map(normalizeTask);
  if (!result || typeof result !== "object") return result;

  if (result.task && typeof result.task === "object") {
    return { ...result, task: normalizeTask(result.task) };
  }

  if (result.tasks && Array.isArray(result.tasks)) {
    return { ...result, tasks: result.tasks.map(normalizeTask) };
  }

  if (result.activities && Array.isArray(result.activities)) {
    return {
      ...result,
      activities: result.activities.map((item) =>
        item?.task && typeof item.task === "object"
          ? { ...item, task: normalizeTask(item.task) }
          : normalizeTask(item)
      ),
    };
  }

  if (result.id || result.task_number || result.display_id || result.public_id) {
    return normalizeTask(result);
  }

  return result;
};

const taskPath = (url) =>
  String(url || "")
    .replace(/^\/api\/?/, "")
    .split("?")[0]
    .replace(/^\/+/, "");

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
      user_id:
        data.user_id ||
        user?.firebaseUid ||
        user?.uid ||
        user?.id ||
        user?.user_id ||
        "",
    };
  }

  if (
    method === "PUT" &&
    path.startsWith("task/") &&
    typeof FormData !== "undefined" &&
    data instanceof FormData
  ) {
    const status = String(data.get("status") || "").toLowerCase();
    if (
      (status === "completed" || status === "rejected") &&
      !data.get("reassign_task")
    ) {
      data.append("reassign_task", "true");
    }
  }

  return data;
};

const taskReadCache = new Map();
const taskReadPromises = new Map();
const TASK_READ_TTL = 2500;

const getCurrentTaskIdentities = (suppliedId) => {
  const user = getUser();
  return [
    suppliedId,
    user?.id,
    user?.numericId,
    user?.uid,
    user?.firebaseUid,
    user?.user_id,
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map(String)
    .filter((value, index, array) => array.indexOf(value) === index);
};

// Lightweight user-task read. The older taskService path also checks
// notifications and several identity fields sequentially; this path queries
// the assignment indexes in parallel and falls back to the complete service
// when Firestore permissions/legacy data require it.
const fastListMyTasks = async (userId) => {
  const identities = getCurrentTaskIdentities(userId);
  const cacheKey = identities.join("|");
  const cached = taskReadCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TASK_READ_TTL) return cached.value;
  if (taskReadPromises.has(cacheKey)) return taskReadPromises.get(cacheKey);

  const promise = (async () => {
    const found = new Map();
    const fields = ["assigned_user_ids", "user_ids", "assigned_staff_ids"];
    const reads = [];

    identities.forEach((identity) => {
      fields.forEach((field) => {
        reads.push(
          getDocs(
            query(
              collection(db, "tasks"),
              where(field, "array-contains", identity),
              limit(100)
            )
          ).then((snapshot) => {
            snapshot.docs.forEach((item) => {
              const data = item.data() || {};
              found.set(item.id, { id: item.id, ...data });
            });
          })
        );
      });
    });

    await Promise.allSettled(reads);

    let result = [...found.values()];
    if (!result.length) {
      result = await listMyTasks(userId);
    }

    result = Array.isArray(result) ? result : [];
    taskReadCache.set(cacheKey, { at: Date.now(), value: result });
    return result;
  })().finally(() => taskReadPromises.delete(cacheKey));

  taskReadPromises.set(cacheKey, promise);
  return promise;
};

const requestTaskApi = async (method, url, data) => {
  const path = taskPath(url);
  if (!isTaskPath(path)) return null;

  const payload = normalizeTaskRequest(method, url, data);

  if (path === "task/assign" && method === "POST") {
    return createTask(payload);
  }

  if (path.startsWith("task/my-tasks/") && method === "GET") {
    return fastListMyTasks(path.split("/").pop());
  }

  // taskService.findTask() already resolves public task numbers to the real
  // Firestore document. Avoid a separate listTasks() scan here because it is
  // slower and can produce permission warnings for user-scoped accounts.
  if (path.startsWith("task/update-status/") && method === "PUT") {
    const id = path.split("/")[2];
    return updateTaskStatus(id, payload);
  }

  if (path.startsWith("task/complete-work/") && method === "POST") {
    const id = path.split("/")[2];
    return completeTask(id, payload);
  }

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

  if (taskResult) {
    return withTimeout(
      Promise.resolve(taskResult),
      config?.timeout || 20000,
      `Task request timed out: ${method} ${url}`
    );
  }

  const path = taskPath(url);

  if (path.startsWith("user/full/") && method === "GET") {
    return withTimeout(
      requestFirebase(
        method,
        url,
        normalizeTaskRequest(method, url, data),
        config?.params || {}
      ).then(async (result) => {
        const id = path.split("/")[2];
        const canonicalTasks = await listUserTasks(id);
        return { ...result, tasks: canonicalTasks };
      }),
      config?.timeout || 20000,
      `Staff profile request timed out: ${method} ${url}`
    );
  }

  return withTimeout(
    requestFirebase(
      method,
      url,
      normalizeTaskRequest(method, url, data),
      config?.params || {}
    ),
    config?.timeout || 20000,
    `Firebase request timed out: ${method} ${url}`
  );
};

const request = async (method, url, data, config = {}) => {
  try {
    const path = taskPath(url);
    const result =
      path === "activity/stats" && method === "GET"
        ? await withTimeout(
            taskActivityStats(),
            config?.timeout || 20000,
            "Task dashboard request timed out"
          )
        : await requestFirebaseApi(method, url, data, config);

    return {
      data: normalizeTaskResponse(result),
      status: 200,
      headers: {},
    };
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.msg ||
      error?.message ||
      `Firebase request failed: ${method} ${url}`;

    error.message = message;
    error.response = {
      status: error?.response?.status || 500,
      data: {
        success: false,
        message,
        msg: message,
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
