import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getFCMToken, onForegroundMessage } from "./firebase";

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
    // Browser autoplay/audio policy may block a foreground tone; push itself still works.
  }
}

export default function NotificationRuntime() {
  const [alert, setAlert] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let unsubscribeAuth = () => {};
    let unsubscribeMessage = () => {};
    let disposed = false;

    const setup = async (user) => {
      unsubscribeMessage();
      unsubscribeMessage = () => {};
      if (!user || disposed) return;

      // If the user has already granted permission on this browser, silently
      // refresh/register the FCM token so background push keeps working.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        getFCMToken().catch(() => {});
      }

      try {
        unsubscribeMessage = await onForegroundMessage((payload) => {
          const title = payload?.notification?.title || payload?.data?.title || "PowerHouse Alert";
          const body = payload?.notification?.body || payload?.data?.body || "You have a new PowerHouse notification.";
          playNotificationTone();
          setAlert({ title, body, route: payload?.data?.route || "/notifications" });
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setAlert(null), 6500);
        });
      } catch {
        unsubscribeMessage = () => {};
      }
    };

    unsubscribeAuth = onAuthStateChanged(auth, (user) => { void setup(user); });
    return () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeMessage();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!alert) return null;

  return (
    <button
      type="button"
      onClick={() => { window.location.href = alert.route; }}
      className="fixed right-4 top-24 z-[200] w-[min(92vw,380px)] rounded-2xl border border-yellow-500/30 bg-[#020617]/95 p-4 text-left shadow-2xl backdrop-blur-xl"
      aria-label="Open notification"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500 text-black">🔔</div>
        <div className="min-w-0">
          <p className="text-sm font-black text-white">{alert.title}</p>
          <p className="mt-1 text-sm leading-5 text-slate-300">{alert.body}</p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-yellow-500">Open notification</p>
        </div>
      </div>
    </button>
  );
}
