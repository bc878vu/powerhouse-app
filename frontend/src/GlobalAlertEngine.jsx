import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { AlertTriangle, BellRing, Volume2, VolumeX, X } from "lucide-react";
import { db } from "./firebase";

const SETTINGS_REF = doc(db, "powerhouse_settings", "alerts");
const DEFAULTS = { lowDieselThreshold: 3000, repeatMinutes: 30, enabled: true, silent: false };
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
  const timerRef = useRef(null);
  const lastAlertRef = useRef(0);
  const settingsRef = useRef(DEFAULTS);

  useEffect(() => {
    const stop = onSnapshot(SETTINGS_REF, (snap) => {
      const next = readSettings(snap.exists() ? snap.data() : {});
      settingsRef.current = next;
      setSettings(next);
    }, () => {
      settingsRef.current = DEFAULTS;
      setSettings(DEFAULTS);
    });
    return stop;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "entries"), orderBy("createdAt", "desc"), limit(50));
    const stop = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      if (!rows.length) { setStock(0); return; }
      const latest = rows[0];
      setStock(toNumber(latest.currentStock ?? latest.stock, 0));
    }, (error) => console.warn("Low diesel alert listener failed:", error?.message || error));
    return stop;
  }, []);

  const low = useMemo(() => stock !== null && settings.enabled && stock < settings.lowDieselThreshold, [stock, settings]);

  const playTone = () => {
    if (settingsRef.current.silent) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioRef.current) audioRef.current = new AudioContextClass();
      const ctx = audioRef.current;
      const now = ctx.currentTime;
      [[880,0,.22],[660,.27,.22],[880,.54,.22],[660,.81,.22],[990,1.08,.32]].forEach(([frequency, offset, duration]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(.6, now + offset + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + offset); osc.stop(now + offset + duration + .03);
      });
      if (navigator.vibrate) navigator.vibrate([300,100,300,100,500]);
    } catch (error) { console.warn("Low diesel alert tone blocked:", error?.message || error); }
  };

  const showSystem = async (title, body) => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body, icon: "/icon-192.svg", badge: "/icon-192.svg", tag: "powerhouse-low-diesel", renotify: true,
        requireInteraction: true, silent: settingsRef.current.silent, vibrate: [300,100,300,100,500], data: { route: "/fuel-management", type: "low_diesel" }
      });
    } catch (error) { console.warn("Low diesel browser notification skipped:", error?.message || error); }
  };

  const fireAlert = () => {
    if (!low) return;
    const current = Number(stock || 0);
    const threshold = settingsRef.current.lowDieselThreshold;
    const title = "🚨 LOW DIESEL STOCK";
    const body = `Diesel stock is ${current.toFixed(0)} L. Alert level is ${threshold.toFixed(0)} L.`;
    setAlert({ title, body });
    lastAlertRef.current = Date.now();
    playTone();
    void showSystem(title, body);
  };

  useEffect(() => {
    if (!low) { lastAlertRef.current = 0; setAlert(null); return undefined; }
    fireAlert();
    const intervalMs = Math.max(1, Number(settings.repeatMinutes || 30)) * 60 * 1000;
    timerRef.current = window.setInterval(() => fireAlert(), intervalMs);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [low, settings.repeatMinutes, settings.silent, stock]);

  useEffect(() => () => { try { void audioRef.current?.close?.(); } catch {} }, []);

  if (!alert || !low) return null;
  return <div className="fixed inset-x-3 top-20 z-[300] mx-auto w-auto max-w-xl animate-[pulse_2s_ease-in-out_infinite] rounded-2xl border border-red-500/50 bg-red-950/95 p-4 shadow-[0_0_50px_rgba(239,68,68,.3)] backdrop-blur-xl" role="alert">
    <div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white"><AlertTriangle size={23}/></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black tracking-wide text-red-100">{alert.title}</p><p className="mt-1 text-sm text-red-100/80">{alert.body}</p></div><button onClick={()=>setAlert(null)} className="rounded-lg p-1.5 text-red-100/70 hover:bg-white/10" aria-label="Dismiss alert"><X size={17}/></button></div><div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider"><span className="rounded-full bg-red-500/20 px-2.5 py-1 text-red-200">Critical operational alert</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-red-100">Repeats every {settings.repeatMinutes} min</span>{settings.silent ? <span className="inline-flex items-center gap-1 text-yellow-300"><VolumeX size={13}/>Silent</span> : <span className="inline-flex items-center gap-1 text-red-100"><Volume2 size={13}/>Sound on</span>}</div></div></div></div>;
}
