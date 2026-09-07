import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { AlertTriangle, Bell, BellOff, CheckCircle2, Clock3, RefreshCw, Send, ShieldCheck, Volume2, VolumeX, XCircle, Zap } from "lucide-react";
import { db, app } from "../firebase";
import { enablePushNotifications } from "../services/notificationService";

const SETTINGS_REF = doc(db, "powerhouse_settings", "alerts");
const STATE_REF = doc(db, "powerhouse_alert_state", "current");
const DEFAULTS = { enabled: true, lowDieselThreshold: 3000, repeatMinutes: 30, pushEnabled: true, silent: false, alarmDurationSeconds: 30, alarmTone: "chime", customSoundUrl: "" };
const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const toDate = value => value?.toDate?.() || (value ? new Date(value) : null);
const fmtDate = value => { const d = toDate(value); return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "—"; };

export default function DieselAlertNotifications() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [saved, setSaved] = useState(DEFAULTS);
  const [stock, setStock] = useState(null);
  const [active, setActive] = useState(null);
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [pushState, setPushState] = useState(typeof Notification !== "undefined" && Notification.permission === "granted" ? "enabled" : "idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => onSnapshot(SETTINGS_REF, snap => {
    const d = snap.exists() ? snap.data() || {} : {};
    const next = { ...DEFAULTS, ...d, lowDieselThreshold: Math.max(0, n(d.lowDieselThreshold ?? d.lowStockLevel, DEFAULTS.lowDieselThreshold)), repeatMinutes: Math.max(1, n(d.repeatMinutes ?? d.repeatIntervalMinutes, DEFAULTS.repeatMinutes)), enabled: d.enabled !== false && d.alertsEnabled !== false, pushEnabled: d.pushEnabled !== false, silent: d.silent === true || d.silentMode === true, alarmDurationSeconds: Math.min(30, Math.max(20, n(d.alarmDurationSeconds, 30))) };
    setSettings(next); setSaved(next);
  }, e => setError(e?.message || "Unable to load alert settings.")), []);

  useEffect(() => {
    const q = query(collection(db, "entries"), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(q, snap => { const d = snap.docs[0]?.data() || {}; setStock(n(d.currentStock ?? d.stock ?? d.remainingStock ?? d.closingStock, 0)); }, e => setError(e?.message || "Unable to read current diesel stock."));
  }, []);

  useEffect(() => onSnapshot(STATE_REF, snap => {
    if (!snap.exists()) return setActive(null);
    const d = snap.data() || {}; const expiry = toDate(d.expiresAt); if (d.active === false || (expiry && expiry.getTime() < Date.now())) return setActive(null);
    setActive({ id: String(d.alertId || snap.id), ...d, currentStock: n(d.currentStock ?? d.stock, stock ?? 0), lowStockLevel: n(d.lowStockLevel ?? d.lowDieselThreshold, settings.lowDieselThreshold) });
  }, e => setError(e?.message || "Unable to read active alert.")), [settings.lowDieselThreshold, stock]);

  useEffect(() => {
    const q = query(collection(db, "powerhouse_alert_events"), orderBy("createdAt", "desc"), limit(30));
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setEvents([]));
  }, []);

  const low = stock !== null && settings.enabled && stock < settings.lowDieselThreshold;
  const changed = JSON.stringify(settings) !== JSON.stringify(saved);
  const lowEvents = useMemo(() => events.filter(x => String(x.type || "") === "low_diesel" || /diesel/i.test(String(x.title || ""))), [events]);

  const saveSettings = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const next = { ...settings, lowDieselThreshold: Math.max(0, n(settings.lowDieselThreshold, 0)), repeatMinutes: Math.max(1, Math.round(n(settings.repeatMinutes, 30))), alarmDurationSeconds: Math.min(30, Math.max(20, Math.round(n(settings.alarmDurationSeconds, 30)))), updatedAt: serverTimestamp() };
      await setDoc(SETTINGS_REF, next, { merge: true }); setSaved({ ...next, updatedAt: undefined }); setSettings({ ...next, updatedAt: undefined }); setMessage("Diesel alert settings saved successfully.");
    } catch (e) { setError(e?.message || "Unable to save alert settings."); } finally { setSaving(false); }
  };

  const enablePush = async () => {
    setPushState("loading"); setError("");
    try { const token = await enablePushNotifications(); if (!token) throw new Error("Push permission was not granted."); setPushState("enabled"); setMessage("Push notifications are enabled on this device."); }
    catch (e) { setPushState("idle"); setError(e?.message || "Unable to enable push notifications."); }
  };

  const clearAlert = async () => {
    setError(""); setMessage("");
    try { const clear = httpsCallable(getFunctions(app, "us-central1"), "clearPowerhouseAlert"); await clear({}); setMessage("Active diesel alert cleared."); }
    catch (e) { setError(e?.message || "Unable to clear the active alert."); }
  };

  const sendManual = async e => {
    e.preventDefault(); if (!manualTitle.trim() || !manualBody.trim()) return setError("Alert title and message are required.");
    setSending(true); setError(""); setMessage("");
    try { const send = httpsCallable(getFunctions(app, "us-central1"), "sendPowerhouseAlert"); const result = await send({ title: manualTitle.trim(), body: manualBody.trim(), type: "manual", route: "/fuel-management", expiresMinutes: Math.max(5, settings.repeatMinutes) }); setMessage(`Alert published successfully. Push sent: ${n(result?.data?.delivery?.sent, 0)}.`); setManualTitle(""); setManualBody(""); }
    catch (e) { setError(e?.message || "Unable to publish alert."); } finally { setSending(false); }
  };

  return <section className="space-y-5 pb-10">
    <div className="rounded-[2rem] border border-red-500/15 bg-[#020617] p-5 md:p-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div><div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[.2em] text-red-300"><AlertTriangle size={13}/> Diesel Alert Center</div><h1 className="mt-3 text-3xl font-black md:text-4xl">Diesel Alert Notifications</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Live diesel stock monitoring, low-stock alerts, push delivery and alert controls — restored as a dedicated responsive page.</p></div>
        <button onClick={enablePush} disabled={pushState === "loading"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black disabled:opacity-60">{pushState === "loading" ? <RefreshCw size={15} className="animate-spin"/> : <Bell size={15}/>} {pushState === "enabled" ? "Push Enabled" : "Enable Push"}</button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Current Diesel</p><p className={`mt-2 text-3xl font-black ${low ? "text-red-400" : "text-emerald-400"}`}>{stock === null ? "—" : stock.toLocaleString()} <small className="text-xs text-slate-500">L</small></p><p className="mt-1 text-[10px] text-slate-600">Latest closing stock</p></div>
        <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Alert Level</p><p className="mt-2 text-3xl font-black text-yellow-400">{n(settings.lowDieselThreshold).toLocaleString()} <small className="text-xs text-slate-500">L</small></p><p className="mt-1 text-[10px] text-slate-600">Low-stock threshold</p></div>
        <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Status</p><p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${low ? "bg-red-500/15 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{low ? <XCircle size={14}/> : <CheckCircle2 size={14}/>} {low ? "LOW DIESEL" : "NORMAL"}</p></div>
        <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Repeats</p><p className="mt-2 text-3xl font-black text-white">{n(settings.repeatMinutes)} <small className="text-xs text-slate-500">min</small></p><p className="mt-1 text-[10px] text-slate-600">Alert repeat interval</p></div>
      </div>
    </div>

    {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
    {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{message}</div>}

    {active && <div className="rounded-[1.7rem] border border-red-500/30 bg-red-950/30 p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white"><AlertTriangle size={22}/></div><div><p className="text-xs font-black uppercase tracking-widest text-red-300">Active Alert</p><h2 className="mt-1 text-xl font-black text-white">{active.title || "LOW DIESEL STOCK"}</h2><p className="mt-1 text-sm text-red-100/70">{active.body || "Diesel stock is below the configured alert level."}</p></div></div><button onClick={clearAlert} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-red-900"><BellOff size={15}/> Clear Alert</button></div></div>}

    <div className="grid gap-5 xl:grid-cols-3">
      <div className="rounded-[1.7rem] border border-white/8 bg-[#020617] p-5 xl:col-span-2"><div className="flex items-center gap-2"><Zap size={18} className="text-yellow-400"/><h2 className="font-black">Diesel Alert Settings</h2></div><p className="mt-1 text-xs text-slate-500">Changes are saved to the same Firestore alert settings used by the live alert engine.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Low diesel threshold (L)</span><input type="number" min="0" value={settings.lowDieselThreshold} onChange={e=>setSettings(s=>({...s,lowDieselThreshold:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"/></label><label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Repeat interval (min)</span><input type="number" min="1" value={settings.repeatMinutes} onChange={e=>setSettings(s=>({...s,repeatMinutes:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"/></label><label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ring duration (sec)</span><input type="number" min="20" max="30" value={settings.alarmDurationSeconds} onChange={e=>setSettings(s=>({...s,alarmDurationSeconds:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"/></label></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>setSettings(s=>({...s,enabled:!s.enabled}))} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-black ${settings.enabled?"bg-emerald-500 text-black":"bg-white/10 text-slate-300"}`}>{settings.enabled?<CheckCircle2 size={15}/>:<XCircle size={15}/>} Alerts {settings.enabled?"ON":"OFF"}</button><button type="button" onClick={()=>setSettings(s=>({...s,pushEnabled:!s.pushEnabled}))} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-black ${settings.pushEnabled?"bg-blue-500 text-white":"bg-white/10 text-slate-300"}`}><Bell size={15}/> Push {settings.pushEnabled?"ON":"OFF"}</button><button type="button" onClick={()=>setSettings(s=>({...s,silent:!s.silent}))} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-black ${settings.silent?"bg-white/10 text-slate-300":"bg-red-500 text-white"}`}>{settings.silent?<VolumeX size={15}/>:<Volume2 size={15}/>} Sound {settings.silent?"OFF":"ON"}</button><button disabled={!changed||saving} onClick={saveSettings} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 text-xs font-black text-black disabled:opacity-40">{saving?<RefreshCw size={15} className="animate-spin"/>:<ShieldCheck size={15}/>} Save Settings</button></div></div>
      <div className="rounded-[1.7rem] border border-white/8 bg-[#020617] p-5"><div className="flex items-center gap-2"><Clock3 size={18} className="text-blue-400"/><h2 className="font-black">Alert Engine</h2></div><div className="mt-5 space-y-3 text-sm"><div className="flex items-center justify-between rounded-xl bg-white/[.03] p-3"><span className="text-slate-500">Monitoring</span><strong className={settings.enabled?"text-emerald-400":"text-slate-500"}>{settings.enabled?"ACTIVE":"DISABLED"}</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[.03] p-3"><span className="text-slate-500">Push delivery</span><strong className={settings.pushEnabled?"text-blue-400":"text-slate-500"}>{settings.pushEnabled?"ENABLED":"OFF"}</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[.03] p-3"><span className="text-slate-500">Sound</span><strong>{settings.silent?"Silent":"Enabled"}</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[.03] p-3"><span className="text-slate-500">Last active</span><strong className="text-xs text-slate-300">{active?fmtDate(active.createdAt):"No active alert"}</strong></div></div></div>
    </div>

    <form onSubmit={sendManual} className="rounded-[1.7rem] border border-yellow-500/15 bg-yellow-500/[.025] p-5"><div className="flex items-center gap-2"><Send size={18} className="text-yellow-400"/><h2 className="font-black">Send Diesel / PowerHouse Alert</h2></div><div className="mt-4 grid gap-3 md:grid-cols-3"><input value={manualTitle} onChange={e=>setManualTitle(e.target.value)} placeholder="Alert title" className="rounded-xl border border-white/10 bg-[#020617] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"/><input value={manualBody} onChange={e=>setManualBody(e.target.value)} placeholder="Alert message" className="rounded-xl border border-white/10 bg-[#020617] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500 md:col-span-2"/></div><button disabled={sending} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 text-xs font-black text-black disabled:opacity-50">{sending?<RefreshCw size={15} className="animate-spin"/>:<Send size={15}/>} {sending?"Publishing…":"Publish Alert"}</button></form>

    <div className="rounded-[1.7rem] border border-white/8 bg-[#020617] p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Diesel Alert History</h2><p className="mt-1 text-xs text-slate-500">Live alert events from Firestore.</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-black text-slate-400">{lowEvents.length} diesel events</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-white/5 text-[9px] uppercase tracking-widest text-slate-600"><th className="px-3 py-3">Alert</th><th className="px-3 py-3">Current</th><th className="px-3 py-3">Level</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Time</th></tr></thead><tbody>{lowEvents.length===0?<tr><td colSpan="5" className="px-3 py-12 text-center text-sm text-slate-500">No diesel alert events recorded yet.</td></tr>:lowEvents.map(item=><tr key={item.id} className="border-b border-white/5 last:border-0"><td className="px-3 py-4"><p className="font-bold text-white">{item.title||"LOW DIESEL STOCK"}</p><p className="mt-1 max-w-md truncate text-xs text-slate-500">{item.body||"—"}</p></td><td className="px-3 py-4 font-black text-red-300">{n(item.currentStock).toLocaleString()} L</td><td className="px-3 py-4 font-bold text-yellow-400">{n(item.lowStockLevel).toLocaleString()} L</td><td className="px-3 py-4 text-xs text-slate-400">{item.type||"—"}</td><td className="px-3 py-4 text-xs text-slate-500">{fmtDate(item.createdAt)}</td></tr>)}</tbody></table></div></div>
  </section>;
}
