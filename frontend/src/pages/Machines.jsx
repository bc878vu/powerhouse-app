import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, CalendarClock, Cpu, Gauge, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Wrench, Zap, X, Save, MapPin, Factory, Hash, Timer, TrendingUp } from "lucide-react";
import { addMachineLoadLog, deleteMachine, subscribeToMachineLoadLogs, subscribeToMachines } from "../services/machineService";

const STATUS = {
  running: { label: "Running", icon: Zap, cls: "text-green-400 bg-green-500/10 border-green-500/20" },
  standby: { label: "Standby", icon: Activity, cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  stopped: { label: "Stopped", icon: Gauge, cls: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  maintenance: { label: "Maintenance", icon: Wrench, cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  out_of_service: { label: "Out of Service", icon: AlertTriangle, cls: "text-red-400 bg-red-500/10 border-red-500/20" }
};

const isMaintenanceDue = (date) => {
  if (!date) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  return !Number.isNaN(due.getTime()) && due <= today;
};

const toDateKey = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10);
const rangeFor = (period, selected) => {
  const d = new Date(`${selected}T00:00:00`);
  if (Number.isNaN(d.getTime())) return [selected, selected];
  if (period === "daily") return [selected, selected];
  if (period === "monthly") return [new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10), new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10)];
  const day = d.getDay(); const start = new Date(d); start.setDate(d.getDate() - day); const end = new Date(start); end.setDate(start.getDate() + 6);
  return [toDateKey(start), toDateKey(end)];
};

const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500/60";

export default function Machines() {
  const navigate = useNavigate();
  const [machines, setMachines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [period, setPeriod] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [logMachine, setLogMachine] = useState(null);
  const [logForm, setLogForm] = useState({ date: toDateKey(new Date()), actualLoad: "", peakLoad: "", operatingHours: "", note: "" });
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToMachines((items) => { setMachines(items); setLoading(false); }, (e) => { setMessage(e.message || "Unable to load machines."); setLoading(false); });
    const unsubLogs = subscribeToMachineLoadLogs(setLogs, (e) => setMessage(e.message || "Unable to load machine load history."));
    const unsubCats = subscribeToMachineLoadLogs ? undefined : undefined;
    return () => { unsub?.(); unsubLogs?.(); unsubCats?.(); };
  }, [refreshKey]);

  const allCategories = useMemo(() => [...new Set([...categories.map(c => c.name), ...machines.map(m => m.category)].filter(Boolean))].sort(), [categories, machines]);
  const [catUnsub, setCatUnsub] = useState(null);
  useEffect(() => { return () => catUnsub?.(); }, [catUnsub]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return machines.filter((m) => {
      const text = [m.name,m.code,m.category,m.type,m.manufacturer,m.model,m.serialNumber,m.location,m.department].filter(Boolean).join(" ").toLowerCase();
      return (statusFilter === "all" || (m.status || "standby") === statusFilter) && (categoryFilter === "all" || m.category === categoryFilter) && (!term || text.includes(term));
    });
  }, [machines, search, statusFilter, categoryFilter]);

  const [from, to] = rangeFor(period, selectedDate);
  const periodLogs = useMemo(() => logs.filter(l => String(l.date || "") >= from && String(l.date || "") <= to), [logs, from, to]);
  const machineConsumption = useMemo(() => {
    const map = {};
    periodLogs.forEach(l => { const id = l.machineId; map[id] = (map[id] || 0) + (Number(l.energyConsumed) || Number(l.actualLoad || 0) * Number(l.operatingHours || 0)); });
    return map;
  }, [periodLogs]);

  const stats = useMemo(() => {
    const rated = machines.reduce((s,m) => s + (Number(m.capacity)||0), 0);
    const running = machines.reduce((s,m) => s + (m.status === "running" ? Number(m.currentRunningLoad)||0 : 0), 0);
    const actual = machines.reduce((s,m) => s + (Number(m.currentRunningLoad)||0), 0);
    const consumed = periodLogs.reduce((s,l) => s + (Number(l.energyConsumed) || Number(l.actualLoad||0)*Number(l.operatingHours||0)), 0);
    return { total: machines.length, running: machines.filter(m=>m.status==="running").length, standby: machines.filter(m=>m.status==="standby").length, maintenance: machines.filter(m=>m.status==="maintenance").length, out: machines.filter(m=>m.status==="out_of_service").length, due: machines.filter(m=>isMaintenanceDue(m.nextMaintenance)).length, rated, running, actual, consumed, utilization: rated ? (running/rated)*100 : 0 };
  }, [machines, periodLogs]);

  const openLog = (machine) => { setLogMachine(machine); setLogForm({ date: selectedDate, actualLoad: machine.currentRunningLoad || "", peakLoad: "", operatingHours: "", note: "" }); };
  const saveLog = async (e) => {
    e.preventDefault(); setSavingLog(true); setMessage("");
    try { await addMachineLoadLog({ ...logForm, machineId: logMachine.id, machineName: logMachine.name, machineCode: logMachine.code }); setLogMachine(null); setMessage("Machine load record saved successfully."); }
    catch (err) { setMessage(err.message || "Could not save load record."); } finally { setSavingLog(false); }
  };
  const remove = async (machine) => {
    if (!window.confirm(`Delete ${machine.name || machine.code}? This machine record will be permanently removed.`)) return;
    setDeleting(machine.id); try { await deleteMachine(machine.id); } catch (e) { setMessage(e.message || "Could not delete machine."); } finally { setDeleting(null); }
  };

  const statCards = [["Total Machines",stats.total,Cpu,"text-yellow-400"],["Running",stats.running,Zap,"text-green-400"],["Standby",stats.standby,Activity,"text-blue-400"],["Maintenance",stats.maintenance,Wrench,"text-yellow-400"],["Out of Service",stats.out,AlertTriangle,"text-red-400"],["Maintenance Due",stats.due,CalendarClock,"text-orange-400"]];

  return <div className="space-y-6 animate-in fade-in duration-500">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div className="flex items-center gap-4"><div className="w-12 h-12 bg-yellow-500 rounded-2xl flex items-center justify-center text-black"><Cpu size={24}/></div><div><h1 className="text-2xl md:text-3xl font-black text-white">Machines Dashboard</h1><p className="text-slate-500 text-sm mt-1">Complete machine register, live load, utilization, energy consumption and maintenance control</p></div></div>
      <div className="flex gap-2"><button onClick={()=>setRefreshKey(k=>k+1)} className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-300" title="Refresh"><RefreshCw size={18} className={loading?"animate-spin":""}/></button><button onClick={()=>navigate("/machines/add")} className="flex items-center gap-2 px-5 py-3 bg-yellow-500 text-black rounded-xl text-xs font-black uppercase"><Plus size={17}/> Add Machine</button></div>
    </div>
    {message && <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 font-bold text-sm">{message}</div>}

    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{statCards.map(([label,value,Icon,color])=><button key={label} onClick={()=>label.includes("Total")||label.includes("Due")?setStatusFilter("all"):setStatusFilter(label.toLowerCase().replaceAll(" ","_"))} className="text-left rounded-2xl border border-white/5 bg-[#020617] p-4 hover:bg-white/[0.03]"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{label}</p><p className={`mt-2 text-2xl md:text-3xl font-black ${color}`}>{value}</p><Icon size={16} className={`mt-2 ${color}`}/></button>)}</div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="rounded-2xl border border-white/5 bg-[#020617] p-5"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Total Rated / Installed Load</p><p className="text-2xl font-black text-white mt-2">{stats.rated.toLocaleString()} <span className="text-xs text-slate-500">kW</span></p><p className="text-[10px] text-slate-600 mt-1">Calculated from all machine capacities.</p></div>
      <div className="rounded-2xl border border-green-500/10 bg-green-500/[0.03] p-5"><p className="text-[9px] uppercase tracking-widest text-green-400 font-black">Running Load</p><p className="text-2xl font-black text-white mt-2">{stats.running.toLocaleString()} <span className="text-xs text-slate-500">kW</span></p><p className="text-[10px] text-slate-600 mt-1">Sum of actual load for running machines.</p></div>
      <div className="rounded-2xl border border-yellow-500/10 bg-yellow-500/[0.03] p-5"><p className="text-[9px] uppercase tracking-widest text-yellow-400 font-black">Actual Registered Running Load</p><p className="text-2xl font-black text-white mt-2">{stats.actual.toLocaleString()} <span className="text-xs text-slate-500">kW</span></p><p className="text-[10px] text-slate-600 mt-1">All machine current-load values combined.</p></div>
      <div className="rounded-2xl border border-blue-500/10 bg-blue-500/[0.03] p-5"><p className="text-[9px] uppercase tracking-widest text-blue-400 font-black">Utilization</p><p className="text-2xl font-black text-white mt-2">{stats.utilization.toFixed(1)}%</p><p className="text-[10px] text-slate-600 mt-1">Current running load ÷ rated load.</p></div>
    </div>

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4"><div><div className="flex items-center gap-2"><BarChart3 size={18} className="text-yellow-500"/><h2 className="text-white font-black">Load & Energy Analytics</h2></div><p className="text-slate-500 text-xs mt-1">Daily, weekly and monthly consumption for each machine and the complete plant.</p></div><div className="flex flex-wrap gap-2"><select value={period} onChange={e=>setPeriod(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"/></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div className="bg-white/[0.03] rounded-xl p-4"><p className="text-[9px] text-slate-500 uppercase font-black">Period</p><p className="text-white font-black mt-1">{period[0].toUpperCase()+period.slice(1)}</p><p className="text-[9px] text-slate-600 mt-1">{from} → {to}</p></div><div className="bg-white/[0.03] rounded-xl p-4"><p className="text-[9px] text-slate-500 uppercase font-black">Total Energy Consumed</p><p className="text-yellow-400 text-xl font-black mt-1">{stats.consumed.toLocaleString()} <span className="text-xs">kWh</span></p></div><div className="bg-white/[0.03] rounded-xl p-4"><p className="text-[9px] text-slate-500 uppercase font-black">Load Records</p><p className="text-white text-xl font-black mt-1">{periodLogs.length}</p></div><div className="bg-white/[0.03] rounded-xl p-4"><p className="text-[9px] text-slate-500 uppercase font-black">Avg Logged Load</p><p className="text-white text-xl font-black mt-1">{periodLogs.length ? (periodLogs.reduce((s,l)=>s+(Number(l.actualLoad)||0),0)/periodLogs.length).toFixed(1) : "0"} <span className="text-xs text-slate-500">kW</span></p></div></div>
      <div className="overflow-x-auto mt-5"><table className="w-full min-w-[850px]"><thead><tr className="border-b border-white/5">{["Machine","Location","Rated Load","Current Load","Period Energy","Hours","Peak Load"].map(h=><th key={h} className="text-left px-4 py-3 text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{machines.map(m=>{const ml=periodLogs.filter(l=>l.machineId===m.id);const hours=ml.reduce((s,l)=>s+(Number(l.operatingHours)||0),0);const peak=ml.reduce((s,l)=>Math.max(s,Number(l.peakLoad)||Number(l.actualLoad)||0),0);return <tr key={m.id} className="border-b border-white/[0.04]"><td className="px-4 py-3"><p className="text-white text-xs font-black">{m.name}</p><p className="text-yellow-500 text-[9px]">{m.code}</p></td><td className="px-4 py-3 text-xs text-slate-400">{m.location||"—"}</td><td className="px-4 py-3 text-xs font-bold text-white">{Number(m.capacity||0).toLocaleString()} kW</td><td className="px-4 py-3 text-xs font-bold text-green-400">{Number(m.currentRunningLoad||0).toLocaleString()} kW</td><td className="px-4 py-3 text-xs font-bold text-yellow-400">{(machineConsumption[m.id]||0).toLocaleString()} kWh</td><td className="px-4 py-3 text-xs text-slate-300">{hours.toFixed(1)} h</td><td className="px-4 py-3 text-xs text-orange-400">{peak.toLocaleString()} kW</td></tr>})}</tbody></table></div>
    </section>

    <div className="rounded-2xl border border-white/5 bg-[#020617] p-4 flex flex-col lg:flex-row gap-3"><div className="relative flex-1"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search machine, code, manufacturer, location, serial..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white outline-none"/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"><option value="all">All Statuses</option>{Object.entries(STATUS).map(([v,x])=><option key={v} value={v}>{x.label}</option>)}</select><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"><option value="all">All Categories</option>{allCategories.map(c=><option key={c} value={c}>{c}</option>)}</select></div>

    <div className="rounded-[2rem] overflow-hidden border border-white/5 bg-[#020617]"><div className="px-5 py-4 border-b border-white/5 flex items-center justify-between"><div><h2 className="text-white font-black text-sm uppercase">All Machines</h2><p className="text-slate-500 text-[10px] mt-1">Showing {filtered.length} of {machines.length} registered machines</p></div><span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">Firestore Live</span></div>{loading?<div className="min-h-[300px] flex items-center justify-center"><Loader2 size={30} className="animate-spin text-yellow-500"/></div>:filtered.length===0?<div className="min-h-[300px] flex flex-col items-center justify-center gap-3 text-slate-500"><Cpu size={36}/><p className="font-black text-xs uppercase">No machines found</p><button onClick={()=>navigate("/machines/add")} className="text-yellow-500 text-xs font-black uppercase">Add your first machine</button></div>:<div className="overflow-x-auto"><table className="w-full min-w-[1250px]"><thead><tr className="border-b border-white/5">{["Machine","Category / Type","Location / Area","Rated Load","Running Load","Period Consumption","Status","Maintenance","Actions"].map(h=><th key={h} className="text-left px-5 py-4 text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{filtered.map(machine=>{const cfg=STATUS[machine.status]||STATUS.standby;const Icon=cfg.icon;const due=isMaintenanceDue(machine.nextMaintenance);return <React.Fragment key={machine.id}><tr className="border-b border-white/[0.04] hover:bg-white/[0.025]"><td className="px-5 py-4"><button onClick={()=>setExpanded(expanded===machine.id?null:machine.id)} className="text-left"><p className="text-white text-sm font-black">{machine.name||"Unnamed Machine"}</p><p className="text-yellow-500 text-[10px] font-black mt-1">{machine.code||"No code"}</p><p className="text-slate-600 text-[10px] mt-1">{machine.manufacturer||""} {machine.model||""}</p></button></td><td className="px-5 py-4"><p className="text-white text-xs">{machine.category||"General"}</p><p className="text-slate-500 text-[10px] mt-1">{machine.type||"No type"}</p></td><td className="px-5 py-4"><p className="text-white text-xs">{machine.location||"No area"}</p><p className="text-slate-500 text-[10px] mt-1">{machine.department||""}</p></td><td className="px-5 py-4 text-xs text-white font-bold">{Number(machine.capacity||0).toLocaleString()} {machine.capacityUnit||"kW"}</td><td className="px-5 py-4"><p className="text-green-400 text-xs font-black">{Number(machine.currentRunningLoad||0).toLocaleString()} {machine.loadUnit||"kW"}</p><p className="text-slate-600 text-[9px]">{Number(machine.normalLoadFactor||0).toFixed(0)}% normal</p></td><td className="px-5 py-4 text-xs font-black text-yellow-400">{(machineConsumption[machine.id]||0).toLocaleString()} kWh</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-[9px] uppercase font-black border ${cfg.cls}`}><Icon size={12}/>{cfg.label}</span></td><td className="px-5 py-4"><p className={`text-xs font-bold ${due?"text-orange-400":"text-slate-300"}`}>{machine.nextMaintenance||"Not scheduled"}</p>{due&&<p className="text-[9px] text-orange-500 uppercase font-black mt-1">Due</p>}</td><td className="px-5 py-4"><div className="flex gap-2"><button onClick={()=>openLog(machine)} className="w-9 h-9 bg-green-500/10 text-green-400 rounded-xl flex items-center justify-center" title="Record Load"><TrendingUp size={15}/></button><button onClick={()=>navigate(`/machines/edit/${machine.id}`)} className="w-9 h-9 bg-yellow-500/10 text-yellow-400 rounded-xl flex items-center justify-center" title="Edit"><Pencil size={15}/></button><button onClick={()=>remove(machine)} disabled={deleting===machine.id} className="w-9 h-9 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center disabled:opacity-50" title="Delete"><Trash2 size={15}/></button></div></td></tr>{expanded===machine.id&&<tr className="bg-white/[0.015]"><td colSpan="9" className="px-5 py-5"><div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">{[["Serial",machine.serialNumber||"—",Hash],["Manufacturer",machine.manufacturer||"—",Factory],["Model",machine.model||"—",Cpu],["Area",machine.location||"—",MapPin],["Department",machine.department||"—",Factory],["Install",machine.installDate||"—",CalendarClock],["Last Service",machine.lastMaintenance||"—",Wrench],["Hours Logged",`${periodLogs.filter(l=>l.machineId===machine.id).reduce((s,l)=>s+(Number(l.operatingHours)||0),0).toFixed(1)} h`,Timer]].map(([l,v,I])=><div key={l} className="rounded-xl border border-white/5 bg-[#020617] p-3"><I size={14} className="text-yellow-500"/><p className="text-[8px] uppercase text-slate-600 font-black mt-2">{l}</p><p className="text-xs text-white font-bold mt-1 break-words">{v}</p></div>)}</div>{machine.notes&&<p className="text-xs text-slate-400 mt-4"><span className="text-slate-600 uppercase font-black">Notes:</span> {machine.notes}</p>}</td></tr>}</React.Fragment>})}</tbody></table></div>}</div>

    {logMachine&&<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"><form onSubmit={saveLog} className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#07101f] shadow-2xl p-6"><div className="flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Load Register</p><h3 className="text-xl font-black text-white mt-1">{logMachine.name}</h3><p className="text-xs text-slate-500">{logMachine.code} · {logMachine.location||"No area"}</p></div><button type="button" onClick={()=>setLogMachine(null)} className="p-2 text-slate-400 hover:text-white"><X/></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6"><div><label className="text-[9px] uppercase font-black text-slate-500">Date</label><input required type="date" className={inputClass+" mt-2"} value={logForm.date} onChange={e=>setLogForm({...logForm,date:e.target.value})}/></div><div><label className="text-[9px] uppercase font-black text-slate-500">Actual Load (kW)</label><input required type="number" min="0" step="0.01" className={inputClass+" mt-2"} value={logForm.actualLoad} onChange={e=>setLogForm({...logForm,actualLoad:e.target.value})}/></div><div><label className="text-[9px] uppercase font-black text-slate-500">Peak Load (kW)</label><input type="number" min="0" step="0.01" className={inputClass+" mt-2"} value={logForm.peakLoad} onChange={e=>setLogForm({...logForm,peakLoad:e.target.value})}/></div><div><label className="text-[9px] uppercase font-black text-slate-500">Operating Hours</label><input required type="number" min="0" step="0.01" className={inputClass+" mt-2"} value={logForm.operatingHours} onChange={e=>setLogForm({...logForm,operatingHours:e.target.value})}/></div><div className="md:col-span-2"><label className="text-[9px] uppercase font-black text-slate-500">Note</label><textarea rows="3" className={inputClass+" mt-2 resize-y"} value={logForm.note} onChange={e=>setLogForm({...logForm,note:e.target.value})} placeholder="Shift, production run, abnormal load, remarks..."/></div></div><div className="mt-5 rounded-xl bg-yellow-500/5 border border-yellow-500/10 p-4"><p className="text-[9px] uppercase text-yellow-500 font-black">Calculated Energy</p><p className="text-2xl font-black text-white mt-1">{((Number(logForm.actualLoad)||0)*(Number(logForm.operatingHours)||0)).toFixed(2)} <span className="text-xs text-slate-500">kWh</span></p></div><button disabled={savingLog} className="w-full mt-5 flex items-center justify-center gap-2 rounded-xl bg-yellow-500 text-black py-3 font-black text-xs uppercase disabled:opacity-60"><Save size={16}/>{savingLog?"Saving...":"Save Load Record"}</button></form></div>}
  </div>;
}
