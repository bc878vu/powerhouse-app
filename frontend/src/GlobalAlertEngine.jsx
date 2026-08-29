import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { AlertTriangle, Volume2, VolumeX, X, BellOff } from "lucide-react";
import { db } from "./firebase";

const SETTINGS_REF = doc(db, "powerhouse_settings", "alerts");
const STATE_REF = doc(db, "powerhouse_alert_state", "current");
const DEFAULTS = { lowDieselThreshold: 3000, repeatMinutes: 30, enabled: true, silent: false, alarmDurationSeconds: 30 };
const toNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowMs = (value) => value?.toMillis?.() ?? (value ? new Date(value).getTime() : 0);

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
  const [remoteAlert, setRemoteAlert] = useState(null);
  const [alert, setAlert] = useState(null);
  const audioRef = useRef(null);
  const alarmTimerRef = useRef(null);
  const autoStopRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const settingsRef = useRef(DEFAULTS);
  const stockRef = useRef(null);
  const activeIdRef = useRef(null);
  const dismissedRef = useRef(new Set());

  const stopAlarm = () => {
    if (alarmTimerRef.current) { clearInterval(alarmTimerRef.current); alarmTimerRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    try { navigator.vibrate?.(0); } catch {}
  };

  const dismissAlert = (id = activeIdRef.current) => {
    if (id) dismissedRef.current.add(String(id));
    stopAlarm();
    activeIdRef.current = null;
    if (mountedRef.current) setAlert(null);
  };

  const ringOnce = () => {
    if (settingsRef.current.silent) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioContextClass();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime + 0.02;
      [[784, 0, .22], [1046, .28, .25], [880, .62, .24]].forEach(([frequency, offset, duration]) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(.0001, now + offset); gain.gain.exponentialRampToValueAtTime(.6, now + offset + .03);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + offset); osc.stop(now + offset + duration + .04);
      });
      navigator.vibrate?.([180, 90, 180, 120, 260]);
    } catch (error) { console.warn("Low diesel alert tone blocked:", error?.message || error); }
  };

  const startAlarm = () => {
    stopAlarm();
    if (settingsRef.current.silent) return;
    ringOnce();
    alarmTimerRef.current = window.setInterval(ringOnce, 1700);
    autoStopRef.current = window.setTimeout(stopAlarm, settingsRef.current.alarmDurationSeconds * 1000);
  };

  const showSystem = async (item) => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(item.title, {
        body: item.body, icon: "/icon-192.svg", badge: "/icon-192.svg", tag: `powerhouse-alert-${item.alertId}`,
        renotify: true, requireInteraction: true, silent: settingsRef.current.silent,
        vibrate: [180, 90, 180, 120, 260],
        data: { route: item.route || "/fuel-management", type: item.type, alertId: item.alertId, currentStock: item.current, lowStockLevel: item.threshold },
        actions: [{ action: "acknowledge", title: "Clear alert" }, { action: "view", title: "View dashboard" }]
      });
    } catch (error) { console.warn("System notification skipped:", error?.message || error); }
  };

  const activate = (item) => {
    if (!item?.alertId || dismissedRef.current.has(String(item.alertId))) return;
    activeIdRef.current = item.alertId;
    if (mountedRef.current) setAlert(item);
    startAlarm();
    void showSystem(item);
  };

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const handleMessage = (event) => {
      const message = event?.data;
      if (message?.type === "POWERHOUSE_STOP_ALERT" || message?.type === "POWERHOUSE_ACK_ALERT") dismissAlert(message.alertId);
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => onSnapshot(SETTINGS_REF, (snap) => {
    const next = readSettings(snap.exists() ? snap.data() : {}); settingsRef.current = next; setSettings(next); if (next.silent) stopAlarm();
  }, (error) => console.warn("Low diesel settings listener failed:", error?.message || error)), []);

  useEffect(() => {
    const q = query(collection(db, "entries"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(q, (snap) => {
      const latest = snap.docs[0]?.data(); const next = latest ? toNumber(latest.currentStock ?? latest.stock, 0) : 0;
      stockRef.current = next; setStock(next);
    }, (error) => console.warn("Low diesel alert listener failed:", error?.message || error));
  }, []);

  // Backend/manual broadcast state: visible to public dashboard without requiring login.
  useEffect(() => onSnapshot(STATE_REF, (snap) => {
    if (!snap.exists()) { setRemoteAlert(null); return; }
    const data = snap.data() || {};
    const expiresAt = nowMs(data.expiresAt);
    if (data.active === false || (expiresAt && expiresAt < Date.now())) { setRemoteAlert(null); return; }
    const alertId = String(data.alertId || snap.id);
    const current = toNumber(data.currentStock ?? data.stock ?? stockRef.current, 0);
    const threshold = toNumber(data.lowStockLevel ?? data.lowDieselThreshold ?? settingsRef.current.lowDieselThreshold, settingsRef.current.lowDieselThreshold);
    setRemoteAlert({ alertId, title: data.title || "POWERHOUSE ALERT", body: data.body || `Current stock: ${current.toLocaleString()} L`, current, threshold, type: data.type || "manual", route: data.route || "/" });
  }, (error) => console.warn("Alert state listener failed:", error?.message || error)), []);

  const low = useMemo(() => stock !== null && settings.enabled && stock < settings.lowDieselThreshold, [stock, settings.enabled, settings.lowDieselThreshold]);

  useEffect(() => {
    if (repeatTimerRef.current) { clearInterval(repeatTimerRef.current); repeatTimerRef.current = null; }
    if (remoteAlert) { activate(remoteAlert); return undefined; }
    if (!low) { dismissAlert(); return undefined; }
    const makeLow = () => {
      const current = Number(stockRef.current || 0); const threshold = settingsRef.current.lowDieselThreshold;
      activate({ alertId: `low-diesel-${Math.round(current)}-${Math.round(threshold)}`, title: "LOW DIESEL STOCK", body: `Current stock: ${current.toLocaleString()} L • Alert level: ${threshold.toLocaleString()} L`, current, threshold, type: "low_diesel", route: "/fuel-management" });
    };
    makeLow();
    repeatTimerRef.current = window.setInterval(makeLow, Math.max(1, Number(settings.repeatMinutes || 30)) * 60 * 1000);
    return () => { if (repeatTimerRef.current) clearInterval(repeatTimerRef.current); repeatTimerRef.current = null; };
  }, [low, remoteAlert, settings.repeatMinutes, settings.enabled, settings.lowDieselThreshold, settings.alarmDurationSeconds]);

  useEffect(() => () => { stopAlarm(); try { void audioRef.current?.close?.(); } catch {} }, []);

  if (!alert) return null;
  return <div className="fixed inset-x-3 top-20 z-[300] mx-auto w-auto max-w-xl rounded-2xl border border-red-500/50 bg-red-950/95 p-4 shadow-[0_0_50px_rgba(239,68,68,.3)] backdrop-blur-xl" role="alert">
    <div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white"><AlertTriangle size={23}/></div><div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black tracking-wide text-red-100">{alert.title}</p><p className="mt-1 text-sm text-red-100/80">{alert.body}</p></div><button onClick={() => dismissAlert(alert.alertId)} className="rounded-lg p-1.5 text-red-100/70 hover:bg-white/10" aria-label="Clear alert and stop ring"><X size={17}/></button></div>
      <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-red-400/20 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-red-200/70">Current stock</p><p className="mt-1 text-xl font-black text-white">{Number(alert.current || 0).toLocaleString()} L</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-red-100/60">Alert level</p><p className="mt-1 text-xl font-black text-red-200">{Number(alert.threshold || 0).toLocaleString()} L</p></div></div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider"><span className="rounded-full bg-red-500/20 px-2.5 py-1 text-red-200">{alert.type === "manual" ? "Manual admin alert" : "Critical operational alert"}</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-red-100">Ring {settings.alarmDurationSeconds} sec</span>{settings.silent ? <span className="inline-flex items-center gap-1 text-yellow-300"><VolumeX size={13}/>Silent</span> : <span className="inline-flex items-center gap-1 text-red-100"><Volume2 size={13}/>Sound on</span>}</div>
      <button onClick={() => dismissAlert(alert.alertId)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-red-900 hover:bg-red-50"><BellOff size={15}/>Stop ring & clear alert</button>
    </div></div>
  </div>;
}
