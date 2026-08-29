import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { AlertTriangle, Volume2, VolumeX, X } from "lucide-react";
import { db } from "./firebase";

const SETTINGS_REF = doc(db, "powerhouse_settings", "alerts");
const DEFAULTS = { lowDieselThreshold: 3000, repeatMinutes: 30, enabled: true, silent: false };
const MAX_RING_MS = 2 * 60 * 1000;
const toNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function readSettings(data = {}) {
  return {
    lowDieselThreshold: Math.max(0, toNumber(data.lowDieselThreshold, DEFAULTS.lowDieselThreshold)),
    repeatMinutes: Math.max(1, toNumber(data.repeatMinutes, DEFAULTS.repeatMinutes)),
    enabled: data.enabled !== false,
    silent: data.silent === true,
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

  const stopAlarm = () => {
    if (alarmTimerRef.current) {
      clearInterval(alarmTimerRef.current);
      alarmTimerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
  };

  const ringOnce = () => {
    if (settingsRef.current.silent) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioContextClass();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime + 0.01;
      // High-contrast repeating emergency tone. Browser/device volume still controls the final loudness.
      [[1046, 0, .42], [784, .48, .42], [1046, .96, .42], [659, 1.44, .55]].forEach(([frequency, offset, duration]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(.0001, now + offset);
        gain.gain.linearRampToValueAtTime(.95, now + offset + .015);
        gain.gain.setValueAtTime(.95, now + offset + Math.max(.02, duration - .04));
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + offset); osc.stop(now + offset + duration + .02);
      });
      if (navigator.vibrate) navigator.vibrate([500, 100, 500, 100, 700, 150, 700]);
    } catch (error) {
      console.warn("Low diesel alert tone blocked:", error?.message || error);
    }
  };

  const startAlarm = () => {
    stopAlarm();
    if (settingsRef.current.silent) return;
    ringOnce();
    alarmTimerRef.current = window.setInterval(ringOnce, 2200);
    autoStopRef.current = window.setTimeout(stopAlarm, MAX_RING_MS);
  };

  const showSystem = async (title, body) => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body, icon: "/icon-192.svg", badge: "/icon-192.svg", tag: "powerhouse-low-diesel",
        renotify: true, requireInteraction: true, silent: settingsRef.current.silent,
        vibrate: [500, 100, 500, 100, 700], data: { route: "/fuel-management", type: "low_diesel" }
      });
    } catch (error) {
      console.warn("Low diesel browser notification skipped:", error?.message || error);
    }
  };

  const fireAlert = () => {
    if (!lowRef.current) return;
    const current = Number(stockRef.current || 0);
    const threshold = settingsRef.current.lowDieselThreshold;
    const title = "🚨 LOW DIESEL STOCK";
    const body = `Diesel stock is ${current.toFixed(0)} L. Alert level is ${threshold.toFixed(0)} L.`;
    if (mountedRef.current) setAlert({ title, body });
    startAlarm();
    void showSystem(title, body);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const stop = onSnapshot(SETTINGS_REF, (snap) => {
      const next = readSettings(snap.exists() ? snap.data() : {});
      settingsRef.current = next;
      setSettings(next);
      if (next.silent) stopAlarm();
    }, (error) => {
      // Defaults keep public monitoring alive if settings have not yet been published.
      console.warn("Low diesel settings listener failed:", error?.message || error);
      settingsRef.current = DEFAULTS;
      setSettings(DEFAULTS);
    });
    return stop;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "entries"), orderBy("createdAt", "desc"), limit(50));
    const stop = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      if (!rows.length) { setStock(0); stockRef.current = 0; return; }
      const latest = rows[0];
      const next = toNumber(latest.currentStock ?? latest.stock, 0);
      setStock(next); stockRef.current = next;
    }, (error) => console.warn("Low diesel alert listener failed:", error?.message || error));
    return stop;
  }, []);

  const low = useMemo(() => stock !== null && settings.enabled && stock < settings.lowDieselThreshold, [stock, settings]);

  useEffect(() => {
    lowRef.current = low;
    if (!low) {
      stopAlarm();
      setAlert(null);
      return undefined;
    }
    fireAlert();
    const intervalMs = Math.max(1, Number(settings.repeatMinutes || 30)) * 60 * 1000;
    const repeatTimer = window.setInterval(fireAlert, intervalMs);
    return () => clearInterval(repeatTimer);
  }, [low, settings.repeatMinutes, settings.silent, settings.enabled, stock]);

  useEffect(() => () => {
    stopAlarm();
    try { void audioRef.current?.close?.(); } catch {}
  }, []);

  if (!alert || !low) return null;
  const dismiss = () => { stopAlarm(); setAlert(null); };
  return <div className="fixed inset-x-3 top-20 z-[300] mx-auto w-auto max-w-xl animate-[pulse_2s_ease-in-out_infinite] rounded-2xl border border-red-500/50 bg-red-950/95 p-4 shadow-[0_0_50px_rgba(239,68,68,.3)] backdrop-blur-xl" role="alert">
    <div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white"><AlertTriangle size={23}/></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black tracking-wide text-red-100">{alert.title}</p><p className="mt-1 text-sm text-red-100/80">{alert.body}</p></div><button onClick={dismiss} className="rounded-lg p-1.5 text-red-100/70 hover:bg-white/10" aria-label="Dismiss and stop alert"><X size={17}/></button></div><div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider"><span className="rounded-full bg-red-500/20 px-2.5 py-1 text-red-200">Critical operational alert</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-red-100">Ring stops automatically after 2 min</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-red-100">Repeats every {settings.repeatMinutes} min</span>{settings.silent ? <span className="inline-flex items-center gap-1 text-yellow-300"><VolumeX size={13}/>Silent</span> : <span className="inline-flex items-center gap-1 text-red-100"><Volume2 size={13}/>Sound on</span>}</div></div></div></div>;
}
