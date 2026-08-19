import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
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

export function subscribeToNotifications(uid, callback) {
  const safeUid = normalizeUid(uid);
  if (!safeUid) return () => {};
  const q = query(notificationsRef(safeUid), limit(50));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    callback(items);
  }, (error) => {
    console.warn("Notification subscription failed:", error?.message || error);
    callback([]);
  });
}

export async function createNotification(uid, payload = {}) {
  const safeUid = normalizeUid(uid);
  if (!safeUid) throw new Error("Notification recipient is required");
  const ref = await addDoc(notificationsRef(safeUid), {
    title: String(payload.title || "PowerHouse notification"),
    body: String(payload.body || ""),
    type: String(payload.type || "system"),
    route: String(payload.route || "/notifications"),
    taskId: payload.taskId ? String(payload.taskId) : null,
    read: false,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function markNotificationRead(uid, notificationId) {
  const safeUid = normalizeUid(uid);
  if (!safeUid || !notificationId) return;
  await updateDoc(doc(db, "powerhouse_notifications", safeUid, "items", String(notificationId)), {
    read: true,
    readAt: serverTimestamp()
  });
}

export async function markAllNotificationsRead(uid, notifications = []) {
  const safeUid = normalizeUid(uid);
  if (!safeUid) return;
  const unread = notifications.filter((item) => !item.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((item) => {
    batch.update(doc(db, "powerhouse_notifications", safeUid, "items", String(item.id)), {
      read: true,
      readAt: serverTimestamp()
    });
  });
  await batch.commit();
}

export async function enablePushNotifications() {
  if (!auth.currentUser) throw new Error("Please login first");
  if (!("Notification" in window)) throw new Error("Browser notifications are not supported");
  if (!isFirebaseConfigured) throw new Error(`Firebase web configuration is incomplete. Missing: ${missingConfig.join(", ")}`);
  if (!import.meta.env.VITE_VAPID_KEY) throw new Error("VITE_VAPID_KEY is not configured");
  return getFCMToken();
}

export function getCurrentNotificationUid() {
  return normalizeUid(auth.currentUser?.uid);
}
