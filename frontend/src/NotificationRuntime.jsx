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

function playNotificationTone() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.21);
    oscillator.addEventListener("ended", () => context.close().catch(() => {}));
  } catch {
    // Browser autoplay/audio policy may block a foreground tone.
  }
}

function setAppBadge() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.setAppBadge === "function") void navigator.setAppBadge(1);
  } catch {}
}

function clearAppBadge() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clearAppBadge === "function") void navigator.clearAppBadge();
    else if (typeof navigator !== "undefined" && typeof navigator.setAppBadge === "function") void navigator.setAppBadge(0);
  } catch {}
}

function taskEventText(event, data = {}) {
  const title = String(data.title || data.notificationTitle || "").trim();
  const body = String(data.body || data.message || data.notificationBody || "").trim();
  if (title || body) return { title: title || "PowerHouse Task Alert", body: body || "A task has been updated." };
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
  return { title: label, body: taskId ? `Task #${taskId} has a new update.` : "A PowerHouse task has a new update." };
}

function eventRoute(data = {}) {
  const route = String(data.route || "").trim();
  if (route) return route;
  const taskId = data.taskId ?? data.task_id ?? data.id;
  return taskId ? `/task-view/${taskId}` : "/notifications";
}

export default function NotificationRuntime() {
  const [alert, setAlert] = useState(null);
  const timerRef = useRef(null);
  const currentUidRef = useRef(null);
  const permissionAttemptedRef = useRef(false);

  useEffect(() => {
    let unsubscribeAuth = () => {};
    let unsubscribeMessage = () => {};
    let disposed = false;

    const showAlert = (title, body, route = "/notifications") => {
      if (disposed) return;
      playNotificationTone();
      setAppBadge();
      setAlert({ title, body, route });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setAlert(null), 8000);

      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
          new Notification(title, { body, icon: "/icon-192.svg", badge: "/icon-192.svg", tag: `powerhouse-${Date.now()}`, requireInteraction: true });
        }
      } catch {}
    };

    const setup = async (user) => {
      unsubscribeMessage();
      unsubscribeMessage = () => {};
      currentUidRef.current = user?.uid || null;
      if (!user || disposed) return;

      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          await getFCMToken({ requestPermission: false });
        }
      } catch (error) {
        console.warn("Silent push token refresh skipped:", error?.message || error);
      }

      try {
        unsubscribeMessage = await onForegroundMessage((payload) => {
          const title = payload?.notification?.title || payload?.data?.title || "PowerHouse Alert";
          const body = payload?.notification?.body || payload?.data?.body || "You have a new PowerHouse notification.";
          showAlert(title, body, payload?.data?.route || (payload?.data?.taskId ? `/task-view/${payload.data.taskId}` : "/notifications"));
        });
      } catch (error) {
        console.warn("Foreground notification listener skipped:", error?.message || error);
      }

      if (socket) {
        const join = () => {
          socket.emit("joinUser", user.uid);
          if (["admin", "superadmin"].includes(String(user.role || "").toLowerCase())) socket.emit("joinAdmin");
        };
        if (socket.connected) join();
        socket.on("connect", join);
        const onAny = (event, data = {}) => {
          if (!TASK_EVENTS.has(event)) return;
          const ids = Array.isArray(data?.userIds || data?.user_ids) ? (data.userIds || data.user_ids).map(String) : [data?.userId ?? data?.user_id].filter(Boolean).map(String);
          const isAdmin = ["admin", "superadmin"].includes(String(user.role || "").toLowerCase());
          if (ids.length && !ids.includes(String(user.uid)) && !isAdmin) return;
          const text = taskEventText(event, data);
          showAlert(text.title, text.body, eventRoute(data));
        };
        socket.onAny(onAny);
        const cleanupSocket = () => {
          socket.off("connect", join);
          socket.offAny(onAny);
        };
        const previousCleanup = unsubscribeMessage;
        unsubscribeMessage = () => { previousCleanup(); cleanupSocket(); };
      }
    };

    unsubscribeAuth = onAuthStateChanged(auth, (user) => { void setup(user); });

    const requestOnFirstGesture = async () => {
      if (permissionAttemptedRef.current || !auth.currentUser || typeof Notification === "undefined") return;
      permissionAttemptedRef.current = true;
      if (Notification.permission !== "default") return;
      try { await getFCMToken({ requestPermission: true }); } catch (error) { console.warn("Push permission gesture registration skipped:", error?.message || error); }
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
    };
  }, []);

  if (!alert) return null;

  return (
    <button
      type="button"
      onClick={() => { clearAppBadge(); window.location.href = alert.route; }}
      className="fixed right-4 top-24 z-[200] w-[min(92vw,380px)] rounded-2xl border border-yellow-500/30 bg-[#020617]/95 p-4 text-left shadow-2xl backdrop-blur-xl"
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
