import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { Activity, AlertTriangle, BarChart3, CalendarDays, ChevronRight, Download, FileText, Fuel, LayoutDashboard, Plus, Printer, RefreshCw, Trash2, Wrench, Zap } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db } from "./firebase";
import { getUser } from "./utils/auth";
import WapdaManagement from "./WapdaManagement";

const ENGINES = {
  "1400kva": { label: "1400 KVA", ratedKVA: 1400, ratedKW: 1120 },
  "1020kva": { label: "1020 KVA", ratedKVA: 1020, ratedKW: 816 },
  "650kva": { label: "650 KVA", ratedKVA: 650, ratedKW: 520 }
};
const USAGE = ["Boiler", "CEO Home", "Lifter", "Machine", "Maintenance", "Other"];
const DRAFT_KEY = "powerhouse_fuel_entry_draft_v2";
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const today = () => new Date().toISOString().slice(0, 10);
const hours = v => {
  if (v === "" || v == null) return 0;
  const s = String(v).trim();
  if (s.includes(":")) {
    const [h = 0, m = 0] = s.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) + (Number.isFinite(m) ? m : 0) / 60;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const hhmm = v => {
  const mins = Math.max(0, Math.round(num(v) * 60));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
};
const ts = v => v?.toMillis?.() || (typeof v?.seconds === "number" ? v.seconds * 1000 : Date.parse(v) || 0);

/* User supplied fuel chart: 25%=0.05, 50%=0.10, 80%=0.16, 100%=0.20 L/KVA/hour. */
const fuelRate = (engine, load) => {
  const kva = ENGINES[engine]?.ratedKVA || 0;
  const p = Math.max(25, Math.min(100, num(load)));
  const pts = [[25, kva * .05], [50, kva * .10], [80, kva * .16], [100, kva * .20]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, av] = pts[i], [b, bv] = pts[i + 1];
    if (p <= b) return av + ((p - a) / (b - a)) * (bv - av);
  }
  return pts[3][1];
};
const calcFuel = (engine, runtime, kwh) => {
  const cfg = ENGINES[engine], h = Math.max(0, num(runtime));
  if (!cfg || h <= 0) return { fuel: 0, load: 0, rate: 0, estimated: false };
  const k = num(kwh), estimated = k <= 0;
  const load = estimated ? 50 : Math.max(25, Math.min(100, (k / (cfg.ratedKW * h)) * 100));
  const rate = fuelRate(engine, load);
  return { fuel: Number((rate * h).toFixed(2)), load, rate, estimated };
};
const newGen = engine => ({ id: `${Date.now()}-${Math.random()}`, engine, previousHours: "", currentHours: "", startTime: "", kwh: "" });
const blankDraft = stock => ({ date: today(), previousStock: stock ?? "", incoming: "", generators: [newGen("1400kva")], usage: [{ name: "", amount: "" }], notes: "" });
const loadDraft = () => {
  if (typeof window === "undefined") return blankDraft("");
  try {
    const x = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!x?.date) return blankDraft("");
    return { ...blankDraft(x.previousStock ?? ""), ...x, generators: (x.generators || []).map(g => ({ ...g, currentHours: g.currentHours ?? g.runHours ?? "", previousHours: g.previousHours ?? "" })) };
  } catch { return blankDraft(""); }
};

function Stat({ title, value, unit, tone = "white", icon: Icon }) {
  const c = { white: "text-white", yellow: "text-yellow-400", orange: "text-orange-400", blue: "text-blue-400", green: "text-green-400", red: "text-red-400" };
  return <div className="rounded-2xl border border-white/5 bg-[#020617] p-4"><div className="flex justify-between"><span className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</span>{Icon && <Icon size={16} className={c[tone]}/>}</div><div className={`mt-2 text-2xl font-black ${c[tone]}`}>{value}<small className="ml-1 text-[10px] text-slate-500">{unit}</small></div></div>;
}
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white";
const light = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900";
const label = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";

export default function FuelManagement() {
  const user = getUser();
  const admin = user?.role === "admin" || user?.role === "superadmin";
  const [view, setView] = useState("dashboard"), [entries, setEntries] = useState([]), [services, setServices] = useState([]), [wapdaRows, setWapdaRows] = useState([]);
  const [loading, setLoading] = useState(true), [message, setMessage] = useState(""), [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(loadDraft);
  const [reportMode, setReportMode] = useState("monthly"), [reportDate, setReportDate] = useState(today()), [from, setFrom] = useState(today()), [to, setTo] = useState(today()), [engineFilter, setEngineFilter] = useState("all");

  useEffect(() => {
    const a = onSnapshot(query(collection(db, "entries"), orderBy("createdAt", "asc")), s => { setEntries(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }, e => { setMessage(e.message || "Fuel data load failed."); setLoading(false); });
    const b = onSnapshot(collection(db, "engineServiceLogs"), s => setServices(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const c = onSnapshot(collection(db, "wapdaReadings"), s => setWapdaRows(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { a(); b(); c(); };
  }, []);

  const sorted = useMemo(() => [...entries].sort((a,b) => String(a.date || "").localeCompare(String(b.date || "")) || ts(a.createdAt) - ts(b.createdAt)), [entries]);
  const stock = sorted.length ? Math.max(0, num(sorted[sorted.length - 1].currentStock ?? sorted[sorted.length - 1].stock)) : 0;
  const previousMeter = (engine, date) => {
    const rows = sorted.filter(e => String(e.date || "") <= String(date || today())).flatMap(e => (e.engines || []).filter(x => x.name === engine).map(x => ({ ...x, date: e.date, createdAt: e.createdAt }))).sort((a,b) => String(a.date || "").localeCompare(String(b.date || "")) || ts(a.createdAt) - ts(b.createdAt));
    const last = rows[rows.length - 1];
    if (!last) return 0;
    if (last.currentHours !== "" && last.currentHours != null) return Math.max(0, hours(last.currentHours));
    return Math.max(0, rows.reduce((s,x) => s + num(x.duration), 0));
  };

  const wapda = useMemo(() => [...wapdaRows].sort((a,b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || ""))), [wapdaRows]);
  const latestWapda = wapda[wapda.length - 1];
  const wapdaToday = useMemo(() => wapda.filter(x => x.date === today()).reduce((s,x) => s + num(x.consumedKwh), 0), [wapda]);
  const wapdaMonth = useMemo(() => { const d = new Date(`${today()}T00:00:00`); const a = new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10), b = new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10); return wapda.filter(x => x.date >= a && x.date <= b).reduce((s,x) => s + num(x.consumedKwh), 0); }, [wapda]);
  const wapdaDay = useMemo(() => wapda.filter(x => x.date === today()).reduce((s,x) => s + num(x.dayUnits), 0), [wapda]);
  const wapdaNight = useMemo(() => wapda.filter(x => x.date === today()).reduce((s,x) => s + num(x.nightUnits), 0), [wapda]);

  const stats = useMemo(() => Object.entries(ENGINES).map(([key,cfg]) => {
    const rows = sorted.flatMap(e => (e.engines || []).filter(x => x.name === key).map(x => ({ ...x, date: e.date })));
    const total = rows.reduce((s,x) => s + num(x.duration),0), kwh = rows.reduce((s,x) => s + num(x.kwh),0);
    const d = new Date(); d.setDate(d.getDate()-1); const yd = d.toISOString().slice(0,10);
    const service = [...services].filter(x => x.engine === key).sort((a,b) => String(b.serviceDate || "").localeCompare(String(a.serviceDate || "")))[0];
    const since = Math.max(0,total-num(service?.engineHoursAtService));
    const alert = since >= 220 ? ["HIGH ALERT","text-red-300 border-red-500/40 bg-red-500/10",AlertTriangle] : since >= 200 ? ["SERVICE DUE","text-orange-300 border-orange-500/40 bg-orange-500/10",Wrench] : since >= 180 ? ["SERVICE WATCH","text-yellow-300 border-yellow-500/40 bg-yellow-500/10",AlertTriangle] : ["NORMAL","text-green-300 border-green-500/30 bg-green-500/10",Activity];
    return { key, ...cfg, total, kwh, today: rows.filter(x => x.date === today()).reduce((s,x)=>s+num(x.duration),0), previous: rows.filter(x=>x.date===yd).reduce((s,x)=>s+num(x.duration),0), since, alert };
  }), [sorted, services]);

  const report = useMemo(() => {
    let a = reportDate, b = reportDate, d = new Date(`${reportDate}T00:00:00`);
    if (reportMode === "monthly") { a = new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10); b = new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10); }
    if (reportMode === "weekly") { const s = new Date(d); s.setDate(d.getDate()-d.getDay()); const e = new Date(s); e.setDate(s.getDate()+6); a=s.toISOString().slice(0,10); b=e.toISOString().slice(0,10); }
    if (reportMode === "custom") { a=from; b=to; }
    return sorted.filter(e => String(e.date || "") >= a && String(e.date || "") <= b && (engineFilter === "all" || (e.engines || []).some(x => x.name === engineFilter)));
  }, [sorted,reportMode,reportDate,from,to,engineFilter]);

  const totals = useMemo(() => ({ fuel: report.reduce((s,e)=>s+(e.engines||[]).reduce((a,x)=>a+num(x.fuel),0),0), consumption: report.reduce((s,e)=>s+num(e.totalConsumption),0), incoming: report.reduce((s,e)=>s+num(e.incoming),0), other: report.reduce((s,e)=>s+num(e.otherTotal),0), hours: report.reduce((s,e)=>s+(e.engines||[]).reduce((a,x)=>a+num(x.duration),0),0) }), [report]);
  const byEngine = useMemo(() => Object.entries(ENGINES).map(([key,cfg]) => { const rows=report.flatMap(e=>(e.engines||[]).filter(x=>x.name===key)); return {key,label:cfg.label,hours:rows.reduce((s,x)=>s+num(x.duration),0),kwh:rows.reduce((s,x)=>s+num(x.kwh),0),fuel:rows.reduce((s,x)=>s+num(x.fuel),0)}; }), [report]);
  const trend = useMemo(() => { const g={}; report.forEach(e=>{if(!g[e.date])g[e.date]={date:e.date,consumption:0,incoming:0};g[e.date].consumption+=num(e.totalConsumption);g[e.date].incoming+=num(e.incoming);});return Object.values(g).slice(-31); }, [report]);
  const runtime = useMemo(() => { const g={};report.forEach(e=>(e.engines||[]).forEach(x=>{if(!g[e.date])g[e.date]={date:e.date,"1400kva":0,"1020kva":0,"650kva":0};g[e.date][x.name]+=num(x.duration);}));return Object.values(g).slice(-31); }, [report]);
  const wapdaTrend = useMemo(() => { const g={};wapda.slice(-31).forEach(x=>{if(!g[x.date])g[x.date]={date:x.date,consumed:0};g[x.date].consumed+=num(x.consumedKwh);});return Object.values(g); }, [wapda]);

  const calc = useMemo(() => {
    const generators=(draft.generators||[]).map(x=>{const previous=Math.max(0,hours(x.previousHours)),current=Math.max(0,hours(x.currentHours)),h=Math.max(0,current-previous);return {...x,previous,current,h,invalid:x.currentHours!==""&&current<previous,...calcFuel(x.engine,h,x.kwh)};});
    const other=(draft.usage||[]).reduce((s,x)=>s+Math.max(0,num(x.amount)),0),generatorFuel=generators.reduce((s,x)=>s+x.fuel,0),consumption=Number((generatorFuel+other).toFixed(2));
    const available=Math.max(0,num(draft.previousStock))+Math.max(0,num(draft.incoming)),rawClosing=Number((available-consumption).toFixed(2));
    return {generators,other,generatorFuel,consumption,available,rawClosing,closing:Math.max(0,rawClosing),stockDeficit:Math.max(0,Number((-rawClosing).toFixed(2))),invalidRuntime:generators.some(x=>x.invalid)};
  }, [draft]);

  useEffect(() => { try { localStorage.setItem(DRAFT_KEY,JSON.stringify(draft)); } catch {} }, [draft]);
  useEffect(() => { setDraft(x=>{let changed=false;const generators=(x.generators||[]).map(g=>{const p=hhmm(previousMeter(g.engine,x.date));if(g.previousHours!==p){changed=true;return {...g,previousHours:p};}return g;});return changed?{...x,generators}:x;}); }, [entries,draft.date]);
  useEffect(() => { setDraft(x=>x.previousStock===""?{...x,previousStock:stock}:x); }, [stock]);

  const setG=(id,key,value)=>setDraft(x=>({...x,generators:x.generators.map(g=>g.id===id?{...g,[key]:value}:g)}));
  const setEngine=(id,engine)=>setDraft(x=>({...x,generators:x.generators.map(g=>g.id===id?{...g,engine,previousHours:hhmm(previousMeter(engine,x.date)),currentHours:""}:g)}));
  const setU=(i,key,value)=>setDraft(x=>({...x,usage:x.usage.map((u,j)=>j===i?{...u,[key]:value}:u)}));
  const addGenerator=()=>setDraft(x=>{const used=new Set((x.generators||[]).map(g=>g.engine)),next=Object.keys(ENGINES).find(k=>!used.has(k));if(!next){setMessage("All three generators are already added.");return x;}return {...x,generators:[...x.generators,{...newGen(next),previousHours:hhmm(previousMeter(next,x.date))}]};});
  const removeGenerator=id=>setDraft(x=>({...x,generators:x.generators.length>1?x.generators.filter(g=>g.id!==id):x.generators}));

  const save=async e=>{
    e.preventDefault();setSaving(true);setMessage("");
    if(!draft.date||draft.date>today()){setMessage("Valid date is required.");setSaving(false);return;}
    if(num(draft.previousStock)<0||num(draft.incoming)<0){setMessage("Stock and incoming fuel cannot be negative.");setSaving(false);return;}
    if(calc.invalidRuntime){setMessage("Current running hours cannot be lower than previous running hours.");setSaving(false);return;}
    if(calc.stockDeficit>0){setMessage(`Insufficient diesel stock. Short by ${calc.stockDeficit.toFixed(2)} L. Entry was not saved.`);setSaving(false);return;}
    if(calc.consumption<=0&&num(draft.incoming)<=0){setMessage("Add generator runtime, other usage, or incoming fuel.");setSaving(false);return;}
    try{
      await addDoc(collection(db,"entries"),{userName:user?.name||user?.email||"Admin",userId:user?.uid||user?.id||"",date:draft.date,previousStock:num(draft.previousStock),incoming:num(draft.incoming),engines:calc.generators.map(x=>({name:x.engine,previousHours:Number(x.previous.toFixed(2)),currentHours:Number(x.current.toFixed(2)),previousHoursDisplay:hhmm(x.previous),currentHoursDisplay:hhmm(x.current),duration:Number(x.h.toFixed(2)),durationDisplay:hhmm(x.h),fuel:x.fuel,kwh:num(x.kwh),startTime:x.startTime||"",loadPercent:Number(x.load.toFixed(1)),fuelRatePerHour:Number(x.rate.toFixed(2)),fuelEstimated:x.estimated})),other:(draft.usage||[]).filter(x=>x.name||num(x.amount)).map(x=>({name:x.name||"Other",amount:Math.max(0,num(x.amount))})),engineFuel:calc.generatorFuel,otherTotal:calc.other,totalConsumption:calc.consumption,currentStock:calc.closing,stock:calc.closing,stockDeficit:0,notes:draft.notes||"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      localStorage.removeItem(DRAFT_KEY);setMessage("Fuel entry saved successfully.");setDraft(blankDraft(calc.closing));setView("dashboard");
    }catch(err){setMessage(err.message||"Could not save fuel entry.");}finally{setSaving(false);}
  };
  const remove=async id=>{if(!admin||!window.confirm("Delete this fuel entry permanently?"))return;try{await deleteDoc(doc(db,"entries",id));setMessage("Fuel entry deleted.");}catch(err){setMessage(err.message||"Delete failed.");}};
  const exportCsv=()=>{const rows=report.flatMap(e=>(e.engines||[]).map(x=>[e.date,e.userName||"",ENGINES[x.name]?.label||x.name,x.previousHoursDisplay||hhmm(x.previousHours),x.currentHoursDisplay||hhmm(x.currentHours),x.durationDisplay||hhmm(x.duration),num(x.kwh).toFixed(2),num(x.loadPercent).toFixed(1),num(x.fuel).toFixed(2),num(e.incoming).toFixed(2),num(e.otherTotal).toFixed(2),num(e.totalConsumption).toFixed(2),num(e.currentStock).toFixed(2)]));const head=["Date","Recorded By","Generator","Previous Hours","Current Hours","Runtime","KWH","Load %","Generator Fuel L","Incoming L","Other Usage L","Total Consumption L","Closing Stock L"];const csv=[head,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`fuel-report-${reportDate}.csv`;a.click();URL.revokeObjectURL(url);};

  return <div className="space-y-5"><div className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden">
    <div className="p-4 md:p-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Fuel size={22}/></div><div><h1 className="text-xl md:text-2xl font-black">Fuel Management</h1><p className="text-[9px] text-slate-500 uppercase tracking-[.2em]">Diesel • generator runtime • WAPDA • reports</p></div></div><div className="flex flex-wrap gap-2">{[["dashboard","Dashboard",LayoutDashboard],["entry","Fuel Entry",Plus],["wapda","WAPDA Report",Zap],["reports","Fuel Reports",FileText]].map(([id,t,Icon])=><button key={id} onClick={()=>setView(id)} className={view===id?"px-4 py-2.5 rounded-xl text-xs font-black bg-yellow-500 text-black flex items-center gap-2":"px-4 py-2.5 rounded-xl text-xs font-black bg-white/5 text-slate-300 flex items-center gap-2"}><Icon size={15}/>{t}</button>)}<button onClick={()=>window.location.reload()} className="p-2.5 rounded-xl bg-white/5"><RefreshCw size={15} className={loading?"animate-spin":""}/></button></div></div>
    {message&&<div className="mx-4 mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">{message}</div>}

    {view==="dashboard"&&<div className="p-4 md:p-7 space-y-6"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-black">Fuel & Power Dashboard</h2><p className="text-slate-500 text-sm mt-1">Live diesel, generator runtime, WAPDA consumption and service alerts.</p></div><span className="text-[9px] uppercase tracking-widest text-green-400 font-black">{loading?"SYNCING":"FIRESTORE LIVE"}</span></div><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Stat title="Generator Fuel" value={totals.fuel.toFixed(2)} unit="L" tone="yellow" icon={Fuel}/><Stat title="Consumption" value={totals.consumption.toFixed(2)} unit="L" tone="orange" icon={Zap}/><Stat title="Incoming" value={totals.incoming.toFixed(2)} unit="L" tone="blue" icon={Plus}/><Stat title="Other Usage" value={totals.other.toFixed(2)} unit="L" icon={BarChart3}/><Stat title="Current Stock" value={stock.toFixed(2)} unit="L" tone={stock<3000?"red":"green"} icon={Fuel}/></div>
      <div className="rounded-[1.7rem] border border-blue-500/20 bg-blue-500/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[.2em] text-blue-400 font-black">WAPDA / GRID POWER</p><h3 className="text-lg font-black mt-1">Utility consumption overview</h3></div><button onClick={()=>setView("wapda")} className="px-4 py-2.5 rounded-xl bg-blue-500 text-white text-xs font-black">OPEN WAPDA REPORT</button></div><div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4"><Stat title="Today" value={wapdaToday.toFixed(2)} unit="KWH" tone="blue" icon={Zap}/><Stat title="This Month" value={wapdaMonth.toFixed(2)} unit="KWH" tone="orange" icon={CalendarDays}/><Stat title="Day Units" value={wapdaDay.toFixed(2)} unit="KWH" tone="yellow" icon={Zap}/><Stat title="Night Units" value={wapdaNight.toFixed(2)} unit="KWH" tone="green" icon={Zap}/><Stat title="Current Meter" value={num(latestWapda?.currentReading).toFixed(2)} unit="KWH" icon={BarChart3}/><Stat title="Readings" value={wapdaRows.length} unit="ENTRIES" icon={FileText}/></div></div>
      <div className="grid md:grid-cols-3 gap-4">{stats.map(e=>{const [txt,cls,I]=e.alert;return <button key={e.key} disabled={!admin} onClick={()=>admin&&(window.location.href="/fuel-engine/"+e.key)} className="text-left rounded-[1.7rem] border border-white/10 bg-[#020617] p-5 hover:border-yellow-500/50 transition disabled:cursor-default"><div className="flex justify-between"><div><p className="text-[9px] uppercase tracking-[.2em] text-yellow-500 font-black">Generator Engine</p><h3 className="text-xl font-black mt-1">{e.label}</h3><p className="text-xs text-slate-500 mt-1">{e.ratedKVA} KVA Generator</p></div><ChevronRight size={18} className="text-slate-500"/></div><div className="grid grid-cols-2 gap-2 mt-5">{[["Total Running",e.total,"h"],["Today",e.today,"h"],["Previous Day",e.previous,"h"],["Total kWh",e.kwh,""]].map(([t,v,u])=><div key={t} className="rounded-xl bg-white/[.03] p-3"><p className="text-[8px] uppercase text-slate-500 font-black">{t}</p><p className="text-lg font-black mt-1">{v.toFixed(2)}<span className="text-[9px] text-slate-500 ml-1">{u}</span></p></div>)}</div><div className="mt-4 flex justify-between items-center"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8px] font-black ${cls}`}><I size={12}/>{txt}</span><span className="text-[8px] uppercase tracking-widest text-slate-500">Since service {e.since.toFixed(2)}h</span></div></button>})}</div>
      <div className="grid lg:grid-cols-3 gap-5"><div className="lg:col-span-2 rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">Fuel / Consumption Trend</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={trend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Legend/><Line dataKey="consumption" stroke="#ef4444" strokeWidth={3}/><Line dataKey="incoming" stroke="#eab308" strokeWidth={2}/></LineChart></ResponsiveContainer></div><div className="rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">WAPDA Daily KWH</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={wapdaTrend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="consumed" stroke="#3b82f6" strokeWidth={3}/></LineChart></ResponsiveContainer></div></div>
      <div className="rounded-2xl bg-white p-4 h-80"><h3 className="text-slate-900 font-black">Generator Daily Runtime</h3><ResponsiveContainer width="100%" height="90%"><LineChart data={runtime}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Legend/><Line dataKey="1400kva" stroke="#eab308" strokeWidth={3}/><Line dataKey="1020kva" stroke="#3b82f6" strokeWidth={2}/><Line dataKey="650kva" stroke="#22c55e" strokeWidth={2}/></LineChart></ResponsiveContainer></div><div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-300">Fuel calculation: 25%=0.05, 50%=0.10, 80%=0.16 and 100%=0.20 L/KVA/hour. KWH determines load and the rate is interpolated between chart points.</div></div>}

    {view==="entry"&&<div className="p-4 md:p-7"><form onSubmit={save} className="max-w-6xl mx-auto space-y-5"><section className="rounded-[2rem] bg-white text-slate-900 p-5"><div className="grid md:grid-cols-4 gap-4"><div><label className={label}>Recorded By</label><input readOnly value={user?.name||user?.email||"Admin"} className={light}/></div><div><label className={label}>Date *</label><input required type="date" max={today()} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})} className={light}/></div><div><label className={label}>Previous Stock</label><input type="number" min="0" step=".01" value={draft.previousStock} onChange={e=>setDraft({...draft,previousStock:e.target.value})} className={light}/></div><div><label className={label}>Incoming Fuel</label><input type="number" min="0" step=".01" value={draft.incoming} onChange={e=>setDraft({...draft,incoming:e.target.value})} className={light}/></div></div></section>
      <section className="rounded-[2rem] bg-white text-slate-900 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-black">Generator Runtime</h2><p className="text-xs text-slate-500 mt-1">Previous running hours are automatic. Enter current meter hours; duration is calculated automatically.</p></div><button type="button" onClick={addGenerator} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"><Plus size={15} className="inline mr-1"/>ADD GENERATOR</button></div><div className="space-y-3 mt-5">{draft.generators.map((x,i)=><div key={x.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3"><div><label className={label}>Generator</label><select value={x.engine} onChange={e=>setEngine(x.id,e.target.value)} className={light}>{Object.entries(ENGINES).map(([k,c])=><option key={k} value={k}>{c.label}</option>)}</select></div><div><label className={label}>Previous Hours Auto</label><input readOnly value={x.previousHours||"0:00"} className={`${light} bg-slate-200`}/></div><div><label className={label}>Current Hours / Meter *</label><input required value={x.currentHours} onChange={e=>setG(x.id,"currentHours",e.target.value)} placeholder="e.g. 130:30" className={light}/></div><div><label className={label}>Calculated Runtime</label><div className={`rounded-xl border p-3 font-black ${calc.generators[i]?.invalid?"bg-red-50 border-red-200 text-red-700":"bg-blue-50 border-blue-200 text-blue-800"}`}>{calc.generators[i]?.invalid?"INVALID":hhmm(calc.generators[i]?.h)}</div></div><div><label className={label}>Start Time</label><input type="time" value={x.startTime} onChange={e=>setG(x.id,"startTime",e.target.value)} className={light}/></div><div><label className={label}>KWH</label><input type="number" min="0" step=".01" value={x.kwh} onChange={e=>setG(x.id,"kwh",e.target.value)} className={light}/></div><div><label className={label}>Fuel</label><div className="rounded-xl bg-green-50 border border-green-200 p-3 font-black text-green-800">{calc.generators[i]?.fuel.toFixed(2)} L</div></div></div><div className="mt-3 flex flex-wrap justify-between gap-2"><p className="text-[9px] text-slate-500">Runtime <b>{hhmm(calc.generators[i]?.h)}</b> · Load <b>{calc.generators[i]?.load.toFixed(1)}%</b> · Rate <b>{calc.generators[i]?.rate.toFixed(2)} L/hr</b>{calc.generators[i]?.estimated?" · 50% estimated because KWH is blank":""}</p>{draft.generators.length>1&&<button type="button" onClick={()=>removeGenerator(x.id)} className="text-red-500 text-[9px] font-black uppercase"><Trash2 size={13} className="inline mr-1"/>Remove</button>}</div></div>)}</div></section>
      <section className="rounded-[2rem] bg-white text-slate-900 p-5"><div className="flex justify-between"><h2 className="font-black">Other Fuel Usage</h2><button type="button" onClick={()=>setDraft(x=>({...x,usage:[...x.usage,{name:"",amount:""}]}))} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"><Plus size={15} className="inline mr-1"/>ADD USAGE</button></div>{(draft.usage||[]).map((x,i)=><div key={i} className="grid md:grid-cols-2 gap-2 mt-3"><select value={x.name} onChange={e=>setU(i,"name",e.target.value)} className={light}><option value="">Select usage</option>{USAGE.map(v=><option key={v}>{v}</option>)}</select><input type="number" min="0" step=".01" value={x.amount} onChange={e=>setU(i,"amount",e.target.value)} placeholder="Liters" className={light}/></div>)}</section>
      <section className="rounded-[2rem] bg-slate-900 p-5"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat title="Generator Fuel" value={calc.generatorFuel.toFixed(2)} unit="L" tone="yellow" icon={Fuel}/><Stat title="Other Usage" value={calc.other.toFixed(2)} unit="L" icon={Fuel}/><Stat title="Consumption" value={calc.consumption.toFixed(2)} unit="L" tone="orange" icon={Zap}/><Stat title="Closing Stock" value={calc.closing.toFixed(2)} unit="L" tone={calc.stockDeficit>0?"red":calc.closing<3000?"red":"green"} icon={Fuel}/></div>{calc.stockDeficit>0&&<div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-black text-red-300">STOCK ERROR: insufficient diesel by {calc.stockDeficit.toFixed(2)} L. Saving is blocked.</div>}<textarea rows="3" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Operational notes..." className="w-full mt-4 rounded-xl bg-white/5 border border-white/10 p-3 text-white"/><div className="flex justify-end gap-3 mt-4"><span className="self-center text-[9px] text-slate-500">Draft auto-saves on this device.</span><button disabled={saving||calc.stockDeficit>0||calc.invalidRuntime} className="px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black disabled:opacity-40">{saving?"SAVING...":"SAVE FUEL ENTRY"}</button></div></section></form></div>}

    {view==="wapda"&&<div className="p-4 md:p-7"><WapdaManagement key="wapda"/></div>}

    {view==="reports"&&<div className="p-4 md:p-7 space-y-5"><section className="rounded-[2rem] bg-[#020617] border border-white/5 p-5"><div className="flex flex-wrap gap-2 items-end"><div><label className={label}>Period</label><select value={reportMode} onChange={e=>setReportMode(e.target.value)} className={`${input} w-auto`}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select></div>{reportMode==="custom"?<><div><label className={label}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={`${input} w-auto`}/></div><div><label className={label}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} className={`${input} w-auto`}/></div></>:<div><label className={label}>Date</label><input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} className={`${input} w-auto`}/></div>}<div><label className={label}>Generator</label><select value={engineFilter} onChange={e=>setEngineFilter(e.target.value)} className={`${input} w-auto`}><option value="all">All Generators</option>{Object.entries(ENGINES).map(([k,c])=><option key={k} value={k}>{c.label}</option>)}</select></div><button onClick={exportCsv} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Download size={15} className="inline mr-1"/>CSV</button><button onClick={()=>window.print()} className="px-4 py-3 rounded-xl bg-white/5 text-xs font-black"><Printer size={15} className="inline mr-1"/>PRINT</button></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5"><Stat title="Consumption" value={totals.consumption.toFixed(2)} unit="L" tone="orange" icon={Fuel}/><Stat title="Generator Fuel" value={totals.fuel.toFixed(2)} unit="L" tone="yellow" icon={Zap}/><Stat title="Other Usage" value={totals.other.toFixed(2)} unit="L" icon={Fuel}/><Stat title="Incoming" value={totals.incoming.toFixed(2)} unit="L" tone="blue" icon={Plus}/><Stat title="Runtime" value={hhmm(totals.hours)} unit="" icon={CalendarDays}/></div></section>
      <section className="grid md:grid-cols-3 gap-3">{byEngine.map(x=><div key={x.key} className="rounded-2xl border border-white/5 bg-[#020617] p-4"><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">{x.label}</p><div className="grid grid-cols-3 gap-2 mt-3"><div><p className="text-[8px] text-slate-500">Runtime</p><p className="font-black">{hhmm(x.hours)}</p></div><div><p className="text-[8px] text-slate-500">KWH</p><p className="font-black">{x.kwh.toFixed(0)}</p></div><div><p className="text-[8px] text-slate-500">Fuel</p><p className="font-black text-yellow-400">{x.fuel.toFixed(2)} L</p></div></div></div>)}</section>
      <section className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden"><div className="px-5 py-4 border-b border-white/5"><h2 className="text-white font-black text-sm uppercase">Fuel Consumption Report</h2><p className="text-slate-500 text-[10px] mt-1">Runtime, fuel, incoming, other usage, consumption and closing stock.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1250px]"><thead><tr>{["Date","Recorded By","Generators","Runtime","Fuel","Incoming","Other","Consumption","Closing Stock","Action"].map(h=><th key={h} className="p-3 text-left text-[9px] uppercase text-slate-500">{h}</th>)}</tr></thead><tbody>{report.map(e=><tr key={e.id} className="border-t border-white/5"><td className="p-3 text-xs">{e.date}</td><td className="p-3 text-xs text-slate-400">{e.userName||"—"}</td><td className="p-3 text-xs">{(e.engines||[]).map(x=>`${ENGINES[x.name]?.label||x.name}: ${x.durationDisplay||hhmm(x.duration)}`).join(" · ")}</td><td className="p-3 text-xs">{hhmm((e.engines||[]).reduce((s,x)=>s+num(x.duration),0))}</td><td className="p-3 text-xs text-yellow-400">{num(e.engineFuel).toFixed(2)} L</td><td className="p-3 text-xs text-blue-300">{num(e.incoming).toFixed(2)} L</td><td className="p-3 text-xs">{num(e.otherTotal).toFixed(2)} L</td><td className="p-3 text-xs text-orange-400">{num(e.totalConsumption).toFixed(2)} L</td><td className="p-3 text-xs text-green-400">{Math.max(0,num(e.currentStock)).toFixed(2)} L</td><td className="p-3">{admin&&<button onClick={()=>remove(e.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400"><Trash2 size={14}/></button>}</td></tr>)}</tbody></table>{!report.length&&<div className="p-12 text-center text-xs text-slate-600">No fuel records for this period.</div>}</div></section></div>}
  </div></div>;
}
