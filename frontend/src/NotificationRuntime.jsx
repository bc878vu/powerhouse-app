import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getFCMToken, onForegroundMessage } from "./firebase";
import { socket } from "./utils/socket";

const TASK_EVENTS = new Set([
  "taskAssigned",
  "taskReassigned",
  "taskUpdate",
  "taskUpdated",
  "taskEdited",
  "taskDeleted",
  "taskDelete",
  "taskAccepted",
  "taskRejected",
  "taskCompleted",
  "taskStatusChanged",
]);

function setAppBadge() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.setAppBadge === "function") {
      void navigator.setAppBadge(1);
    }
  } catch {}
}

function clearAppBadge() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clearAppBadge === "function") {
      void navigator.clearAppBadge();
    } else if (typeof navigator !== "undefined" && typeof navigator.setAppBadge === "function") {
      void navigator.setAppBadge(0);
    }
  } catch {}
}

function taskEventText(event, data = {}) {
  const title = String(data.title || data.notificationTitle || "").trim();
  const body = String(data.body || data.message || data.notificationBody || "").trim();
  if (title || body) {
    return {
      title: title || "PowerHouse Task Alert",
      body: body || "A task has been updated.",
    };
  }

  const taskId = data.taskId ?? data.task_id ?? data.id ?? "";
  const labels = {
    taskAssigned: "New task assigned",
    taskReassigned: "Task reassigned",
    taskUpdate: "Task updated",
    taskUpdated: "Task updated",
    taskEdited: "Task edited",
    taskDeleted: "Task deleted",
    taskDelete: "Task deleted",
    taskAccepted: "Task accepted",
    taskRejected: "Task rejected",
    taskCompleted: "Task completed",
    taskStatusChanged: "Task status changed",
  };

  const label = labels[event] || "Task notification";
  return {
    title: label,
    body: taskId
      ? `Task #${taskId} has a new update.`
      : "A PowerHouse task has a new update.",
  };
}

function eventRoute(data = {}) {
  const route = String(data.route || "").trim();
  if (route) return route;
  const taskId = data.taskId ?? data.task_id ?? data.id;
  return taskId ? `/task-view/${taskId}` : "/notifications";
}

function getUserIds(user) {
  return [user?.uid, user?.numericId, user?.id]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map(String)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function getEventRecipientIds(data = {}) {
  const values = data.userIds ?? data.user_ids ?? data.userId ?? data.user_id;
  if (Array.isArray(values)) return values.map(String).filter(Boolean);
  return values === undefined || values === null || String(values).trim() === ""
    ? []
    : [String(values)];
}

export default function NotificationRuntime() {
  const [alert, setAlert] = useState(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const recentEventsRef = useRef(new Map());
  const permissionAttemptedRef = useRef(false);

  useEffect(() => {
    let unsubscribeAuth = () => {};
    let unsubscribeMessage = () => {};
    let disposed = false;

    const unlockAudio = async () => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
        if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
      } catch (error) {
        console.warn("Notification audio unlock skipped:", error?.message || error);
      }
    };

    const playNotificationTone = async () => {
      try {
        await unlockAudio();
        const context = audioContextRef.current;
        if (!context || context.state !== "running") return;

        const now = context.currentTime;
        const notes = [
          [880, 0.00, 0.22],
          [660, 0.24, 0.22],
          [880, 0.48, 0.22],
          [660, 0.72, 0.28],
        ];

        notes.forEach(([frequency, offset, duration]) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, now + offset);
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(now + offset);
          oscillator.stop(now + offset + duration + 0.02);
        });

        try {
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([220, 100, 220, 100, 320]);
          }
        } catch {}
      } catch (error) {
        console.warn("Notification tone skipped:", error?.message || error);
      }
    };

    const showSystemNotification = async (title, body, route, notificationId) => {
      try {
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        if (!("serviceWorker" in navigator)) return;
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          body,
          icon: "/icon-192.svg",
          badge: "/icon-192.svg",
          tag: notificationId,
          renotify: true,
          requireInteraction: true,
          silent: false,
          vibrate: [220, 100, 220, 100, 320, 100, 420],
          timestamp: Date.now(),
          data: { route, notificationId },
        });
      } catch (error) {
        console.warn("Persistent foreground notification skipped:", error?.message || error);
      }
    };

    const showAlert = async (title, body, route = "/notifications", notificationId = "") => {
      if (disposed) return;

      const key = String(notificationId || `${title}|${body}|${route}`).slice(0, 300);
      const now = Date.now();
      const previous = recentEventsRef.current.get(key);
      if (previous && now - previous < 10000) return;
      recentEventsRef.current.set(key, now);

      for (const [eventKey, timestamp] of recentEventsRef.current) {
        if (now - timestamp > 15000) recentEventsRef.current.delete(eventKey);
      }

      setAppBadge();
      setAlert({ title, body, route });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setAlert(null), 12000);

      void playNotificationTone();
      void showSystemNotification(
        title,
        body,
        route,
        key || `powerhouse-${Date.now()}`
      );
    };

    const setup = async (user) => {
      unsubscribeMessage();
      unsubscribeMessage = () => {};
      if (!user || disposed) return;

      // Keep the Firebase push token alive on every authenticated app start.
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          await getFCMToken({ requestPermission: false });
        }
      } catch (error) {
        console.warn("Silent push token refresh skipped:", error?.message || error);
      }

      // FCM foreground channel.
      try {
        unsubscribeMessage = await onForegroundMessage((payload) => {
          const title = payload?.notification?.title || payload?.data?.title || "PowerHouse Alert";
          const body = payload?.notification?.body || payload?.data?.body || "You have a new PowerHouse notification.";
          const route = eventRoute(payload?.data || {});
          const notificationId = String(
            payload?.data?.notificationId ||
            payload?.messageId ||
            `fcm-${payload?.data?.taskId || Date.now()}`
          );
          void showAlert(title, body, route, notificationId);
        });
      } catch (error) {
        console.warn("Foreground notification listener skipped:", error?.message || error);
      }

      // Socket.IO realtime channel. The backend task router uses SQL numeric
      // user IDs while Firebase Auth uses a UID, so join BOTH identifiers.
      if (socket) {
        const userIds = getUserIds(user);
        const join = () => {
          userIds.forEach((id) => socket.emit("joinUser", id));
          if (["admin", "superadmin"].includes(String(user.role || "").toLowerCase())) {
            socket.emit("joinAdmin");
          }
        };

        if (socket.connected) join();
        socket.on("connect", join);

        const onAny = (event, data = {}) => {
          if (!TASK_EVENTS.has(event)) return;

          const recipientIds = getEventRecipientIds(data);
          const isAdmin = ["admin", "superadmin"].includes(String(user.role || "").toLowerCase());
          const belongsToUser = recipientIds.length === 0 || recipientIds.some((id) => userIds.includes(id));
          if (!belongsToUser && !isAdmin) return;

          const text = taskEventText(event, data);
          const taskId = data.taskId ?? data.task_id ?? data.id ?? "";
          const notificationId = String(
            data.notificationId ||
            `${event}-${taskId || "general"}-${data.assignment_cycle || ""}`
          );
          void showAlert(text.title, text.body, eventRoute(data), notificationId);
        };

        socket.onAny(onAny);
        const cleanupSocket = () => {
          socket.off("connect", join);
          socket.offAny(onAny);
        };
        const previousCleanup = unsubscribeMessage;
        unsubscribeMessage = () => {
          previousCleanup();
          cleanupSocket();
        };
      }
    };

    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      void setup(user);
    });

    // Browsers require notification permission to be requested from a real
    // user gesture. Unlock audio in the same gesture so later task alerts can
    // play a foreground ringtone without autoplay-policy failures.
    const requestOnFirstGesture = async () => {
      void unlockAudio();
      if (permissionAttemptedRef.current || !auth.currentUser || typeof Notification === "undefined") return;
      permissionAttemptedRef.current = true;
      if (Notification.permission !== "default") return;
      try {
        await getFCMToken({ requestPermission: true });
      } catch (error) {
        console.warn("Push permission gesture registration skipped:", error?.message || error);
      }
    };

    window.addEventListener("pointerdown", requestOnFirstGesture, { once: true, passive: true });
    window.addEventListener("keydown", requestOnFirstGesture, { once: true, passive: true });

    return () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeMessage();
      window.removeEventListener("pointerdown", requestOnFirstGesture);
      window.removeEventListener("keydown", requestOnFirstGesture);
      if (timerRef.current) clearTimeout(timerRef.current);
      try { void audioContextRef.current?.close?.(); } catch {}
    };
  }, []);

  if (!alert) return null;

  return (
    <button
      type="button"
      onClick={() => {
        clearAppBadge();
        window.location.href = alert.route;
      }}
      className="fixed right-4 top-24 z-[200] w-[min(92vw,420px)] rounded-2xl border border-yellow-500/30 bg-[#020617]/95 p-4 text-left shadow-2xl backdrop-blur-xl"
      aria-label="Open notification"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500 text-black">🔔</div>
        <div className="min-w-0">
          <p className="text-sm font-black text-white">{alert.title}</p>
          <p className="mt-1 text-sm leading-5 text-slate-300">{alert.body}</p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-yellow-500">Open task</p>
        </div>
      </div>
    </button>
  );
}
