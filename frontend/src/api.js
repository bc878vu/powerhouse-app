import { requestFirebase } from "./services/firebaseDataStore";

const CACHE_TTL = 30000;
const REQUEST_TIMEOUT = 5000;
const LEGACY_TIMEOUT = 2500;
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

const mergeUsers = (primary, legacy) => {
  const map = new Map();
  [...legacy, ...primary].map(normalizeUser).forEach((user) => {
    const key = user.id || user.uid || user.email.toLowerCase();
    if (!key) return;
    map.set(key, { ...(map.get(key) || {}), ...user });
  });
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

const withTimeout = (promise, ms, message = "Request timed out") => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const legacyGet = async (path) => {
  const base = getLegacyBase();
  if (!base) return null;
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

const getUsersFast = async () => {
  if (userCache.data && Date.now() - userCache.at < CACHE_TTL) return userCache.data;
  if (userCache.promise) return userCache.promise;

  userCache.promise = (async () => {
    // IMPORTANT: use the indexed MySQL staff endpoint first. The old Firebase
    // collection read was able to pull a large collection into the browser and
    // freeze the main thread. Firebase is now only the fallback.
    try {
      const legacyUsers = unwrapUsers(await legacyGet("/user/all"));
      if (legacyUsers.length) {
        const users = mergeUsers([], legacyUsers);
        userCache.data = users;
        userCache.at = Date.now();
        return users;
      }
    } catch (legacyError) {
      console.warn("Fast staff API unavailable; using Firebase fallback.", legacyError?.message || legacyError);
    }

    try {
      const firebaseUsers = unwrapUsers(await withTimeout(
        requestFirebase("GET", "/user/all"),
        REQUEST_TIMEOUT,
        "Firebase user list timed out"
      ));
      const users = mergeUsers(firebaseUsers, []);
      userCache.data = users;
      userCache.at = Date.now();
      return users;
    } catch (firebaseError) {
      console.warn("Firebase user list unavailable.", firebaseError?.message || firebaseError);
      userCache.data = [];
      userCache.at = Date.now();
      return [];
    }
  })().finally(() => {
    userCache.promise = null;
  });

  return userCache.promise;
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
        return { ...result, totalStaff: users.length };
      }

      if (cleanUrl === "/activity/stats" || cleanUrl === "activity/stats") {
        const users = await getUsersFast();
        return { ...result, staffCount: users.length };
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
