import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { Activity, AlertTriangle, BarChart3, CalendarDays, ChevronRight, Download, FileText, Fuel, LayoutDashboard, Plus, Printer, RefreshCw, Trash2, Wrench, Zap } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db } from "./firebase";
import { getUser } from "./utils/auth";
import WapdaManagement from "./WapdaManagement";

const ENGINES = {
  "1400kva": { label: "1400 KVA", ratedKVA: 1400, ratedKW: 1120, model: "1400 KVA Generator" },
  "1020kva": { label: "1020 KVA", ratedKVA: 1020, ratedKW: 816, model: "1020 KVA Generator" },
  "650kva": { label: "650 KVA", ratedKVA: 650, ratedKW: 520, model: "650 KVA Generator" }
};
const USAGE = ["Boiler", "CEO Home", "Lifter", "Machine", "Maintenance", "Other"];
const num = value => Number(value) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const hours = value => { const p = String(value || "0").replace(".", ":").split(":").map(Number); return (p[0] || 0) + (p[1] || 0) / 60; };
const rate = (engine, load) => {
  const kva = ENGINES[engine]?.ratedKVA || 0;
  const p = Math.max(25, Math.min(100, num(load)));
  const points = [[25, kva * 0.05], [50, kva * 0.10], [80, kva * 0.16], [100, kva * 0.20]];
  for (let i = 0; i < 3; i += 1) { const a = points[i][0], af = points[i][1], b = points[i + 1][0], bf = points[i + 1][1]; if (p <= b) return af + ((p - a) / (b - a)) * (bf - af); }
  return points[3][1];
};
const fuel = (engine, runHours, kwh) => { const cfg = ENGINES[engine]; if (!cfg || runHours <= 0) return 0; const load = num(kwh) ? (num(kwh) / (cfg.ratedKW * runHours)) * 100 : 50; return Number((rate(engine, load) * runHours).toFixed(2)); };
const newGen = () => ({ id: Date.now() + Math.random(), engine: "1400kva", previousHours: "", runHours: "", startTime: "", kwh: "" });
const newDraft = stock => ({ date: today(), previousStock: stock ?? "", incoming: "", generators: [newGen()], usage: [{ name: "", amount: "" }], notes: "" });

function Alert({ h }) {
  if (h >= 220) return { text: "HIGH ALERT", cls: "border-red-500/40 bg-red-500/10 text-red-300", Icon: AlertTriangle };
  if (h >= 200) return { text: "SERVICE DUE", cls: "border-orange-500/40 bg-orange-500/10 text-orange-300", Icon: Wrench };
  if (h >= 180) return { text: "SERVICE WATCH", cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300", Icon: AlertTriangle };
  return { text: "NORMAL", cls: "border-green-500/30 bg-green-500/10 text-green-300", Icon: Activity };
}
function Stat({ title, value, unit, tone = "white", icon: Icon }) {
  const colors = { white: "text-white", yellow: "text-yellow-400", orange: "text-orange-400", blue: "text-blue-400", green: "text-green-400", red: "text-red-400" };
  return <div className="rounded-2xl border border-white/5 bg-[#020617] p-4"><div className="flex justify-between"><span className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</span>{Icon && <Icon size={16} className={colors[tone]} />}</div><div className={`mt-2 text-2xl font-black ${colors[tone]}`}>{value}<small className="ml-1 text-[10px] text-slate-500">{unit}</small></div></div>;
}
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white";
const light = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900";
const label = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";

export default function FuelManagement() {
  const user = getUser();
  const admin = user?.role === "admin" || user?.role === "superadmin";
  const [view, setView] = useState("dashboard");
  const [entries, setEntries] = useState([]);
  const [services, setServices] = useState([]);
  const [wapdaRows, setWapdaRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => newDraft(""));
  const [reportMode, setReportMode] = useState("monthly");
  const [reportDate, setReportDate] = useState(today());
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [engineFilter, setEngineFilter] = useState("all");

  useEffect(() => {
    const stopEntries = onSnapshot(query(collection(db, "entries"), orderBy("createdAt", "asc")), snap => { setEntries(snap.docs.map(x => ({ id: x.id, ...x.data() }))); setLoading(false); }, err => { setMessage(err.message || "Fuel data load failed."); setLoading(false); });
    const stopServices = onSnapshot(collection(db, "engineServiceLogs"), snap => setServices(snap.docs.map(x => ({ id: x.id, ...x.data() }))));
    const stopWapda = onSnapshot(collection(db, "wapdaReadings"), snap => setWapdaRows(snap.docs.map(x => ({ id: x.id, ...x.data() }))));
    return () => { stopEntries(); stopServices(); stopWapda(); };
  }, []);

  const sorted = useMemo(() => [...entries].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))), [entries]);
  const stock = sorted.length ? num(sorted[sorted.length - 1].currentStock ?? sorted[sorted.length - 1].stock) : 0;
  const wapdaSorted = useMemo(() => [...wapdaRows].sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")) || String(a.time||"").localeCompare(String(b.time||""))), [wapdaRows]);
  const wapdaLatest = wapdaSorted[wapdaSorted.length - 1];
  const wapdaToday = useMemo(() => wapdaSorted.filter(x => x.date === today()).reduce((s,x)=>s+num(x.consumedKwh),0), [wapdaSorted]);
  const wapdaMonth = useMemo(() => { const d = new Date(`${today()}T00:00:00`); const start = new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); const end = new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10); return wapdaSorted.filter(x=>x.date>=start&&x.date<=end).reduce((s,x)=>s+num(x.consumedKwh),0); }, [wapdaSorted]);
  const wapdaDay = useMemo(() => wapdaSorted.filter(x=>x.date===today()).reduce((s,x)=>s+num(x.dayUnits),0), [wapdaSorted]);
  const wapdaNight = useMemo(() => wapdaSorted.filter(x=>x.date===today()).reduce((s,x)=>s+num(x.nightUnits),0), [wapdaSorted]);

  const stats = useMemo(() => Object.entries(ENGINES).map(([key, cfg]) => {
    const runs = sorted.flatMap(e => (e.engines || []).filter(x => x.name === key).map(x => ({ ...x, date: e.date })));
    const total = runs.reduce((s, x) => s + num(x.duration), 0);
    const kwh = runs.reduce((s, x) => s + num(x.kwh), 0);
    const d = new Date(); const yesterday = new Date(d); yesterday.setDate(d.getDate() - 1); const yd = yesterday.toISOString().slice(0, 10);
    const last = [...services].filter(x => x.engine === key).sort((a, b) => String(b.serviceDate || "").localeCompare(String(a.serviceDate || "")))[0];
    const since = Math.max(0, total - num(last?.engineHoursAtService));
    return { key, ...cfg, total, kwh, today: runs.filter(x => x.date === today()).reduce((s, x) => s + num(x.duration), 0), previous: runs.filter(x => x.date === yd).reduce((s, x) => s + num(x.duration), 0), since, alert: Alert({ h: since }) };
  }), [sorted, services]);

  const report = useMemo(() => {
    let start = reportDate, end = reportDate;
    const d = new Date(reportDate + "T00:00:00");
    if (reportMode === "monthly") { start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); }
    if (reportMode === "weekly") { const s = new Date(d); s.setDate(d.getDate() - d.getDay()); const e = new Date(s); e.setDate(s.getDate() + 6); start = s.toISOString().slice(0, 10); end = e.toISOString().slice(0, 10); }
    if (reportMode === "custom") { start = from; end = to; }
    return sorted.filter(e => String(e.date || "") >= start && String(e.date || "") <= end && (engineFilter === "all" || (e.engines || []).some(x => x.name === engineFilter)));
  }, [sorted, reportMode, reportDate, from, to, engineFilter]);

  const totals = useMemo(() => ({ fuel: report.reduce((s, e) => s + (e.engines || []).reduce((a, x) => a + num(x.fuel), 0), 0), consumption: report.reduce((s, e) => s + num(e.totalConsumption), 0), incoming: report.reduce((s, e) => s + num(e.incoming), 0), hours: report.reduce((s, e) => s + (e.engines || []).reduce((a, x) => a + num(x.duration), 0), 0) }), [report]);
  const trend = useMemo(() => { const g = {}; report.forEach(e => { if (!g[e.date]) g[e.date] = { date: e.date, consumption: 0, incoming: 0 }; g[e.date].consumption += num(e.totalConsumption); g[e.date].incoming += num(e.incoming); }); return Object.values(g).slice(-31); }, [report]);
  const runtime = useMemo(() => { const g = {}; report.forEach(e => (e.engines || []).forEach(x => { if (!g[e.date]) g[e.date] = { date: e.date, "1400kva": 0, "1020kva": 0, "650kva": 0 }; g[e.date][x.name] += num(x.duration); })); return Object.values(g).slice(-14); }, [report]);
  const wapdaTrend = useMemo(() => { const g={}; wapdaSorted.slice(-31).forEach(x=>{ if(!g[x.date]) g[x.date]={date:x.date,consumed:0}; g[x.date].consumed += num(x.consumedKwh); }); return Object.values(g); }, [wapdaSorted]);

  const calc = useMemo(() => {
    const generators = draft.generators.map(x => { const h = Math.max(0, hours(x.runHours) - hours(x.previousHours)); const cfg = ENGINES[x.engine]; const load = h && num(x.kwh) ? Math.min(100, Math.max(25, num(x.kwh) / (cfg.ratedKW * h) * 100)) : 50; return { ...x, h, load, fuel: fuel(x.engine, h, x.kwh) }; });
    const other = draft.usage.reduce((s, x) => s + num(x.amount), 0); const generatorFuel = generators.reduce((s, x) => s + x.fuel, 0); const consumption = Number((generatorFuel + other).toFixed(2));
    return { generators, other, generatorFuel, consumption, closing: Number((num(draft.previousStock) + num(draft.incoming) - consumption).toFixed(2)) };
  }, [draft]);

  useEffect(() => { setDraft(x => x.previousStock === "" ? { ...x, previousStock: stock } : x); }, [stock]);
  const setG = (id, key, value) => setDraft(x => ({ ...x, generators: x.generators.map(g => g.id === id ? { ...g, [key]: value } : g) }));
  const setU = (i, key, value) => setDraft(x => ({ ...x, usage: x.usage.map((u, j) => j === i ? { ...u, [key]: value } : u) }));

  const save = async event => {
    event.preventDefault(); setSaving(true); setMessage("");
    if (!draft.date || draft.date > today()) { setMessage("Valid date is required."); setSaving(false); return; }
    if (calc.consumption <= 0 && num(draft.incoming) <= 0) { setMessage("Add generator runtime, other usage, or incoming fuel."); setSaving(false); return; }
    try {
      await addDoc(collection(db, "entries"), { userName: user?.name || user?.email || "Admin", userId: user?.uid || user?.id || "", date: draft.date, previousStock: num(draft.previousStock), incoming: num(draft.incoming), engines: calc.generators.map(x => ({ name: x.engine, duration: Number(x.h.toFixed(2)), fuel: x.fuel, kwh: num(x.kwh), startTime: x.startTime, loadPercent: Number(x.load.toFixed(1)), fuelRatePerHour: Number(rate(x.engine, x.load).toFixed(2)) })), other: draft.usage.filter(x => x.name || num(x.amount)).map(x => ({ name: x.name || "Other", amount: num(x.amount) })), engineFuel: calc.generatorFuel, otherTotal: calc.other, totalConsumption: calc.consumption, currentStock: calc.closing, stock: calc.closing, notes: draft.notes, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setMessage("Fuel entry saved successfully."); setDraft(newDraft(calc.closing)); setView("dashboard");
    } catch (err) { setMessage(err.message || "Could not save fuel entry."); } finally { setSaving(false); }
  };
  const remove = async id => { if (!window.confirm("Delete this fuel entry permanently?")) return; try { await deleteDoc(doc(db, "entries", id)); setMessage("Fuel entry deleted."); } catch (err) { setMessage(err.message || "Delete failed."); } };
  const exportCsv = () => { const rows = report.map(e => [e.date, e.userName || "", num(e.engineFuel).toFixed(2), num(e.incoming).toFixed(2), num(e.totalConsumption).toFixed(2), num(e.currentStock).toFixed(2)]); const csv = [["Date", "Recorded By", "Generator Fuel L", "Incoming L", "Consumption L", "Stock L"], ...rows].map(r => r.join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "fuel-report.csv"; a.click(); URL.revokeObjectURL(url); };

  return <div className="space-y-5">
    <div className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden">
      <div className="p-4 md:p-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Fuel size={22}/></div><div><h1 className="text-xl md:text-2xl font-black">Fuel Management</h1><p className="text-[9px] text-slate-500 uppercase tracking-[.2em]">Diesel • generator runtime • WAPDA • maintenance</p></div></div><div className="flex flex-wrap gap-2">{[["dashboard","Dashboard",LayoutDashboard],["entry","Fuel Entry",Plus],["wapda","WAPDA Report",Zap],["reports","Fuel Reports",FileText]].map(([id,text,Icon]) => <button key={id} onClick={() => setView(id)} className={view === id ? "px-4 py-2.5 rounded-xl text-xs font-black bg-yellow-500 text-black flex items-center gap-2" : "px-4 py-2.5 rounded-xl text-xs font-black bg-white/5 text-slate-300 flex items-center gap-2"}><Icon size={15}/>{text}</button>)}<button onClick={() => window.location.reload()} className="p-2.5 rounded-xl bg-white/5"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/></button></div></div>
      {message && <div className="mx-4 mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">{message}</div>}

      {view === "dashboard" && <div className="p-4 md:p-7 space-y-6"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-black">Fuel & Power Dashboard</h2><p className="text-slate-500 text-sm mt-1">Live diesel, generator runtime, WAPDA consumption and service alerts.</p></div><span className="text-[9px] uppercase tracking-widest text-green-400 font-black">{loading ? "SYNCING" : "FIRESTORE LIVE"}</span></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Stat title="Generator Fuel" value={totals.fuel.toFixed(2)} unit="L" tone="yellow" icon={Fuel}/><Stat title="Consumption" value={totals.consumption.toFixed(2)} unit="L" tone="orange" icon={Zap}/><Stat title="Incoming" value={totals.incoming.toFixed(2)} unit="L" tone="blue" icon={Plus}/><Stat title="Average / Entry" value={(report.length ? totals.fuel / report.length : 0).toFixed(2)} unit="L" icon={BarChart3}/><Stat title="Current Stock" value={stock.toFixed(2)} unit="L" tone={stock < 3000 ? "red" : "green"} icon={Fuel}/></div>
        <div className="rounded-[1.7rem] border border-blue-500/20 bg-blue-500/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[.2em] text-blue-400 font-black">WAPDA / GRID POWER</p><h3 className="text-lg font-black mt-1">Utility consumption overview</h3></div><button onClick={()=>setView("wapda")} className="px-4 py-2.5 rounded-xl bg-blue-500 text-white text-xs font-black">OPEN WAPDA REPORT</button></div><div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4"><Stat title="Today" value={wapdaToday.toFixed(2)} unit="KWH" tone="blue" icon={Zap}/><Stat title="This Month" value={wapdaMonth.toFixed(2)} unit="KWH" tone="orange" icon={CalendarDays}/><Stat title="Day Units" value={wapdaDay.toFixed(2)} unit="KWH" tone="yellow" icon={Zap}/><Stat title="Night Units" value={wapdaNight.toFixed(2)} unit="KWH" tone="green" icon={Zap}/><Stat title="Current Meter" value={num(wapdaLatest?.currentReading).toFixed(2)} unit="KWH" tone="white" icon={BarChart3}/><Stat title="Readings" value={wapdaRows.length} unit="ENTRIES" tone="white" icon={FileText}/></div></div>
        <div className="grid md:grid-cols-3 gap-4">{stats.map(e => { const A = e.alert.Icon; return <button key={e.key} disabled={!admin} onClick={() => admin && (window.location.href = "/fuel-engine/" + e.key)} className="text-left rounded-[1.7rem] border border-white/10 bg-[#020617] p-5 hover:border-yellow-500/50 transition disabled:cursor-default"><div className="flex justify-between"><div><p className="text-[9px] uppercase tracking-[.2em] text-yellow-500 font-black">Generator Engine</p><h3 className="text-xl font-black mt-1">{e.label}</h3><p className="text-xs text-slate-500 mt-1">{e.model}</p></div><ChevronRight size={18} className="text-slate-500"/></div><div className="grid grid-cols-2 gap-2 mt-5">{[["Total Running",e.total,"h"],["Today",e.today,"h"],["Previous Day",e.previous,"h"],["Total kWh",e.kwh,""]].map(([t,v,u]) => <div key={t} className="rounded-xl bg-white/[.03] p-3"><p className="text-[8px] uppercase text-slate-500 font-black">{t}</p><p className="text-lg font-black mt-1">{v.toFixed(2)}<span className="text-[9px] text-slate-500 ml-1">{u}</span></p></div>)}</div><div className="mt-4 flex justify-between items-center"><span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8px] font-black " + e.alert.cls}><A size={12}/>{e.alert.text}</span><span className="text-[8px] uppercase tracking-widest text-slate-500">Since service {e.since.toFixed(2)}h</span></div></button>; })}</div>
        <div className="grid lg:grid-cols-3 gap-5"><div className="lg:col-span-2 rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">Fuel / Consumption Trend</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={trend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Legend/><Line dataKey="consumption" stroke="#ef4444" strokeWidth={3}/><Line dataKey="incoming" stroke="#eab308" strokeWidth={2}/></LineChart></ResponsiveContainer></div><div className="rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">WAPDA Daily KWH</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={wapdaTrend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line type="monotone" dataKey="consumed" stroke="#3b82f6" strokeWidth={3}/></LineChart></ResponsiveContainer></div></div>
        <div className="rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">Generator Daily Runtime</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={runtime}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Legend/><Line dataKey="1400kva" stroke="#eab308" strokeWidth={3}/><Line dataKey="1020kva" stroke="#3b82f6" strokeWidth={2}/><Line dataKey="650kva" stroke="#22c55e" strokeWidth={2}/></LineChart></ResponsiveContainer></div>
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-300">Fuel chart logic remains active: 25%=0.05, 50%=0.10, 80%=0.16 and 100%=0.20 L/KVA/hour. kWh determines load and the rate is interpolated between chart points.</div></div>}

      {view === "entry" && <div className="p-4 md:p-7"><form onSubmit={save} className="max-w-6xl mx-auto space-y-5"><section className="rounded-[2rem] bg-white text-slate-900 p-5"><div className="grid md:grid-cols-4 gap-4"><div><label className={label}>Recorded By</label><input readOnly value={user?.name || user?.email || "Admin"} className={light}/></div><div><label className={label}>Date *</label><input required type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} className={light}/></div><div><label className={label}>Previous Stock</label><input type="number" value={draft.previousStock} onChange={e => setDraft({ ...draft, previousStock: e.target.value })} className={light}/></div><div><label className={label}>Incoming Fuel</label><input type="number" min="0" step=".01" value={draft.incoming} onChange={e => setDraft({ ...draft, incoming: e.target.value })} className={light}/></div></div></section><section className="rounded-[2rem] bg-white text-slate-900 p-5"><div className="flex justify-between"><div><h2 className="font-black">Generator Runtime</h2><p className="text-xs text-slate-500">Previous hours + current hours are used to calculate the run duration.</p></div><button type="button" onClick={() => setDraft(x => ({ ...x, generators: [...x.generators, newGen()] }))} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"><Plus size={15} className="inline mr-1"/>ADD GENERATOR</button></div><div className="space-y-3 mt-5">{draft.generators.map((x,i) => <div key={x.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3"><div><label className={label}>Generator</label><select value={x.engine} onChange={e => setG(x.id,"engine",e.target.value)} className={light}>{Object.entries(ENGINES).map(([k,c]) => <option key={k} value={k}>{c.label}</option>)}</select></div><div><label className={label}>Previous Hours</label><input value={x.previousHours} onChange={e => setG(x.id,"previousHours",e.target.value)} placeholder="0:00" className={light}/></div><div><label className={label}>Current Hours</label><input value={x.runHours} onChange={e => setG(x.id,"runHours",e.target.value)} placeholder="1:30" className={light}/></div><div><label className={label}>Start Time</label><input type="time" value={x.startTime} onChange={e => setG(x.id,"startTime",e.target.value)} className={light}/></div><div><label className={label}>kWh</label><input type="number" min="0" step=".01" value={x.kwh} onChange={e => setG(x.id,"kwh",e.target.value)} className={light}/></div><div><label className={label}>Fuel</label><div className="rounded-xl bg-green-50 border border-green-200 p-3 font-black text-green-800">{calc.generators[i]?.fuel.toFixed(2)} L</div></div></div><p className="text-[9px] text-slate-500 mt-3">Runtime {calc.generators[i]?.h.toFixed(2)}h · Load {calc.generators[i]?.load.toFixed(1)}% · Rate {rate(x.engine,calc.generators[i]?.load || 50).toFixed(2)} L/hr</p></div>)}</div></section><section className="rounded-[2rem] bg-white text-slate-900 p-5"><div className="flex justify-between"><h2 className="font-black">Other Fuel Usage</h2><button type="button" onClick={() => setDraft(x => ({ ...x, usage: [...x.usage, { name: "", amount: "" }] }))} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"><Plus size={15} className="inline mr-1"/>ADD USAGE</button></div>{draft.usage.map((x,i) => <div key={i} className="grid md:grid-cols-2 gap-2 mt-3"><select value={x.name} onChange={e => setU(i,"name",e.target.value)} className={light}><option value="">Select usage</option>{USAGE.map(v => <option key={v}>{v}</option>)}</select><input type="number" min="0" step=".01" value={x.amount} onChange={e => setU(i,"amount",e.target.value)} placeholder="Liters" className={light}/></div>)}</section><section className="rounded-[2rem] bg-slate-900 p-5"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat title="Generator Fuel" value={calc.generatorFuel.toFixed(2)} unit="L" tone="yellow" icon={Fuel}/><Stat title="Other Usage" value={calc.other.toFixed(2)} unit="L" icon={Fuel}/><Stat title="Consumption" value={calc.consumption.toFixed(2)} unit="L" tone="orange" icon={Zap}/><Stat title="Closing Stock" value={calc.closing.toFixed(2)} unit="L" tone={calc.closing < 3000 ? "red" : "green"} icon={Fuel}/></div><textarea rows="3" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Operational notes..." className="w-full mt-4 rounded-xl bg-white/5 border border-white/10 p-3 text-white"/><div className="flex justify-end mt-4"><button disabled={saving} className="px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">{saving ? "SAVING..." : "SAVE FUEL ENTRY"}</button></div></section></form></div>}

      {view === "wapda" && <div className="p-4 md:p-7"><WapdaManagement key="wapda" /></div>}
      {view === "reports" && <div className="p-4 md:p-7 space-y-5"><section className="rounded-[2rem] bg-[#020617] border border-white/5 p-5"><div className="flex flex-wrap gap-2 items-end"><select value={reportMode} onChange={e => setReportMode(e.target.value)} className={input + " w-auto"}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>{reportMode === "custom" ? <><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={input + " w-auto"}/><input type="date" value={to} onChange={e => setTo(e.target.value)} className={input + " w-auto"}/></> : <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className={input + " w-auto"}/>}<select value={engineFilter} onChange={e => setEngineFilter(e.target.value)} className={input + " w-auto"}><option value="all">All Generators</option>{Object.entries(ENGINES).map(([k,c]) => <option key={k} value={k}>{c.label}</option>)}</select><button onClick={exportCsv} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Download size={15} className="inline mr-1"/>CSV</button><button onClick={() => window.print()} className="px-4 py-3 rounded-xl bg-white/5 text-xs font-black"><Printer size={15} className="inline mr-1"/>PRINT</button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><Stat title="Consumption" value={totals.consumption.toFixed(2)} unit="L" tone="orange" icon={Fuel}/><Stat title="Generator Fuel" value={totals.fuel.toFixed(2)} unit="L" tone="yellow" icon={Zap}/><Stat title="Incoming" value={totals.incoming.toFixed(2)} unit="L" tone="blue" icon={Plus}/><Stat title="Runtime" value={totals.hours.toFixed(2)} unit="h" icon={CalendarDays}/></div></section><section className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[900px]"><thead><tr>{["Date","Recorded By","Generators","Fuel","Incoming","Consumption","Stock","Action"].map(h => <th key={h} className="p-3 text-left text-[9px] uppercase text-slate-500">{h}</th>)}</tr></thead><tbody>{report.map(e => <tr key={e.id} className="border-t border-white/5"><td className="p-3 text-xs">{e.date}</td><td className="p-3 text-xs text-slate-400">{e.userName || "—"}</td><td className="p-3 text-xs">{(e.engines || []).map(x => (ENGINES[x.name]?.label || x.name) + ": " + num(x.duration).toFixed(2) + "h").join(" · ")}</td><td className="p-3 text-xs text-yellow-400">{num(e.engineFuel).toFixed(2)} L</td><td className="p-3 text-xs text-blue-300">{num(e.incoming).toFixed(2)} L</td><td className="p-3 text-xs text-orange-400">{num(e.totalConsumption).toFixed(2)} L</td><td className="p-3 text-xs text-green-400">{num(e.currentStock).toFixed(2)} L</td><td className="p-3">{admin && <button onClick={() => remove(e.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400"><Trash2 size={14}/></button>}</td></tr>)}</tbody></table>{!report.length && <div className="p-12 text-center text-xs text-slate-600">No fuel records.</div>}</div></section></div>}
    </div>
  </div>;
}
