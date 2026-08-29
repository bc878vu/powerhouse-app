import { addDoc, collection, doc, getDocs, limit, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db, getFCMToken, isFirebaseConfigured, missingConfig } from "../firebase";

const normalizeUid = (value) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const nested = value.uid ?? value.firebaseUid ?? value.userId ?? value.id;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
    if (typeof nested === "number") return String(nested);
  }
  return null;
};
const notificationsRef = (uid) => collection(db, "powerhouse_notifications", normalizeUid(uid), "items");
async function resolveNotificationUid(value) {
  const normalized = normalizeUid(value);
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    try {
      const numeric = Number(normalized);
      const [asString, asNumber] = await Promise.all([
        getDocs(query(collection(db, "powerhouse_users"), where("id", "==", normalized), limit(1))),
        getDocs(query(collection(db, "powerhouse_users"), where("id", "==", numeric), limit(1)))
      ]);
      const match = !asString.empty ? asString.docs[0] : (!asNumber.empty ? asNumber.docs[0] : null);
      if (match) return String(match.data()?.uid || match.id || normalized);
    } catch (error) {
      console.warn("Notification UID lookup skipped:", error?.message || error);
    }
  }
  return normalized;
}
export function subscribeToNotifications(uid, callback) {
  const safeUid = normalizeUid(uid);
  if (!safeUid) return () => {};
  const q = query(notificationsRef(safeUid), limit(50));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    callback(items);
  }, (error) => {
    console.warn("Notification subscription failed:", error?.message || error);
    callback([]);
  });
}
export async function createNotification(uid, payload = {}) {
  const safeUid = await resolveNotificationUid(uid);
  if (!safeUid) throw new Error("Notification recipient is required");
  const ref = await addDoc(notificationsRef(safeUid), {
    title: String(payload.title || "PowerHouse notification"),
    body: String(payload.body || ""),
    type: String(payload.type || "system"),
    route: String(payload.route || "/notifications"),
    taskId: payload.taskId ? String(payload.taskId) : null,
    sourceId: payload.sourceId ? String(payload.sourceId) : null,
    priority: String(payload.priority || "normal"),
    read: false,
    createdAt: serverTimestamp()
  });
  return ref.id;
}
export async function markNotificationRead(uid, notificationId) {
  const safeUid = await resolveNotificationUid(uid);
  if (!safeUid || !notificationId) return;
  await updateDoc(doc(db, "powerhouse_notifications", safeUid, "items", String(notificationId)), { read: true, readAt: serverTimestamp() });
}
export async function markAllNotificationsRead(uid, notifications = []) {
  const safeUid = await resolveNotificationUid(uid);
  if (!safeUid) return;
  const unread = notifications.filter((item) => !item.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((item) => batch.update(doc(db, "powerhouse_notifications", safeUid, "items", String(item.id)), { read: true, readAt: serverTimestamp() }));
  await batch.commit();
}
export async function enablePushNotifications(options = {}) {
  if (!auth.currentUser) throw new Error("Please login first");
  if (!("Notification" in window)) throw new Error("Browser notifications are not supported");
  if (!isFirebaseConfigured) throw new Error(`Firebase web configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
  return getFCMToken(options);
}
export async function sendPushNotification({ title, body, route = "/notifications", userIds = [], notificationId = "", priority = "high" } = {}) {
  if (!auth.currentUser) return { success: false, skipped: true, reason: "not-authenticated" };
  const backendUrl = String(import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || "").replace(/\/+$/, "").replace(/\/api$/, "");
  if (!backendUrl) return { success: false, skipped: true, reason: "backend-url-missing" };
  try {
    const token = await auth.currentUser.getIdToken();
    const resolvedUserIds = await Promise.all(userIds.map((id) => resolveNotificationUid(id)));
    const response = await fetch(`${backendUrl}/api/notifications/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, body, route, userIds: resolvedUserIds.filter(Boolean), notificationId, priority })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) console.warn("Push notification request failed:", data?.message || response.statusText);
    return data;
  } catch (error) {
    console.warn("Push notification request skipped:", error?.message || error);
    return { success: false, skipped: true, reason: error?.message || "network-error" };
  }
}
export function getCurrentNotificationUid() { return normalizeUid(auth.currentUser?.uid); }
