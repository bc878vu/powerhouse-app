import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, runTransaction, query, orderBy, limit } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getUser } from "./utils/auth";
import { createNotification, sendPushNotification } from "./services/notificationService";
import { listUsers } from "./services/firebaseDataStore";

const LOW_DIESEL_STOCK = 3000;
const OFF_STATUSES = new Set(["off", "offline", "shutdown", "out_of_service", "out-of-service"]);

async function claimEvent(eventId, meta) {
  const eventRef = doc(db, "powerhouse_alert_events", eventId);
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(eventRef);
    if (existing.exists()) return false;
    transaction.set(eventRef, { ...meta, createdAt: new Date().toISOString() });
    return true;
  });
}

async function notifyUsers(userIds, payload) {
  const ids = [...new Set(userIds.map(String).filter(Boolean))];
  if (!ids.length) return;
  let claimed = false;
  try {
    claimed = await claimEvent(String(payload.eventId), { type: payload.type, sourceId: payload.sourceId || null, recipients: ids });
  } catch (error) {
    console.warn("Alert event claim failed:", error?.message || error);
    return;
  }
  if (!claimed) return;
  await Promise.all(ids.map((uid) => createNotification(uid, {
    title: payload.title,
    body: payload.body,
    type: payload.type,
    route: payload.route || "/notifications",
    sourceId: payload.sourceId
  }).catch((error) => console.warn("In-app notification failed:", error?.message || error))));
  try {
    await sendPushNotification({
      title: payload.title,
      body: payload.body,
      route: payload.route || "/notifications",
      userIds: ids,
      notificationId: payload.eventId
    });
  } catch (error) {
    console.warn("Push delivery failed; in-app notification was still saved:", error?.message || error);
  }
}

async function getAllUserIds() {
  try {
    const users = await listUsers();
    return users
      .filter((user) => String(user.status || "active").toLowerCase() !== "inactive")
      .map((user) => String(user.uid || user.id || ""))
      .filter(Boolean);
  } catch (error) {
    console.warn("Unable to load notification recipients:", error?.message || error);
    return [];
  }
}

export default function GlobalAlertEngine() {
  const [enabled, setEnabled] = useState(false);
  const panelStatuses = useRef(new Map());

  useEffect(() => onAuthStateChanged(auth, () => {
    const role = String(getUser()?.role || "").toLowerCase();
    setEnabled(["admin", "superadmin"].includes(role));
  }), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let panelReady = false;
    let fuelReady = false;
    const cleanups = [];

    const start = async () => {
      const allUserIds = await getAllUserIds();
      if (cancelled || !allUserIds.length) return;

      const panelUnsub = onSnapshot(collection(db, "powerhouse_panels"), async (snapshot) => {
        if (!panelReady) {
          snapshot.docs.forEach((item) => panelStatuses.current.set(item.id, String(item.data()?.status || item.data()?.effective_status || "").toLowerCase()));
          panelReady = true;
          return;
        }
        for (const change of snapshot.docChanges()) {
          if (change.type !== "modified") continue;
          const data = change.doc.data() || {};
          const previous = panelStatuses.current.get(change.doc.id) || "";
          const next = String(data.status || data.effective_status || "").toLowerCase();
          panelStatuses.current.set(change.doc.id, next);
          if (!OFF_STATUSES.has(next) || OFF_STATUSES.has(previous)) continue;
          const panelName = data.panel_name || data.panel_code || "Electrical Panel";
          await notifyUsers(allUserIds, {
            eventId: `panel-off-${change.doc.id}-${String(data.updated_at || Date.now())}`,
            sourceId: change.doc.id,
            type: "panel_off",
            title: "⚠️ Panel Turned OFF",
            body: `${panelName} has been turned OFF. Check the panel status and power supply.`,
            route: "/panels"
          });
        }
      }, (error) => console.warn("Panel alert listener failed:", error?.message || error));
      cleanups.push(panelUnsub);

      const entriesQuery = query(collection(db, "entries"), orderBy("createdAt", "desc"), limit(50));
      const fuelUnsub = onSnapshot(entriesQuery, async (snapshot) => {
        if (!fuelReady) {
          fuelReady = true;
          return;
        }
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const data = change.doc.data() || {};
          const current = Number(data.currentStock ?? data.stock ?? 0);
          const previous = Number(data.previousStock ?? 0);
          if (!(current > 0 && current < LOW_DIESEL_STOCK && previous >= LOW_DIESEL_STOCK)) continue;
          await notifyUsers(allUserIds, {
            eventId: `diesel-low-${change.doc.id}`,
            sourceId: change.doc.id,
            type: "low_diesel",
            title: "⛽ Low Diesel Stock",
            body: `Diesel stock is now ${current.toFixed(0)} L, below the ${LOW_DIESEL_STOCK.toLocaleString()} L safety level.`,
            route: "/fuel-management"
          });
        }
      }, (error) => console.warn("Fuel alert listener failed:", error?.message || error));
      cleanups.push(fuelUnsub);
    };

    void start();
    return () => {
      cancelled = true;
      cleanups.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [enabled]);

  return null;
}
