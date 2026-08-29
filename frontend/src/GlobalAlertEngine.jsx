import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { AlertTriangle, Volume2, VolumeX, X, BellOff } from "lucide-react";
import { db } from "./firebase";

const SETTINGS_REF = doc(db, "powerhouse_settings", "alerts");
const DEFAULTS = { lowDieselThreshold: 3000, repeatMinutes: 30, enabled: true, silent: false, alarmDurationSeconds: 30 };
const toNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function readSettings(data = {}) {
  return {
    lowDieselThreshold: Math.max(0, toNumber(data.lowDieselThreshold ?? data.lowStockLevel, DEFAULTS.lowDieselThreshold)),
    repeatMinutes: Math.max(1, toNumber(data.repeatMinutes ?? data.repeatIntervalMinutes, DEFAULTS.repeatMinutes)),
    enabled: data.enabled !== false && data.alertsEnabled !== false,
    silent: data.silent === true || data.silentMode === true,
    alarmDurationSeconds: Math.min(30, Math.max(20, toNumber(data.alarmDurationSeconds, DEFAULTS.alarmDurationSeconds))),
  };
}

export default function GlobalAlertEngine() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [stock, setStock] = useState(null);
  const [alert, setAlert] = useState(null);
  const audioRef = useRef(null);
  const alarmTimerRef = useRef(null);
  const autoStopRef = useRef(null);
  const mountedRef = useRef(true);
  const settingsRef = useRef(DEFAULTS);
  const lowRef = useRef(false);
  const stockRef = useRef(null);
  const alertRef = useRef(null);

  const stopAlarm = () => {
    if (alarmTimerRef.current) { clearInterval(alarmTimerRef.current); alarmTimerRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    try { if (navigator.vibrate) navigator.vibrate(0); } catch {}
  };

  const dismissAlert = () => {
    stopAlarm();
    alertRef.current = null;
    if (mountedRef.current) setAlert(null);
  };

  // Soft industrial chime: noticeable but less harsh than a siren.
  const ringOnce = () => {
    if (settingsRef.current.silent) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioContextClass();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime + 0.02;
      [[880, 0, .26], [1174, .32, .30], [988, .82, .28]].forEach(([frequency, offset, duration]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(.72, now + offset + .03);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + offset); osc.stop(now + offset + duration + .04);
      });
      if (navigator.vibrate) navigator.vibrate([220, 100, 220, 220, 360]);
    } catch (error) { console.warn("Low diesel alert tone blocked:", error?.message || error); }
  };

  const startAlarm = () => {
    stopAlarm();
    if (settingsRef.current.silent) return;
    ringOnce();
    alarmTimerRef.current = window.setInterval(ringOnce, 1800);
    autoStopRef.current = window.setTimeout(stopAlarm, settingsRef.current.alarmDurationSeconds * 1000);
  };

  const showSystem = async (title, body, alertId, current, threshold) => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: "/icon-192.svg",
        badge: "/icon-192.svg",
        tag: "powerhouse-low-diesel",
        renotify: true,
        requireInteraction: true,
        silent: settingsRef.current.silent,
        vibrate: [220, 100, 220, 220, 360],
        data: { route: "/fuel-management", type: "low_diesel", alertId, currentStock: current, lowStockLevel: threshold },
        actions: [{ action: "acknowledge", title: "Clear alert" }, { action: "view", title: "View dashboard" }]
      });
    } catch (error) { console.warn("Low diesel browser notification skipped:", error?.message || error); }
  };

  const fireAlert = () => {
    if (!lowRef.current) return;
    const current = Number(stockRef.current || 0);
    const threshold = settingsRef.current.lowDieselThreshold;
    const alertId = `low-diesel-${Math.round(current)}-${Math.round(threshold)}`;
    const title = "LOW DIESEL STOCK";
    const body = `Current stock: ${current.toLocaleString()} L • Alert level: ${threshold.toLocaleString()} L`;
    const next = { title, body, alertId, current, threshold };
    alertRef.current = next;
    if (mountedRef.current) setAlert(next);
    startAlarm();
    void showSystem(title, body, alertId, current, threshold);
  };

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Notification action/click can stop the active foreground alarm immediately.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const handleMessage = (event) => {
      const message = event?.data;
      if (message?.type === "POWERHOUSE_STOP_ALERT" || message?.type === "POWERHOUSE_ACK_LOW_DIESEL") dismissAlert();
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    const stop = onSnapshot(SETTINGS_REF, (snap) => {
      const next = readSettings(snap.exists() ? snap.data() : {});
      settingsRef.current = next; setSettings(next);
      if (next.silent) stopAlarm();
    }, (error) => { console.warn("Low diesel settings listener failed:", error?.message || error); settingsRef.current = DEFAULTS; setSettings(DEFAULTS); });
    return stop;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "entries"), orderBy("createdAt", "desc"), limit(50));
    const stop = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      const latest = rows[0];
      const next = latest ? toNumber(latest.currentStock ?? latest.stock, 0) : 0;
      setStock(next); stockRef.current = next;
    }, (error) => console.warn("Low diesel alert listener failed:", error?.message || error));
    return stop;
  }, []);

  const low = useMemo(() => stock !== null && settings.enabled && stock < settings.lowDieselThreshold, [stock, settings.enabled, settings.lowDieselThreshold]);

  useEffect(() => {
    lowRef.current = low;
    if (!low) { dismissAlert(); return undefined; }
    fireAlert();
    const repeatTimer = window.setInterval(fireAlert, Math.max(1, Number(settings.repeatMinutes || 30)) * 60 * 1000);
    return () => clearInterval(repeatTimer);
  }, [low, settings.repeatMinutes, settings.silent, settings.enabled, settings.lowDieselThreshold, settings.alarmDurationSeconds, stock]);

  useEffect(() => () => { stopAlarm(); try { void audioRef.current?.close?.(); } catch {} }, []);

  if (!alert || !low) return null;
  return <div className="fixed inset-x-3 top-20 z-[300] mx-auto w-auto max-w-xl rounded-2xl border border-red-500/50 bg-red-950/95 p-4 shadow-[0_0_50px_rgba(239,68,68,.3)] backdrop-blur-xl" role="alert">
    <div className="flex gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white"><AlertTriangle size={23}/></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-black tracking-wide text-red-100">{alert.title}</p><p className="mt-1 text-sm text-red-100/80">Please arrange diesel immediately.</p></div>
          <button onClick={dismissAlert} className="rounded-lg p-1.5 text-red-100/70 hover:bg-white/10" aria-label="Clear alert and stop ring"><X size={17}/></button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-red-400/20 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-red-200/70">Current stock</p><p className="mt-1 text-xl font-black text-white">{alert.current.toLocaleString()} L</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-red-100/60">Alert level</p><p className="mt-1 text-xl font-black text-red-200">{alert.threshold.toLocaleString()} L</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-red-200">Critical operational alert</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-red-100">Ring {settings.alarmDurationSeconds} sec</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-red-100">Repeats every {settings.repeatMinutes} min</span>
          {settings.silent ? <span className="inline-flex items-center gap-1 text-yellow-300"><VolumeX size={13}/>Silent</span> : <span className="inline-flex items-center gap-1 text-red-100"><Volume2 size={13}/>Sound on</span>}
        </div>
        <button onClick={dismissAlert} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-red-900 hover:bg-red-50"><BellOff size={15}/>Stop ring & clear alert</button>
      </div>
    </div>
  </div>;
}
