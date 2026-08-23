import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export const setToken = (user) => {
  try {
    if (user == null) {
      localStorage.removeItem("user");
      return;
    }
    const value = typeof user === "string" ? user : JSON.stringify(user);
    localStorage.setItem("user", value);
  } catch (error) {
    console.error("Failed to save user session:", error);
  }
};

export const getToken = () => {
  try {
    const value = localStorage.getItem("user");
    return value ? value : null;
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
    localStorage.setItem("user", JSON.stringify(upgraded));
    return upgraded;
  } catch {
    return user;
  }
}

export const getUser = () => {
  try {
    const data = localStorage.getItem("user");
    if (!data) return null;
    const user = JSON.parse(data);
    if (!user || typeof user !== "object") {
      localStorage.removeItem("user");
      return null;
    }
    return migrateCachedNumericId(user);
  } catch (error) {
    console.warn("Invalid stored user session. Clearing it.");
    localStorage.removeItem("user");
    return null;
  }
};

export const logout = () => {
  localStorage.removeItem("user");
  return signOut(auth).catch((error) => {
    console.warn("Firebase sign-out warning:", error?.message || error);
  });
};
