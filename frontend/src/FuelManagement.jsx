import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CalendarDays, Download, FileText, Fuel, LayoutDashboard, Plus, Printer, RefreshCw, Trash2, X, Zap } from "lucide-react";
import { db } from "./firebase";
import { getUser } from "./utils/auth";

const ENGINES = {
  "1400kva": { label: "1400 KVA", ratedKW: 1120, curve: [[1,22],[5,34],[10,52],[20,84],[30,114],[40,146],[50,178],[60,210],[70,242],[80,275],[90,310],[100,345]] },
  "1020kva": { label: "1020 KVA", ratedKW: 816, curve: [[1,19],[5,28],[10,40],[20,64],[30,87],[40,112],[50,136],[60,160],[70,185],[80,212],[90,240],[100,265]] },
  "650kva": { label: "650 KVA", ratedKW: 520, curve: [[1,13],[5,20],[10,27],[20,42],[30,56],[40,72],[50,88],[60,105],[70,123],[80,141],[90,160],[100,178]] }
};
const USAGE_PRESETS = ["Boiler", "CEO Home", "Lifter", "Machine", "Maintenance", "Other"];
const today = () => new Date().toISOString().slice(0, 10);
const n = value => Number(value) || 0;
const parseHours = value => { const text = String(value || "0").replace(".", ":"); const parts = text.split(":").map(Number); return (parts[0] || 0) + (parts[1] || 0) / 60; };
const interpolate = (curve, load) => { if (load <= curve[0][0]) return curve[0][1]; if (load >= 100) return curve[curve.length - 1][1]; for (let i = 0; i < curve.length - 1; i += 1) { const [a, af] = curve[i]; const [b, bf] = curve[i + 1]; if (load >= a && load <= b) return af + ((load - a) / (b - a)) * (bf - af); } return curve[curve.length - 1][1]; };
const fuelFor = (engine, hours, kwh) => { const config = ENGINES[engine]; if (!config || hours <= 0) return 0; const expected = config.ratedKW * hours; const load = Math.min(100, Math.max(1, n(kwh) > 0 ? (n(kwh) / expected) * 100 : 50)); return Number((interpolate(config.curve, load) * hours).toFixed(2)); };
const esc = value => `"${String(value ?? "").replace(/"/g, '""')}"`;

const initialGenerator = () => ({ id: `${Date.now()}-${Math.random()}`, engine: "1400kva", previousHours: "", runHours: "", startTime: "", kwh: "" });
const initialDraft = previousStock => ({ date: today(), previousStock: previousStock || "", incoming: "", generators: [initialGenerator()], usage: [{ name: "", amount: "" }], notes: "" });

function Stat({ title, value, unit, tone = "white", icon: Icon }) {
  const tones = { white: "text-white", yellow: "text-yellow-400", green: "text-green-400", blue: "text-blue-400", red: "text-red-400", orange: "text-orange-400" };
  return <div className="rounded-2xl border border-white/5 bg-[#020617] p-4 md:p-5"><div className="flex justify-between"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</p>{Icon && <Icon size={16} className={tones[tone]}/>}</div><p className={`mt-2 text-2xl md:text-3xl font-black ${tones[tone]}`}>{value}<span className="ml-1 text-[10px] text-slate-500">{unit || ""}</span></p></div>;
}

const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-yellow-500/60";
const labelClass = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";

function getRange(mode, anchor, customFrom, customTo) {
  if (mode === "custom") return [customFrom || anchor, customTo || anchor];
  const d = new Date(`${anchor}T00:00:00`);
  if (mode === "daily") return [anchor, anchor];
  if (mode === "monthly") return [new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)];
  const start = new Date(d); start.setDate(d.getDate() - d.getDay()); const end = new Date(start); end.setDate(start.getDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

export default function FuelManagement() {
  const user = getUser();
  const [view, setView] = useState("dashboard");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reportMode, setReportMode] = useState("monthly");
  const [reportAnchor, setReportAnchor] = useState(today());
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [reportEngine, setReportEngine] = useState("all");
  const [reportUsage, setReportUsage] = useState("all");
  const [draft, setDraft] = useState(initialDraft("") );

  useEffect(() => {
    const q = query(collection(db, "entries"), orderBy("createdAt", "asc"));
    return onSnapshot(q, snapshot => { setEntries(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); setLoading(false); }, error => { setMessage(error.message || "Fuel data could not be loaded from Firebase."); setLoading(false); });
  }, []);

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)), [entries]);
  const latestStock = sortedEntries.length ? n(sortedEntries[sortedEntries.length - 1].currentStock ?? sortedEntries[sortedEntries.length - 1].stock) : 0;
  const draftCalculated = useMemo(() => {
    const generators = draft.generators.map(item => { const hours = Math.max(0, parseHours(item.runHours) - parseHours(item.previousHours)); const fuel = fuelFor(item.engine, hours, item.kwh); const stop = item.startTime && hours > 0 ? (() => { const [h, m] = item.startTime.split(":").map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); d.setMinutes(d.getMinutes() + hours * 60); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; })() : ""; return { ...item, hours, fuel, stop }; });
    const usage = draft.usage.reduce((sum, item) => sum + n(item.amount), 0);
    const generatorFuel = generators.reduce((sum, item) => sum + item.fuel, 0);
    const consumption = Number((generatorFuel + usage).toFixed(2));
    const currentStock = Number((n(draft.previousStock) + n(draft.incoming) - consumption).toFixed(2));
    return { generators, usage, generatorFuel, consumption, currentStock };
  }, [draft]);

  const [rangeFrom, rangeTo] = getRange(reportMode, reportAnchor, customFrom, customTo);
  const reportEntries = useMemo(() => sortedEntries.filter(entry => String(entry.date || "") >= rangeFrom && String(entry.date || "") <= rangeTo && (reportEngine === "all" || (entry.engines || []).some(item => item.name === reportEngine)) && (reportUsage === "all" || (entry.other || []).some(item => item.name === reportUsage))), [sortedEntries, rangeFrom, rangeTo, reportEngine, reportUsage]);
  const totals = useMemo(() => {
    const fuel = reportEntries.reduce((sum, entry) => sum + (entry.engines || []).reduce((a, item) => a + n(item.fuel), 0), 0);
    const consumption = reportEntries.reduce((sum, entry) => sum + n(entry.totalConsumption), 0);
    const incoming = reportEntries.reduce((sum, entry) => sum + n(entry.incoming), 0);
    const hours = reportEntries.reduce((sum, entry) => sum + (entry.engines || []).reduce((a, item) => a + n(item.duration), 0), 0);
    return { fuel, consumption, incoming, hours, average: reportEntries.length ? fuel / reportEntries.length : 0 };
  }, [reportEntries]);
  const engineHours = useMemo(() => Object.fromEntries(Object.keys(ENGINES).map(key => [key, reportEntries.reduce((sum, entry) => sum + (entry.engines || []).filter(item => item.name === key).reduce((a, item) => a + n(item.duration), 0), 0)])), [reportEntries]);
  const trend = useMemo(() => reportEntries.slice(-14).map(entry => ({ date: entry.date, consumption: n(entry.totalConsumption), incoming: n(entry.incoming) })), [reportEntries]);

  useEffect(() => { setDraft(current => current.date ? { ...current, previousStock: current.previousStock === "" ? latestStock : current.previousStock } : initialDraft(latestStock)); }, [latestStock]);

  const saveEntry = async event => {
    event.preventDefault(); setSaving(true); setMessage("");
    if (!draft.date) { setMessage("Date is required."); setSaving(false); return; }
    if (draft.date > today()) { setMessage("Future date is not allowed."); setSaving(false); return; }
    if (draftCalculated.consumption <= 0 && n(draft.incoming) <= 0) { setMessage("Add at least one generator run, usage amount or incoming fuel."); setSaving(false); return; }
    try {
      const payload = { userName: user?.name || user?.email || "Admin", userId: user?.uid || user?.id || "", date: draft.date, previousStock: n(draft.previousStock), incoming: n(draft.incoming), engines: draftCalculated.generators.map(item => ({ name: item.engine, duration: Number(item.hours.toFixed(2)), fuel: item.fuel, startTime: item.startTime, stopTime: item.stop, kwh: n(item.kwh), previousHours: item.previousHours })), other: draft.usage.filter(item => item.name || n(item.amount)).map(item => ({ name: item.name || "Other", amount: n(item.amount) })), engineFuel: draftCalculated.generatorFuel, otherTotal: draftCalculated.usage, totalConsumption: draftCalculated.consumption, currentStock: draftCalculated.currentStock, stock: draftCalculated.currentStock, notes: draft.notes.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await addDoc(collection(db, "entries"), payload);
      setMessage("Fuel entry saved to Firestore successfully.");
      setDraft(initialDraft(draftCalculated.currentStock));
      setView("dashboard");
    } catch (error) { setMessage(error.message || "Could not save fuel entry."); }
    finally { setSaving(false); }
  };

  const deleteEntry = async id => {
    if (!window.confirm("Delete this fuel entry permanently?")) return;
    try { await deleteDoc(doc(db, "entries", id)); setMessage("Fuel entry deleted."); } catch (error) { setMessage(error.message || "Could not delete fuel entry."); }
  };

  const exportCsv = () => {
    const rows = reportEntries.map(entry => [entry.date, entry.userName, (entry.engines || []).map(x => `${ENGINES[x.name]?.label || x.name}: ${n(x.fuel).toFixed(2)}L`).join(" | "), n(entry.engineFuel).toFixed(2), n(entry.incoming).toFixed(2), n(entry.otherTotal).toFixed(2), n(entry.totalConsumption).toFixed(2), n(entry.currentStock).toFixed(2), entry.notes || ""]);
    const csv = [["Date","Recorded By","Generators","Generator Fuel L","Incoming L","Other Usage L","Total Consumption L","Closing Stock L","Notes"], ...rows].map(row => row.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `fuel-report-${rangeFrom}-to-${rangeTo}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const setGenerator = (id, key, value) => setDraft(current => ({ ...current, generators: current.generators.map(item => item.id === id ? { ...item, [key]: value } : item) }));
  const setUsage = (index, key, value) => setDraft(current => ({ ...current, usage: current.usage.map((item, i) => i === index ? { ...item, [key]: value } : item) }));

  return <div className="space-y-5 animate-in fade-in duration-500 print:bg-white print:text-black">
    <div className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden">
      <div className="p-4 md:p-5 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Fuel size={22}/></div><div><h1 className="text-xl md:text-2xl font-black">Fuel Management</h1><p className="text-[9px] text-slate-500 uppercase tracking-[0.2em]">Diesel, generator runtime, stock and consumption control</p></div></div><div className="flex flex-wrap gap-2">{[["dashboard","Dashboard",LayoutDashboard],["entry","New Entry",Plus],["reports","Reports",FileText]].map(([id,label,Icon]) => <button key={id} onClick={() => setView(id)} className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 ${view === id ? "bg-yellow-500 text-black" : "bg-white/5 text-slate-300"}`}><Icon size={15}/>{label}</button>)}<button onClick={() => window.location.reload()} className="p-2.5 rounded-xl bg-white/5"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/></button></div></div>
      {message && <div className="mx-4 mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">{message}</div>}

      {view === "dashboard" && <div className="p-4 md:p-7 space-y-6"><div className="flex items-end justify-between"><div><h2 className="text-2xl font-black">Fuel Dashboard</h2><p className="text-slate-500 text-sm mt-1">Live Firestore data with stock, generator runtime and consumption overview.</p></div><span className="text-[9px] uppercase tracking-widest text-green-400 font-black">{loading ? "SYNCING" : "FIRESTORE LIVE"}</span></div><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Stat title="Generator Fuel" value={totals.fuel.toFixed(2)} unit="L" tone="yellow" icon={Fuel}/><Stat title="Consumption" value={totals.consumption.toFixed(2)} unit="L" tone="orange" icon={Zap}/><Stat title="Incoming" value={totals.incoming.toFixed(2)} unit="L" tone="blue" icon={Plus}/><Stat title="Average / Entry" value={totals.average.toFixed(2)} unit="L" tone="white" icon={BarChart3}/><Stat title="Current Stock" value={latestStock.toFixed(2)} unit="L" tone={latestStock < 3000 ? "red" : "green"} icon={Fuel}/></div><div className="grid grid-cols-3 gap-3">{Object.entries(ENGINES).map(([key, config]) => <Stat key={key} title={`${config.label} Hours`} value={engineHours[key].toFixed(2)} unit="h" icon={CalendarDays} tone="white"/>)}</div><div className="grid lg:grid-cols-2 gap-5"><div className="rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">Fuel / Consumption Trend</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={trend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="consumption" stroke="#ef4444" strokeWidth={3}/><Line type="monotone" dataKey="incoming" stroke="#eab308" strokeWidth={2}/></LineChart></ResponsiveContainer></div><div className="rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">Generator Runtime</h3><ResponsiveContainer width="100%" height="90%"><BarChart data={Object.entries(ENGINES).map(([key, config]) => ({ name: config.label, hours: Number(engineHours[key].toFixed(2)) }))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="hours" fill="#eab308"/></BarChart></ResponsiveContainer></div></div></div>}

      {view === "entry" && <div className="p-4 md:p-7"><form onSubmit={saveEntry} className="max-w-6xl mx-auto space-y-5"><section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div><label className={labelClass}>Recorded By</label><input readOnly value={user?.name || user?.email || "Admin"} className="field w-full bg-slate-100 rounded-xl px-3 py-3"/></div><div><label className={labelClass}>Date *</label><input required type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} className="field w-full bg-slate-100 rounded-xl px-3 py-3"/></div><div><label className={labelClass}>Previous Stock (L)</label><input type="number" min="0" step="0.01" value={draft.previousStock} onChange={e => setDraft(d => ({ ...d, previousStock: e.target.value }))} className="field w-full bg-slate-100 rounded-xl px-3 py-3"/></div><div><label className={labelClass}>Incoming Fuel (L)</label><input type="number" min="0" step="0.01" value={draft.incoming} onChange={e => setDraft(d => ({ ...d, incoming: e.target.value }))} className="field w-full bg-slate-100 rounded-xl px-3 py-3"/></div></div></section>

        <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><div className="flex items-center justify-between"><div><h2 className="font-black">Generator Runtime</h2><p className="text-xs text-slate-500 mt-1">Add one or more generator runs. Fuel is calculated from runtime and kWh using the configured load curve.</p></div><button type="button" onClick={() => setDraft(d => ({ ...d, generators: [...d.generators, initialGenerator()] }))} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black"><Plus size={15} className="inline mr-1"/> ADD GENERATOR</button></div><div className="space-y-3 mt-5">{draft.generators.map((item, index) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3"><div><label className={labelClass}>Generator</label><select value={item.engine} onChange={e => setGenerator(item.id, "engine", e.target.value)} className={inputClass + " !bg-white !text-slate-900 !border-slate-300"}>{Object.entries(ENGINES).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}</select></div><div><label className={labelClass}>Previous Hours</label><input value={item.previousHours} onChange={e => setGenerator(item.id, "previousHours", e.target.value)} placeholder="0:00" className={inputClass + " !bg-white !text-slate-900 !border-slate-300"}/></div><div><label className={labelClass}>Run Hours</label><input value={item.runHours} onChange={e => setGenerator(item.id, "runHours", e.target.value)} placeholder="1:30" className={inputClass + " !bg-white !text-slate-900 !border-slate-300"}/></div><div><label className={labelClass}>Start Time</label><input type="time" value={item.startTime} onChange={e => setGenerator(item.id, "startTime", e.target.value)} className={inputClass + " !bg-white !text-slate-900 !border-slate-300"}/></div><div><label className={labelClass}>kWh</label><input type="number" min="0" step="0.01" value={item.kwh} onChange={e => setGenerator(item.id, "kwh", e.target.value)} className={inputClass + " !bg-white !text-slate-900 !border-slate-300"}/></div><div className="flex items-end gap-2"><div className="flex-1 rounded-xl bg-green-50 border border-green-200 px-3 py-3"><p className="text-[8px] uppercase font-black text-green-700">Fuel</p><p className="font-black text-green-800">{fuelFor(item.engine, Math.max(0, parseHours(item.runHours) - parseHours(item.previousHours)), item.kwh).toFixed(2)} L</p></div>{draft.generators.length > 1 && <button type="button" onClick={() => setDraft(d => ({ ...d, generators: d.generators.filter(x => x.id !== item.id) }))} className="p-3 rounded-xl bg-red-50 text-red-500"><Trash2 size={15}/></button>}</div></div><p className="text-[9px] text-slate-500 mt-3">Calculated runtime: {Math.max(0, parseHours(item.runHours) - parseHours(item.previousHours)).toFixed(2)} h · Auto stop: {draftCalculated.generators[index]?.stop || "—"}</p></div>)}</div></section>

        <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><div className="flex items-center justify-between"><div><h2 className="font-black">Other Fuel Usage</h2><p className="text-xs text-slate-500 mt-1">Boiler, CEO Home, Lifter, Machine, Maintenance or any custom usage.</p></div><button type="button" onClick={() => setDraft(d => ({ ...d, usage: [...d.usage, { name: "", amount: "" }] }))} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black"><Plus size={15} className="inline mr-1"/> ADD USAGE</button></div><div className="space-y-2 mt-5">{draft.usage.map((item, index) => <div key={index} className="flex gap-2"><select value={USAGE_PRESETS.includes(item.name) ? item.name : item.name ? "__custom__" : ""} onChange={e => setUsage(index, "name", e.target.value === "__custom__" ? "" : e.target.value)} className="field flex-1 bg-slate-100 rounded-xl px-3 py-3"><option value="">Select usage</option>{USAGE_PRESETS.map(x => <option key={x}>{x}</option>)}<option value="__custom__">+ Custom Usage</option></select><input value={item.name} onChange={e => setUsage(index, "name", e.target.value)} placeholder="Custom name" className="field flex-1 bg-slate-100 rounded-xl px-3 py-3"/><input type="number" min="0" step="0.01" value={item.amount} onChange={e => setUsage(index, "amount", e.target.value)} placeholder="Liters" className="field w-32 bg-slate-100 rounded-xl px-3 py-3"/></div>)}</div></section>

        <section className="rounded-[2rem] bg-slate-900 text-white p-5 md:p-7"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Generator Fuel</p><p className="text-xl font-black text-yellow-400 mt-1">{draftCalculated.generatorFuel.toFixed(2)} L</p></div><div><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Other Usage</p><p className="text-xl font-black mt-1">{draftCalculated.usage.toFixed(2)} L</p></div><div><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Total Consumption</p><p className="text-xl font-black text-orange-400 mt-1">{draftCalculated.consumption.toFixed(2)} L</p></div><div><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Closing Stock</p><p className={`text-xl font-black mt-1 ${draftCalculated.currentStock < 3000 ? "text-red-400" : "text-green-400"}`}>{draftCalculated.currentStock.toFixed(2)} L</p></div></div><textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows="3" placeholder="Shift notes, WAPDA outage, load sharing, remarks..." className="w-full mt-5 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none"/><div className="flex justify-end mt-4"><button disabled={saving} className="px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">{saving ? "Saving..." : "SAVE FUEL ENTRY"}</button></div></section>
      </form></div>}

      {view === "reports" && <div className="p-4 md:p-7 space-y-5 print:p-0"><section className="rounded-[2rem] bg-[#020617] border border-white/5 p-5"><div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4"><div><h2 className="text-2xl font-black">Fuel Reports</h2><p className="text-slate-500 text-sm mt-1">Daily, weekly, monthly and custom reports with engine and usage filters.</p></div><div className="flex flex-wrap gap-2"><select value={reportMode} onChange={e => setReportMode(e.target.value)} className={inputClass + " w-auto"}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>{reportMode === "custom" ? <><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={inputClass + " w-auto"}/><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={inputClass + " w-auto"}/></> : <input type="date" value={reportAnchor} onChange={e => setReportAnchor(e.target.value)} className={inputClass + " w-auto"}/>}<select value={reportEngine} onChange={e => setReportEngine(e.target.value)} className={inputClass + " w-auto"}><option value="all">All Generators</option>{Object.entries(ENGINES).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}</select><button onClick={exportCsv} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Download size={15} className="inline mr-1"/> CSV</button><button onClick={() => window.print()} className="px-4 py-3 rounded-xl bg-white/5 text-xs font-black"><Printer size={15} className="inline mr-1"/> PRINT</button></div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><Stat title="Period Consumption" value={totals.consumption.toFixed(2)} unit="L" tone="orange" icon={Fuel}/><Stat title="Generator Fuel" value={totals.fuel.toFixed(2)} unit="L" tone="yellow" icon={Zap}/><Stat title="Incoming" value={totals.incoming.toFixed(2)} unit="L" tone="blue" icon={Plus}/><Stat title="Runtime" value={totals.hours.toFixed(2)} unit="h" tone="white" icon={CalendarDays}/></div><p className="text-[10px] text-slate-600 mt-4">Report period: {rangeFrom} → {rangeTo} · {reportEntries.length} entries</p></section>

        <section className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden"><div className="p-5 border-b border-white/5 flex items-center justify-between"><div><h3 className="font-black">Detailed Fuel Register</h3><p className="text-xs text-slate-500 mt-1">Each saved record remains stored in Firestore.</p></div><select value={reportUsage} onChange={e => setReportUsage(e.target.value)} className={inputClass + " w-auto"}><option value="all">All Usage Types</option>{USAGE_PRESETS.map(x => <option key={x}>{x}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px]"><thead><tr className="border-b border-white/5">{["Date","Recorded By","Generators","Generator Fuel","Incoming","Other","Total Consumption","Closing Stock","Actions"].map(h => <th key={h} className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{reportEntries.map(entry => <tr key={entry.id} className="border-b border-white/[0.04]"><td className="px-4 py-3 text-xs font-bold">{entry.date}</td><td className="px-4 py-3 text-xs text-slate-400">{entry.userName || "—"}</td><td className="px-4 py-3 text-xs text-slate-300">{(entry.engines || []).map(item => `${ENGINES[item.name]?.label || item.name}: ${n(item.duration).toFixed(2)}h`).join(" · ") || "—"}</td><td className="px-4 py-3 text-xs font-black text-yellow-400">{n(entry.engineFuel).toFixed(2)} L</td><td className="px-4 py-3 text-xs text-blue-300">{n(entry.incoming).toFixed(2)} L</td><td className="px-4 py-3 text-xs text-slate-300">{n(entry.otherTotal).toFixed(2)} L</td><td className="px-4 py-3 text-xs font-black text-orange-400">{n(entry.totalConsumption).toFixed(2)} L</td><td className={`px-4 py-3 text-xs font-black ${n(entry.currentStock) < 3000 ? "text-red-400" : "text-green-400"}`}>{n(entry.currentStock).toFixed(2)} L</td><td className="px-4 py-3"><button onClick={() => deleteEntry(entry.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400" title="Delete"><Trash2 size={14}/></button></td></tr>)}</tbody></table>{reportEntries.length === 0 && <div className="py-16 text-center text-xs uppercase tracking-widest text-slate-600">No fuel records for the selected report.</div>}</div></section></div>}
    </div>
    <style>{`@media print { body { background:#fff !important; } body * { visibility:hidden; } .print\\:bg-white, .print\\:bg-white * { visibility:visible; } .print\\:bg-white { position:absolute; left:0; top:0; width:100%; } button { display:none !important; } }`}</style>
  </div>;
}
