import { requestFirebase, listUsers } from "./services/firebaseDataStore";

const CACHE_TTL = 60000;
const REQUEST_TIMEOUT = 15000;
const LEGACY_TIMEOUT = 2000;
const USER_STORAGE_KEY = "powerhouse_staff_cache_v2";
const userCache = { data: null, at: 0, promise: null };

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

const normalizeUser = (user) => ({
  ...user,
  id: String(user?.id ?? user?.uid ?? user?.user_id ?? ""),
  uid: String(user?.uid ?? user?.id ?? user?.user_id ?? ""),
  name: user?.name || user?.fullName || user?.full_name || user?.username || user?.email || "",
  email: user?.email || "",
  role: user?.role || user?.category || "staff",
  status: user?.status || "active",
  phone: user?.phone || user?.phone_number || "",
  employeeID: user?.employeeID || user?.employee_id || "",
  maritalStatus: user?.maritalStatus || user?.marital_status || "",
  address: user?.address || "",
  backgroundInfo: user?.backgroundInfo || user?.background_info || "",
  profile_pic: user?.profile_pic || user?.profilePic || user?.profile_image || ""
});

const withTimeout = (promise, ms, message = "Request timed out") => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const readStoredUsers = () => {
  try {
    if (typeof window === "undefined") return [];
    const parsed = JSON.parse(window.localStorage.getItem(USER_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeUser).filter((user) => user.id || user.uid) : [];
  } catch {
    return [];
  }
};

const writeStoredUsers = (users) => {
  try {
    if (typeof window !== "undefined" && Array.isArray(users) && users.length) {
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
    }
  } catch {
    // Storage is an optimization only; never block staff loading.
  }
};

const saveUsers = (users) => {
  const normalized = users.map(normalizeUser).filter((user) => user.id || user.uid);
  userCache.data = normalized;
  userCache.at = Date.now();
  if (normalized.length) writeStoredUsers(normalized);
  return normalized;
};

const legacyGet = async (path) => {
  const base = getLegacyBase();
  if (!base) throw new Error("VITE_API_URL is not configured");
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), LEGACY_TIMEOUT) : null;
  try {
    const response = await fetch(`${base}/api${path}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`Legacy API ${response.status}`);
    return response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const invalidateUsers = () => {
  userCache.data = null;
  userCache.at = 0;
  userCache.promise = null;
};

const refreshUsers = async () => {
  if (userCache.promise) return userCache.promise;

  userCache.promise = (async () => {
    if (getLegacyBase()) {
      try {
        const legacyUsers = unwrapUsers(await legacyGet("/user/all"));
        if (legacyUsers.length) return saveUsers(legacyUsers);
      } catch (legacyError) {
        console.warn("Legacy staff API unavailable; using Firebase.", legacyError?.message || legacyError);
      }
    }

    try {
      const directUsers = await withTimeout(listUsers(), REQUEST_TIMEOUT, "Firebase user list timed out");
      if (Array.isArray(directUsers) && directUsers.length) return saveUsers(directUsers);
      if (Array.isArray(directUsers) && directUsers.length === 0) return userCache.data || [];
    } catch (directError) {
      console.warn("Direct Firebase staff list unavailable.", directError?.message || directError);
    }

    try {
      const firebaseUsers = unwrapUsers(await withTimeout(
        requestFirebase("GET", "/user/all"),
        REQUEST_TIMEOUT,
        "Firebase user list route timed out"
      ));
      if (firebaseUsers.length) return saveUsers(firebaseUsers);
    } catch (firebaseError) {
      console.warn("Firebase user list route unavailable.", firebaseError?.message || firebaseError);
    }

    return userCache.data || readStoredUsers();
  })().finally(() => {
    userCache.promise = null;
  });

  return userCache.promise;
};

const getUsersFast = async () => {
  // Seed the in-memory cache from the last successful browser session first.
  // This makes Assign Task/Dashboard render staff immediately instead of
  // waiting for a slow Firebase cold start.
  if (!userCache.data) {
    const stored = readStoredUsers();
    if (stored.length) {
      userCache.data = stored;
      userCache.at = Date.now();
    }
  }

  if (userCache.data && Date.now() - userCache.at < CACHE_TTL) return userCache.data;
  return refreshUsers();
};

const firebaseRequest = (method, url, data, params = {}) =>
  withTimeout(
    requestFirebase(method, url, data, params),
    REQUEST_TIMEOUT,
    `Request timed out: ${method} ${url}`
  );

const API = {
  get: async (url, config = {}) => {
    const cleanUrl = String(url || "").split("?")[0];

    if (cleanUrl === "/user/all" || cleanUrl === "user/all") {
      const users = await getUsersFast();
      return { data: users, users };
    }

    try {
      const result = await firebaseRequest("GET", url, undefined, config?.params || {});

      if (cleanUrl.startsWith("/user/") || cleanUrl.startsWith("user/")) {
        const id = cleanUrl.split("/")[2];
        const users = await getUsersFast();
        const profile = users.find((user) => String(user.id) === String(id) || String(user.uid) === String(id));
        if (cleanUrl.startsWith("/user/full/") || cleanUrl.startsWith("user/full/")) {
          return { data: { ...result, user: { ...(profile || {}), ...(result?.user || {}) } } };
        }
        return { ...(profile || {}), ...(result || {}) };
      }

      if (cleanUrl === "/duty/staff" || cleanUrl === "duty/staff") {
        const staff = unwrapUsers(result?.staff);
        return staff.length ? result : { ...result, staff: await getUsersFast() };
      }

      if (cleanUrl === "/duty/summary" || cleanUrl === "duty/summary") {
        if (Number(result?.totalStaff || 0) > 0) return result;
        const users = await getUsersFast();
        return { ...result, totalStaff: users.length || Number(result?.totalStaff || 0) };
      }

      if (cleanUrl === "/activity/stats" || cleanUrl === "activity/stats") {
        const backendStaffCount = Number(result?.staffCount || 0);
        const users = backendStaffCount > 0 ? null : await getUsersFast();
        const normalizedResult = {
          ...(result || {}),
          staffCount: users ? (users.length || backendStaffCount) : backendStaffCount
        };
        // Dashboard.jsx historically consumes axios-style `response.data`,
        // while some other screens consume the response object directly.
        // Return both shapes so the staff fallback is never lost.
        return { ...normalizedResult, data: normalizedResult };
      }

      if (cleanUrl.startsWith("/tools/user/") || cleanUrl.startsWith("tools/user/")) {
        if (Array.isArray(result) && result.length) return result;
        try { return unwrapUsers(await legacyGet(cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`)); } catch { return result; }
      }

      return result;
    } catch (firebaseError) {
      const legacyPath = cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`;
      try {
        const legacyResult = await legacyGet(legacyPath);
        if (cleanUrl.startsWith("/user/full/") || cleanUrl.startsWith("user/full/")) {
          const id = cleanUrl.split("/")[2];
          let tools = [];
          try { tools = unwrapUsers(await legacyGet(`/tools/user/${id}`)); } catch {}
          return { data: { user: legacyResult?.user || legacyResult, tasks: [], tools } };
        }
        return legacyResult;
      } catch {
        throw firebaseError;
      }
    }
  },

  post: async (url, data, config = {}) => {
    const result = await firebaseRequest("POST", url, data, config?.params || {});
    if (String(url).includes("/user")) invalidateUsers();
    return result;
  },

  put: async (url, data, config = {}) => {
    const result = await firebaseRequest("PUT", url, data, config?.params || {});
    if (String(url).includes("/user/")) invalidateUsers();
    return result;
  },

  patch: (url, data, config = {}) => firebaseRequest("PATCH", url, data, config?.params || {}),

  delete: async (url, config = {}) => {
    const result = await firebaseRequest("DELETE", url, undefined, config?.params || {});
    if (String(url).includes("/user/")) invalidateUsers();
    return result;
  }
};

export default API;
