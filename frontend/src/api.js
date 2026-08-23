import { requestFirebase, listUsers } from "./services/firebaseDataStore";
import { createNotification, sendPushNotification } from "./services/notificationService";

const CACHE_TTL = 60000;
const REQUEST_TIMEOUT = 15000;
const LEGACY_TIMEOUT = 3000;
const USER_STORAGE_KEY = "powerhouse_staff_cache_v2";
const userCache = { data: null, at: 0, promise: null };
const taskRouteMap = new Map();

const getLegacyBase = () => {
  const raw = String(import.meta.env.VITE_API_URL || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
};

const unwrapUsers = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.users)) return value.users;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.users)) return value.data.users;
  if (Array.isArray(value?.result)) return value.result;
  return [];
};

const profileValue = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value.url || value.downloadURL || value.path || "");
  return String(value).trim();
};

const isPlaceholderUser = (user) => {
  const name = String(user?.name || user?.displayName || "").trim().toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!name && !email) return true;
  const exactNames = new Set(["vcvf", "lklkj", "jhhk", "drgdfgfd fsgd"]);
  if (exactNames.has(name)) return true;
  const placeholderWords = /^(dummy|test|testing|sample|demo|fake|temp|temporary|asdf|qwerty|user\s*\d*|new\s*user)$/i;
  if (placeholderWords.test(name)) return true;
  if (/^(dummy|test|testing|sample|demo|fake|temp)[+_.-]?[^@]*@/i.test(email)) return true;
  return false;
};

const normalizeUser = (user) => ({
  ...user,
  id: String(user?.numericId ?? user?.employeeIdNumeric ?? user?.id ?? user?.user_id ?? user?.uid ?? ""),
  numericId: Number.isInteger(Number(user?.numericId)) ? Number(user.numericId) : (Number.isInteger(Number(user?.id)) ? Number(user.id) : null),
  uid: String(user?.uid ?? user?.firebaseUid ?? user?.firebase_uid ?? user?.id ?? user?.user_id ?? ""),
  firebaseUid: String(user?.firebaseUid ?? user?.firebase_uid ?? user?.uid ?? ""),
  name: user?.name || user?.displayName || user?.fullName || user?.full_name || user?.username || user?.email || "",
  email: user?.email || "",
  role: user?.role || user?.category || "staff",
  status: user?.status || "active",
  phone: user?.phone || user?.phone_number || "",
  employeeID: user?.employeeID || user?.employee_id || "",
  maritalStatus: user?.maritalStatus || user?.marital_status || "",
  address: user?.address || "",
  backgroundInfo: user?.backgroundInfo || user?.background_info || "",
  gender: user?.gender || "",
  dateOfBirth: user?.dateOfBirth || user?.date_of_birth || "",
  city: user?.city || "",
  country: user?.country || "",
  education: user?.education || "",
  currentStudy: user?.currentStudy || user?.current_study || "",
  institution: user?.institution || "",
  profession: user?.profession || "",
  occupation: user?.occupation || "",
  bio: user?.bio || "",
  skills: Array.isArray(user?.skills) ? user.skills : [],
  languages: Array.isArray(user?.languages) ? user.languages : [],
  interests: Array.isArray(user?.interests) ? user.interests : [],
  socialLinks: user?.socialLinks || {},
  profile_pic: profileValue(user?.profile_pic || user?.profilePic || user?.profile_image || user?.photoURL || user?.photoUrl),
  profilePic: profileValue(user?.profilePic || user?.profile_pic || user?.profile_image || user?.photoURL || user?.photoUrl),
  photoURL: profileValue(user?.photoURL || user?.profilePic || user?.profile_pic || user?.photoUrl),
});

const readStoredUsers = () => {
  try {
    if (typeof window === "undefined") return [];
    const parsed = JSON.parse(window.localStorage.getItem(USER_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeUser).filter((user) => !isPlaceholderUser(user) && (user.id || user.uid)) : [];
  } catch {
    return [];
  }
};

const writeStoredUsers = (users) => {
  try {
    if (typeof window !== "undefined" && Array.isArray(users)) window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
  } catch {}
};

const saveUsers = (users) => {
  const normalized = users.map(normalizeUser).filter((user) => !isPlaceholderUser(user) && (user.id || user.uid));
  userCache.data = normalized;
  userCache.at = Date.now();
  writeStoredUsers(normalized);
  return normalized;
};

const mergeUsers = (legacyUsers, firebaseUsers) => {
  const byEmail = new Map();
  const byUid = new Map();
  const add = (raw, source) => {
    const user = normalizeUser(raw);
    if (isPlaceholderUser(user)) return;
    const email = String(user.email || "").trim().toLowerCase();
    const uid = String(user.uid || user.firebaseUid || "").trim();
    const key = email || uid || String(user.id || "");
    if (!key) return;
    const existing = byEmail.get(email) || byUid.get(uid) || byEmail.get(key);
    const merged = existing
      ? { ...existing, ...user, ...(source === "firebase" ? user : {}), id: Number.isInteger(Number(existing.id)) ? existing.id : user.id }
      : { ...user };
    if (email) byEmail.set(email, merged);
    if (uid) byUid.set(uid, merged);
  };
  legacyUsers.forEach((user) => add(user, "legacy"));
  firebaseUsers.forEach((user) => add(user, "firebase"));
  return [...new Set([...byEmail.values(), ...byUid.values()])]
    .filter((user) => !isPlaceholderUser(user))
    .map(normalizeUser)
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0) || String(a.name || "").localeCompare(String(b.name || "")));
};

const withTimeout = (promise, ms, message = "Request timed out") => {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const legacyGet = async (path) => {
  const base = getLegacyBase();
  if (!base) throw new Error("VITE_API_URL is not configured");
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), LEGACY_TIMEOUT) : null;
  try {
    const response = await fetch(`${base}/api${path}`, { headers: { Accept: "application/json" }, credentials: "include", signal: controller?.signal });
    if (!response.ok) throw new Error(`Legacy API ${response.status}`);
    return response.json();
  } finally { if (timer) clearTimeout(timer); }
};

const invalidateUsers = () => { userCache.data = null; userCache.at = 0; userCache.promise = null; };

const refreshUsers = async () => {
  if (userCache.promise) return userCache.promise;
  userCache.promise = (async () => {
    let legacyUsers = [];
    let firebaseUsers = [];
    await Promise.all([
      getLegacyBase() ? legacyGet("/user/all").then((value) => { legacyUsers = unwrapUsers(value); }).catch((e) => console.warn("Legacy staff API unavailable:", e?.message || e)) : Promise.resolve(),
      withTimeout(listUsers(), REQUEST_TIMEOUT, "Firebase user list timed out").then((value) => { firebaseUsers = Array.isArray(value) ? value : []; }).catch((e) => console.warn("Direct Firebase staff list unavailable:", e?.message || e))
    ]);
    if (!firebaseUsers.length) {
      try {
        firebaseUsers = unwrapUsers(await withTimeout(requestFirebase("GET", "/user/all"), REQUEST_TIMEOUT, "Firebase user list route timed out"));
      } catch (e) { console.warn("Firebase user list route unavailable:", e?.message || e); }
    }
    const merged = mergeUsers(legacyUsers, firebaseUsers);
    if (merged.length) return saveUsers(merged);
    return userCache.data || readStoredUsers();
  })().finally(() => { userCache.promise = null; });
  return userCache.promise;
};

const getUsersFast = async () => {
  if (!userCache.data) {
    const stored = readStoredUsers();
    if (stored.length) { userCache.data = stored; userCache.at = Date.now(); }
  }
  if (userCache.data && Date.now() - userCache.at < CACHE_TTL) return userCache.data;
  return refreshUsers();
};

const firebaseRequest = (method, url, data, params = {}) => withTimeout(requestFirebase(method, url, data, params), REQUEST_TIMEOUT, `Request timed out: ${method} ${url}`);
const isTaskPath = (cleanUrl) => /^\/?task\//.test(cleanUrl);
const rememberTaskRoutes = (activities) => { if (!Array.isArray(activities)) return; activities.forEach((task) => { const internalId = task?.document_id || task?.firestore_id || task?.id; const numeric = Number(task?.task_number || task?.display_id || task?.numeric_id); if (internalId && Number.isInteger(numeric) && numeric > 0) taskRouteMap.set(String(numeric), String(internalId)); }); };
const resolveTaskId = async (id) => { const raw = String(id ?? "").trim(); if (!raw) return raw; if (!/^\d+$/.test(raw)) return raw; const canonical = String(Number(raw)); if (taskRouteMap.has(canonical)) return taskRouteMap.get(canonical); try { const stats = await firebaseRequest("GET", "/activity/stats"); rememberTaskRoutes(stats?.activities); return taskRouteMap.get(canonical) || raw; } catch { return raw; } };

const extractAssignedIds = (data, result) => {
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const values = data.getAll("user_ids[]").map(String).filter(Boolean);
    if (values.length) return [...new Set(values)];
    const single = String(data.get("user_id") || "").trim();
    if (single) return [single];
  }
  const raw = result?.assigned_user_ids || result?.user_ids || (result?.user_id ? [result.user_id] : []);
  return [...new Set((Array.isArray(raw) ? raw : [raw]).map((item) => String(item?.id ?? item?.uid ?? item?.user_id ?? item).trim()).filter(Boolean))];
};

const notifyTaskAssignees = async (result, data) => {
  try {
    const selectedIds = extractAssignedIds(data, result);
    if (!selectedIds.length) return;
    const users = await getUsersFast();
    const recipients = users.filter((user) => selectedIds.some((id) => String(user.id) === String(id) || String(user.uid) === String(id) || String(user.firebaseUid) === String(id)) && String(user.status || "active").toLowerCase() !== "inactive");
    const recipientUids = [...new Set(recipients.map((user) => String(user.uid || user.firebaseUid || "").trim()).filter(Boolean))];
    if (!recipientUids.length) { console.warn("TASK PUSH: no Firebase UID matched selected users", selectedIds); return; }
    const title = String(result?.title || data?.get?.("title") || "New Task Assigned").trim();
    const priority = String(result?.priority || data?.get?.("priority") || "High").trim();
    const taskId = String(result?.id || result?.document_id || result?.task_id || "").trim();
    const route = taskId ? `/task-view/${taskId}` : "/notifications";
    const notificationId = `task-assigned-${taskId || Date.now()}-${recipientUids.join("-")}`;
    await Promise.all(recipientUids.map((uid) => createNotification(uid, { title: "📋 Task Assigned To You", body: `${title} (${priority} priority)`, type: "task_assigned", route, taskId, sourceId: taskId || null }).catch((error) => console.warn("TASK IN-APP NOTIFICATION ERROR:", error?.message || error))));
    await sendPushNotification({ title: "📋 Task Assigned To You", body: `${title} (${priority} priority)`, route, userIds: recipientUids, notificationId });
  } catch (error) { console.warn("TASK PUSH DELIVERY FAILED:", error?.message || error); }
};

const taskAssignedIds = (task) => { const raw = task?.assigned_user_ids ?? task?.user_ids ?? (task?.user_id ? [task.user_id] : []); return [...new Set((Array.isArray(raw) ? raw : [raw]).map((item) => String(item?.id ?? item?.uid ?? item?.user_id ?? item).trim()).filter(Boolean))]; };
const enrichTaskProfiles = async (tasks) => { if (!Array.isArray(tasks) || !tasks.length) return []; const users = await getUsersFast(); return tasks.map((task) => { const ids = taskAssignedIds(task); const assignedUsers = users.filter((user) => ids.some((id) => String(user.id) === String(id) || String(user.uid) === String(id) || String(user.firebaseUid) === String(id))).map((user) => ({ ...user, user_id: String(user.id || user.uid || "") })); return { ...task, assigned_users: assignedUsers.length ? assignedUsers : (Array.isArray(task.assigned_users) ? task.assigned_users : []), assigned_user_profiles: assignedUsers }; }); };
const normalizeTaskForDisplay = (task) => { if (!task || typeof task !== "object") return task; const internalId = task?.document_id || task?.firestore_id || task?.id; const rawNumber = task?.task_number ?? task?.display_id ?? task?.numeric_id; const numeric = rawNumber !== undefined && rawNumber !== null && String(rawNumber).trim() !== "" ? String(rawNumber).padStart(2, "0") : ""; return { ...task, id: numeric || task.id, document_id: internalId || task.document_id, firestore_id: internalId || task.firestore_id, task_number: numeric || task.task_number, display_id: numeric || task.display_id }; };

const API = {
  get: async (url, config = {}) => {
    const cleanUrl = String(url || "").split("?")[0];
    if (cleanUrl === "/user/all" || cleanUrl === "user/all") { const users = await getUsersFast(); return { data: users, users }; }
    if (isTaskPath(cleanUrl) && /^\/?task\/[^/]+$/.test(cleanUrl)) {
      const rawId = cleanUrl.split("/")[2], resolvedId = await resolveTaskId(rawId), resolvedUrl = cleanUrl.replace(`/${rawId}`, `/${resolvedId}`);
      try { const result = await firebaseRequest("GET", resolvedUrl, undefined, config?.params || {}); if (result?.task) { const displayId = result.task.task_number || result.task.display_id || (/^\d+$/.test(rawId) ? String(Number(rawId)).padStart(2, "0") : null); const enriched = (await enrichTaskProfiles([result.task]))[0]; return { data: { ...result, task: { ...normalizeTaskForDisplay(enriched), document_id: result.task.id || enriched.document_id, firestore_id: result.task.id || enriched.firestore_id, id: displayId || result.task.id, display_id: displayId || result.task.display_id, task_number: displayId || result.task.task_number || null } } }; } return { data: result }; }
      catch (firebaseError) { const legacyPath = resolvedUrl.startsWith("/") ? resolvedUrl : `/${resolvedUrl}`; try { return { data: await legacyGet(legacyPath) }; } catch { throw firebaseError; } }
    }
    if (cleanUrl.startsWith("/task/my-tasks/") || cleanUrl.startsWith("task/my-tasks/")) {
      try { const result = await firebaseRequest("GET", url, undefined, config?.params || {}); const rawTasks = Array.isArray(result) ? result : (Array.isArray(result?.tasks) ? result.tasks : []); const enriched = await enrichTaskProfiles(rawTasks); const normalized = enriched.map(normalizeTaskForDisplay); normalized.forEach((task) => { if (task?.document_id && task?.task_number) taskRouteMap.set(String(Number(task.task_number)), String(task.document_id)); }); return { data: normalized, tasks: normalized }; }
      catch (firebaseError) { const legacyPath = cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`; try { return { data: await legacyGet(legacyPath) }; } catch { throw firebaseError; } }
    }
    try {
      const result = await firebaseRequest("GET", url, undefined, config?.params || {});
      if (cleanUrl.startsWith("/user/") || cleanUrl.startsWith("user/")) {
        const id = cleanUrl.split("/")[2], users = await getUsersFast(), profile = users.find((user) => String(user.id) === String(id) || String(user.uid) === String(id) || String(user.firebaseUid) === String(id));
        if (cleanUrl.startsWith("/user/full/") || cleanUrl.startsWith("user/full/")) return { data: { ...result, user: { ...(profile || {}), ...(result?.user || {}) } } };
        return { ...(profile || {}), ...(result || {}) };
      }
      if (cleanUrl === "/duty/staff" || cleanUrl === "duty/staff") { const staff = unwrapUsers(result?.staff); return staff.length ? result : { ...result, staff: await getUsersFast() }; }
      if (cleanUrl === "/duty/summary" || cleanUrl === "duty/summary") { const users = await getUsersFast(); return { ...result, totalStaff: users.length || Number(result?.totalStaff || 0) }; }
      if (cleanUrl === "/activity/stats" || cleanUrl === "activity/stats") {
        const rawActivities = Array.isArray(result?.activities) ? result.activities : [];
        const ordered = [...rawActivities].sort((a, b) => { const da = new Date(a?.created_at || a?.createdAt || 0).getTime(), db = new Date(b?.created_at || b?.createdAt || 0).getTime(); if (da !== db) return da - db; return String(a?.id || "").localeCompare(String(b?.id || "")); });
        const numberByInternalId = new Map(); ordered.forEach((task, index) => { const internalId = task?.document_id || task?.firestore_id || task?.id; if (internalId) numberByInternalId.set(String(internalId), String(task?.task_number || task?.display_id || task?.numeric_id || index + 1).padStart(2, "0")); });
        const activities = rawActivities.map((task, index) => { const internalId = task?.document_id || task?.firestore_id || task?.id, numericId = numberByInternalId.get(String(internalId)) || String(task?.task_number || task?.display_id || task?.numeric_id || index + 1).padStart(2, "0"); return { ...task, id: numericId, document_id: internalId, firestore_id: internalId, task_number: numericId, display_id: numericId }; });
        rememberTaskRoutes(activities);
        const users = await getUsersFast();
        const normalizedResult = { ...(result || {}), activities, staffCount: users.length };
        return { ...normalizedResult, data: normalizedResult };
      }
      if (cleanUrl.startsWith("/tools/user/") || cleanUrl.startsWith("tools/user/")) { if (Array.isArray(result) && result.length) return result; try { return unwrapUsers(await legacyGet(cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`)); } catch { return result; } }
      return result;
    } catch (firebaseError) {
      const legacyPath = cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`;
      try {
        const legacyResult = await legacyGet(legacyPath);
        if (cleanUrl.startsWith("/user/full/") || cleanUrl.startsWith("user/full/")) { const id = cleanUrl.split("/")[2]; let tools = []; try { tools = unwrapUsers(await legacyGet(`/tools/user/${id}`)); } catch {} return { data: { user: legacyResult?.user || legacyResult, tasks: [], tools } }; }
        return legacyResult;
      } catch { throw firebaseError; }
    }
  },
  post: async (url, data, config = {}) => { const result = await firebaseRequest("POST", url, data, config?.params || {}); if (String(url).includes("/user")) invalidateUsers(); if (String(url).replace(/\?.*$/, "/").startsWith("/task/assign")) void notifyTaskAssignees(result?.data || result, data); return result; },
  put: async (url, data, config = {}) => { const cleanUrl = String(url || "").split("?")[0]; let requestUrl = url; if (isTaskPath(cleanUrl) && /^\/?task\/[^/]+$/.test(cleanUrl)) { const rawId = cleanUrl.split("/")[2], resolvedId = await resolveTaskId(rawId); requestUrl = cleanUrl.replace(`/${rawId}`, `/${resolvedId}`); } const result = await firebaseRequest("PUT", requestUrl, data, config?.params || {}); if (String(url).includes("/user/")) invalidateUsers(); return result; },
  patch: (url, data, config = {}) => firebaseRequest("PATCH", url, data, config?.params || {}),
  delete: async (url, config = {}) => { const cleanUrl = String(url || "").split("?")[0]; let requestUrl = url; if (isTaskPath(cleanUrl) && /^\/?task\/[^/]+$/.test(cleanUrl)) { const rawId = cleanUrl.split("/")[2], resolvedId = await resolveTaskId(rawId); requestUrl = cleanUrl.replace(`/${rawId}`, `/${resolvedId}`); } const result = await firebaseRequest("DELETE", requestUrl, undefined, config?.params || {}); if (String(url).includes("/user/")) invalidateUsers(); return result; }
};

export default API;
