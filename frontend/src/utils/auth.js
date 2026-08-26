import { signOut } from "firebase/auth";
import { auth } from "../firebase";

const SESSION_COOKIE = "powerhouse_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const setSessionCookie = (enabled) => {
  if (typeof document === "undefined") return;
  try {
    document.cookie = enabled
      ? `${SESSION_COOKIE}=1; Max-Age=${SESSION_MAX_AGE}; Path=/; SameSite=Lax`
      : `${SESSION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {}
};

export const setToken = (user) => {
  try {
    if (user == null) {
      localStorage.removeItem("user");
      sessionStorage.removeItem("user");
      setSessionCookie(false);
      return;
    }
    const value = typeof user === "string" ? user : JSON.stringify(user);
    // localStorage survives browser restarts; sessionStorage makes same-tab navigation instant.
    localStorage.setItem("user", value);
    sessionStorage.setItem("user", value);
    setSessionCookie(true);
  } catch (error) {
    console.error("Failed to save user session:", error);
  }
};

export const getToken = () => {
  try {
    return localStorage.getItem("user") || sessionStorage.getItem("user") || null;
  } catch (error) {
    console.error("Failed to read user session:", error);
    return null;
  }
};

function migrateCachedNumericId(user) {
  const numeric = Number(user?.numericId);
  if (Number.isInteger(numeric) && numeric > 0) return user;
  const currentId = Number(user?.id);
  if (Number.isInteger(currentId) && currentId > 0) return user;
  try {
    const cached = JSON.parse(localStorage.getItem("powerhouse_staff_cache_v2") || "[]");
    if (!Array.isArray(cached)) return user;
    const email = String(user?.email || "").trim().toLowerCase();
    const match = cached.find((item) => String(item?.email || "").trim().toLowerCase() === email);
    const id = Number(match?.id);
    if (!Number.isInteger(id) || id <= 0) return user;
    const upgraded = { ...user, ...match, id, numericId: id, uid: user?.uid || user?.firebaseUid || match?.uid, firebaseUid: user?.firebaseUid || user?.uid || match?.uid };
    const value = JSON.stringify(upgraded);
    localStorage.setItem("user", value);
    sessionStorage.setItem("user", value);
    return upgraded;
  } catch {
    return user;
  }
}

export const getUser = () => {
  try {
    const data = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!data) return null;
    const user = JSON.parse(data);
    if (!user || typeof user !== "object") {
      localStorage.removeItem("user");
      sessionStorage.removeItem("user");
      return null;
    }
    setSessionCookie(true);
    return migrateCachedNumericId(user);
  } catch (error) {
    console.warn("Invalid stored user session. Clearing it.");
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
    setSessionCookie(false);
    return null;
  }
};

export const logout = () => {
  localStorage.removeItem("user");
  sessionStorage.removeItem("user");
  setSessionCookie(false);
  return signOut(auth).catch((error) => {
    console.warn("Firebase sign-out warning:", error?.message || error);
  });
};
