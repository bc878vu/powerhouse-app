import { requestFirebase } from "./services/firebaseDataStore";

const LEGACY_TIMEOUT = 20000;
const getLegacyBase = () => {
  const raw = String(import.meta.env.VITE_API_URL || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
};
const normalizePath = (value) => {
  const path = String(value || "").split("?")[0];
  return path.startsWith("/") ? path : `/${path}`;
};
const isLegacyPath = (path) => /^\/(user|task|duty|tools|activity)(?:\/|$)/i.test(normalizePath(path));
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
const unwrapUsers = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.users)) return value.users;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.result)) return value.result;
  return [];
};
const isFakeUser = (user) => {
  const name = String(user?.name || "").trim().toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  const localPart = email.split("@")[0] || "";
  const fakeNames = new Set([
    "vcvf", "lklkj", "jhhk", "drgdfgfd fsgd", "dummy", "test",
    "testing", "sample", "demo", "fake", "temporary", "temp user", "new user",
  ]);
  if (fakeNames.has(name)) return true;
  if (/^(dummy|test|testing|sample|demo|fake|temp)[+_.-]?[^@]*@/i.test(email)) return true;
  return name === localPart && /\d/.test(name);
};
const normalizeUser = (user) => ({
  ...user,
  id: String(user?.id ?? user?.numericId ?? user?.user_id ?? ""),
  numericId: Number.isInteger(Number(user?.id)) ? Number(user.id) : null,
  uid: String(user?.uid ?? user?.firebaseUid ?? ""),
  name: user?.name || user?.displayName || user?.email || "",
  email: String(user?.email || "").trim().toLowerCase(),
  role: user?.role || user?.category || "staff",
  status: user?.status || "active",
  phone: user?.phone || "",
  employeeID: user?.employeeID || "",
  maritalStatus: user?.maritalStatus || "",
  address: user?.address || "",
  backgroundInfo: user?.backgroundInfo || "",
  profile_pic: user?.profile_pic || user?.profilePic || "",
});
const preferredUser = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const aEmployee = Boolean(String(a.employeeID || "").trim());
  const bEmployee = Boolean(String(b.employeeID || "").trim());
  if (aEmployee !== bEmployee) return aEmployee ? a : b;
  const aPhoto = Boolean(String(a.profile_pic || "").trim());
  const bPhoto = Boolean(String(b.profile_pic || "").trim());
  if (aPhoto !== bPhoto) return aPhoto ? a : b;
  return Number(a.id || 0) <= Number(b.id || 0) ? a : b;
};
const dedupeUsers = (users) => {
  const byEmail = new Map();
  const byId = new Map();
  for (const raw of users || []) {
    const user = normalizeUser(raw);
    if (isFakeUser(user)) continue;
    const email = user.email;
    const id = user.id;
    if (!email && !id) continue;
    const existing = (email && byEmail.get(email)) || byId.get(id);
    const preferred = preferredUser(existing, user);
    if (email) byEmail.set(email, preferred);
    if (id) byId.set(id, preferred);
  }
  return [...new Set([...byEmail.values(), ...byId.values()])].sort(
    (a, b) => Number(a.id || 0) - Number(b.id || 0)
  );
};
const buildLegacyUrl = (path) => {
  const base = getLegacyBase();
  if (!base) throw new Error("VITE_API_URL is not configured.");
  return `${base}/api${normalizePath(path)}`;
};
const legacyRequest = async (method, path, data, config = {}) => {
  const url = buildLegacyUrl(path);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), config.timeout || LEGACY_TIMEOUT)
    : null;
  try {
    const options = {
      method,
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    };
    if (data !== undefined && data !== null && method !== "GET" && method !== "HEAD") {
      if (typeof FormData !== "undefined" && data instanceof FormData) {
        options.body = data;
      } else {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(data);
      }
    }
    const response = await fetch(url, options);
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }
    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `API ${response.status}`);
      error.response = { status: response.status, data: body };
      throw error;
    }
    return { data: body, status: response.status, headers: response.headers };
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const firebaseRequest = (method, url, data, config = {}) =>
  withTimeout(
    requestFirebase(method, url, data, config?.params || {}),
    config?.timeout || 20000,
    `Request timed out: ${method} ${url}`
  );
const getStoredUser = () => {
  try {
    const value = localStorage.getItem("user");
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};
const resolveCanonicalUserId = async () => {
  const stored = getStoredUser();
  const email = String(stored?.email || "").trim().toLowerCase();
  if (!email) return null;
  try {
    const response = await legacyRequest("GET", "/user/all");
    const users = dedupeUsers(unwrapUsers(response.data));
    const match = users.find((item) => item.email === email);
    return match?.id ? String(match.id) : null;
  } catch {
    return null;
  }
};

// Ensure task mutations always carry the canonical numeric MySQL user ID.
const normalizeTaskMutationData = async (path, data) => {
  if (!/^\/task\//i.test(path)) return data;

  const stored = getStoredUser();
  const currentId = String(
    data instanceof FormData
      ? data.get("user_id") || ""
      : data?.user_id ?? ""
  ).trim();

  let canonicalId = /^\d+$/.test(currentId) ? currentId : null;
  if (!canonicalId) canonicalId = await resolveCanonicalUserId();

  if (data instanceof FormData) {
    if (canonicalId) {
      data.set("user_id", canonicalId);
    } else if (stored?.id && /^\d+$/.test(String(stored.id))) {
      data.set("user_id", String(stored.id));
    }

    // The backend intentionally rejects an empty completion submission.
    // Keep the action usable when the operator submits without typing a note.
    if (/^\/task\/complete-work\//i.test(path)) {
      const note = String(data.get("completion_note") || "").trim();
      if (!note && data.getAll("files").length === 0 && data.getAll("voice_notes").length === 0 && data.getAll("voice_note").length === 0) {
        data.set("completion_note", "Work completed successfully.");
      }
    }
    return data;
  }

  if (data && typeof data === "object") {
    return {
      ...data,
      ...(canonicalId ? { user_id: Number(canonicalId) } : {}),
    };
  }

  return data;
};

const API = {
  get: async (url, config = {}) => {
    const path = normalizePath(url);
    if (path === "/user/all") {
      const response = await legacyRequest("GET", "/user/all", undefined, config);
      const users = dedupeUsers(unwrapUsers(response.data));
      return { ...response, data: users, users };
    }
    if (isLegacyPath(path)) {
      try {
        const response = await legacyRequest("GET", path, undefined, config);
        const taskMatch = path.match(/^\/task\/my-tasks\/(\d+)$/i);
        if (taskMatch && Array.isArray(response.data) && response.data.length === 0) {
          const canonicalId = await resolveCanonicalUserId();
          if (canonicalId && canonicalId !== taskMatch[1]) {
            return await legacyRequest("GET", `/task/my-tasks/${canonicalId}`, undefined, config);
          }
        }
        return response;
      } catch (legacyError) {
        const taskMatch = path.match(/^\/task\/(\d+)$/i);
        if (taskMatch) {
          for (const fallbackPath of [
            `/task/single/${taskMatch[1]}`,
            `/task/${taskMatch[1]}/pre`,
          ]) {
            try {
              return await legacyRequest("GET", fallbackPath, undefined, config);
            } catch {}
          }
        }
        try {
          const data = await firebaseRequest("GET", path, undefined, config);
          return { data };
        } catch {
          throw legacyError;
        }
      }
    }
    const data = await firebaseRequest("GET", url, undefined, config);
    return { data };
  },
  post: async (url, data, config = {}) => {
    const path = normalizePath(url);
    if (isLegacyPath(path)) {
      const normalized = await normalizeTaskMutationData(path, data);
      return legacyRequest("POST", path, normalized, config);
    }
    const result = await firebaseRequest("POST", url, data, config);
    return { data: result };
  },
  put: async (url, data, config = {}) => {
    const path = normalizePath(url);
    if (isLegacyPath(path)) {
      const normalized = await normalizeTaskMutationData(path, data);
      return legacyRequest("PUT", path, normalized, config);
    }
    const result = await firebaseRequest("PUT", url, data, config);
    return { data: result };
  },
  patch: async (url, data, config = {}) => {
    const path = normalizePath(url);
    if (isLegacyPath(path)) {
      const normalized = await normalizeTaskMutationData(path, data);
      return legacyRequest("PATCH", path, normalized, config);
    }
    const result = await firebaseRequest("PATCH", url, data, config);
    return { data: result };
  },
  delete: async (url, config = {}) => {
    const path = normalizePath(url);
    if (isLegacyPath(path)) return legacyRequest("DELETE", path, undefined, config);
    const result = await firebaseRequest("DELETE", url, undefined, config);
    return { data: result };
  },
};

export default API;
