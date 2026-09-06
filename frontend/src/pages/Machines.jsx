import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, CalendarClock, CheckCircle2, ChevronRight, Cpu, Download, Eye, Gauge, Layers3, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Wrench, X, Zap } from "lucide-react";
import { addMachineCategory, addMachineLoadLog, deleteMachine, deleteMachineLoadLog, subscribeToMachineCategories, subscribeToMachineLoadLogs, subscribeToMachines } from "../services/machineService";
import { getUser } from "../utils/auth";

const STATUS = {
  running: ["Running", "text-green-400 bg-green-500/10 border-green-500/20"],
  standby: ["Standby", "text-blue-400 bg-blue-500/10 border-blue-500/20"],
  stopped: ["Stopped", "text-slate-400 bg-slate-500/10 border-slate-500/20"],
  maintenance: ["Maintenance", "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"],
  out_of_service: ["Out of Service", "text-red-400 bg-red-500/10 border-red-500/20"]
};
const ROLE = {
  producer: ["Produces", "text-green-400 bg-green-500/10 border-green-500/20"],
  consumer: ["Consumes", "text-orange-400 bg-orange-500/10 border-orange-500/20"],
  both: ["Produces + Consumes", "text-blue-400 bg-blue-500/10 border-blue-500/20"],
  process: ["Process / Non-Utility", "text-slate-400 bg-white/5 border-white/10"]
};
const today = () => new Date().toISOString().slice(0, 10);
const n = value => Number(value) || 0;
const inputClass = "w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none transition focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/20 placeholder:text-slate-600";
const logEnergy = log => n(log.energyConsumed) || n(log.actualLoad) * n(log.operatingHours);
const within = (date, from, to) => String(date || "") >= from && String(date || "") <= to;

function rangeFor(period, selected, customFrom, customTo) {
  if (period === "custom") return [customFrom || selected, customTo || selected];
  const d = new Date(`${selected}T00:00:00`);
  if (Number.isNaN(d.getTime()) || period === "daily") return [selected, selected];
  if (period === "monthly") return [new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)];
  const start = new Date(d); start.setDate(d.getDate() - d.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] || STATUS.standby;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${cls}`}>{label}</span>;
}
function RoleBadge({ role }) {
  const [label, cls] = ROLE[role] || ROLE.consumer;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${cls}`}>{label}</span>;
}
function MetricCard({ title, value, unit, icon: Icon, tone = "yellow", hint }) {
  const tones = { yellow: "text-yellow-400", green: "text-green-400", blue: "text-blue-400", orange: "text-orange-400", red: "text-red-400", white: "text-white" };
  return <div className="h-full min-w-0 rounded-2xl border border-white/5 bg-[#020617] p-3 sm:p-4 md:p-5 shadow-[0_12px_40px_rgba(0,0,0,.12)]"><div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-[8px] sm:text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</p><Icon size={16} className={`shrink-0 ${tones[tone] || tones.yellow}`} /></div><p className={`mt-2 truncate text-xl sm:text-2xl md:text-3xl font-black ${tones[tone] || tones.yellow}`}>{value}<span className="ml-1 text-[9px] sm:text-[10px] text-slate-500">{unit || ""}</span></p>{hint && <p className="mt-1 line-clamp-2 text-[8px] sm:text-[9px] text-slate-600">{hint}</p>}</div>;
}
function Section({ title, subtitle, icon: Icon, children, action }) {
  return <section className="min-w-0 overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 bg-[#020617] p-3 sm:p-5 md:p-6 shadow-[0_18px_60px_rgba(0,0,0,.12)]"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><Icon size={18} className="shrink-0 text-yellow-500" /><h2 className="truncate font-black">{title}</h2></div>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function MiniStat({ label, value, tone = "white" }) { const cls = { white: "text-white", yellow: "text-yellow-400", green: "text-green-400", blue: "text-blue-400", orange: "text-orange-400" }[tone] || "text-white"; return <div className="min-w-0 rounded-xl bg-white/[0.025] p-3"><p className="truncate text-[8px] uppercase tracking-widest text-slate-600 font-black">{label}</p><p className={`mt-1 truncate text-sm font-black ${cls}`}>{value}</p></div>; }

export default function Machines() {
  const navigate = useNavigate();
  const user = getUser();
  const [machines, setMachines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [period, setPeriod] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(today());
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [logMachine, setLogMachine] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [sortBy, setSortBy] = useState("name");
  const [logForm, setLogForm] = useState({ date: today(), actualLoad: "", peakLoad: "", operatingHours: "", meterStart: "", meterEnd: "", energyConsumed: "", status: "running", note: "" });

  useEffect(() => {
    setLoading(true);
    const unsubs = [
      subscribeToMachines(items => { setMachines(items); setLoading(false); }, error => { setMessage(error.message || "Unable to read machine records."); setLoading(false); }),
      subscribeToMachineLoadLogs(setLogs, error => setMessage(error.message || "Unable to read machine activity history.")),
      subscribeToMachineCategories(setCategories, error => setMessage(error.message || "Unable to read machine categories."))
    ];
    return () => unsubs.forEach(unsub => unsub?.());
  }, []);

  const allCategories = useMemo(() => [...new Set([...categories.map(x => x.name), ...machines.map(x => x.category)].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [categories, machines]);
  const allAreas = useMemo(() => [...new Set(machines.map(x => x.location).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [machines]);
  const visibleMachines = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = machines.filter(m => {
      const hay = [m.name, m.code, m.category, m.type, m.manufacturer, m.model, m.serialNumber, m.location, m.department, m.utilityRole, m.utilityType].filter(Boolean).join(" ").toLowerCase();
      return (!term || hay.includes(term)) && (statusFilter === "all" || (m.status || "standby") === statusFilter) && (categoryFilter === "all" || m.category === categoryFilter) && (areaFilter === "all" || m.location === areaFilter) && (roleFilter === "all" || (m.utilityRole || "consumer") === roleFilter);
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "load") return n(b.currentRunningLoad) - n(a.currentRunningLoad);
      if (sortBy === "capacity") return n(b.capacity) - n(a.capacity);
      if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || ""));
      return String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""));
    });
  }, [machines, search, statusFilter, categoryFilter, areaFilter, roleFilter, sortBy]);

  const [from, to] = rangeFor(period, selectedDate, customFrom, customTo);
  const periodLogs = useMemo(() => logs.filter(log => within(log.date, from, to) && visibleMachines.some(machine => String(machine.id) === String(log.machineId))), [logs, from, to, visibleMachines]);
  const periodByMachine = useMemo(() => {
    const map = {};
    periodLogs.forEach(log => {
      const id = log.machineId;
      if (!map[id]) map[id] = { energy: 0, hours: 0, peak: 0, records: 0 };
      map[id].energy += logEnergy(log);
      map[id].hours += n(log.operatingHours);
      map[id].peak = Math.max(map[id].peak, n(log.peakLoad) || n(log.actualLoad));
      map[id].records += 1;
    });
    return map;
  }, [periodLogs]);
  const stats = useMemo(() => {
    const rated = visibleMachines.reduce((sum, m) => sum + n(m.capacity), 0);
    const actualLoad = visibleMachines.reduce((sum, m) => sum + n(m.currentRunningLoad), 0);
    const runningLoad = visibleMachines.filter(m => m.status === "running").reduce((sum, m) => sum + n(m.currentRunningLoad), 0);
    const energy = periodLogs.reduce((sum, log) => sum + logEnergy(log), 0);
    const hours = periodLogs.reduce((sum, log) => sum + n(log.operatingHours), 0);
    const due = visibleMachines.filter(m => m.nextMaintenance && new Date(`${m.nextMaintenance}T00:00:00`) <= new Date(`${today()}T00:00:00`)).length;
    const roleCounts = visibleMachines.reduce((acc, m) => { const role = m.utilityRole || "consumer"; acc[role] = (acc[role] || 0) + 1; return acc; }, {});
    return { total: visibleMachines.length, running: visibleMachines.filter(m => m.status === "running").length, standby: visibleMachines.filter(m => m.status === "standby").length, stopped: visibleMachines.filter(m => m.status === "stopped").length, maintenance: visibleMachines.filter(m => m.status === "maintenance").length, out: visibleMachines.filter(m => m.status === "out_of_service").length, rated, runningLoad, actualLoad, energy, hours, due, utilization: rated ? actualLoad / rated * 100 : 0, roleCounts };
  }, [visibleMachines, periodLogs]);
  const topMachines = useMemo(() => [...visibleMachines].sort((a, b) => n(b.currentRunningLoad) - n(a.currentRunningLoad)).slice(0, 5), [visibleMachines]);
  const activeFilters = [statusFilter !== "all", categoryFilter !== "all", areaFilter !== "all", roleFilter !== "all", !!search.trim()].filter(Boolean).length;

  const openLog = machine => {
    setLogMachine(machine);
    setLogForm({ date: selectedDate, actualLoad: machine.currentRunningLoad || "", peakLoad: "", operatingHours: "", meterStart: "", meterEnd: "", energyConsumed: "", status: machine.status === "running" ? "running" : "standby", note: "" });
  };
  const saveLog = async event => {
    event.preventDefault(); setSavingLog(true); setMessage("");
    try { await addMachineLoadLog({ ...logForm, machineId: logMachine.id, machineName: logMachine.name, machineCode: logMachine.code, recordedBy: user?.name || user?.email || "Admin" }); setLogMachine(null); setMessage("Machine activity/load record saved to Firebase. History and analytics updated."); }
    catch (error) { setMessage(error.message || "Could not save machine load record."); }
    finally { setSavingLog(false); }
  };
  const removeMachine = async machine => {
    if (!window.confirm(`Delete ${machine.name || machine.code}? This removes the machine master record.`)) return;
    try { await deleteMachine(machine.id); setMessage("Machine deleted successfully."); } catch (error) { setMessage(error.message || "Could not delete machine."); }
  };
  const removeLog = async log => {
    if (!window.confirm("Delete this load history record?")) return;
    try { await deleteMachineLoadLog(log.id); setMessage("Load history record deleted."); } catch (error) { setMessage(error.message || "Could not delete load record."); }
  };
  const saveCategory = async event => {
    event.preventDefault();
    try { await addMachineCategory(categoryName); setCategoryName(""); setCategoryOpen(false); setMessage("Custom machine category saved to Firestore."); } catch (error) { setMessage(error.message || "Could not create category."); }
  };
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setCategoryFilter("all"); setAreaFilter("all"); setRoleFilter("all"); };
  const exportCsv = () => {
    const rows = visibleMachines.map(machine => { const item = periodByMachine[machine.id] || {}; return [machine.name, machine.code, machine.category, machine.type, machine.utilityRole, machine.utilityType, machine.location, machine.status, machine.capacity, machine.currentRunningLoad, item.energy || 0, item.hours || 0, item.peak || 0, item.records || 0]; });
    const esc = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [["Machine","Code","Category","Type","Utility Role","Utility Type","Area","Status","Rated Load","Actual Load","Period Energy kWh","Hours","Peak Load","Records"], ...rows].map(row => row.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `machine-dashboard-${from}-to-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="w-full min-w-0 space-y-5 md:space-y-6 animate-in fade-in duration-500 print:bg-white print:text-black">
    <header className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-500 text-black sm:h-12 sm:w-12"><Cpu size={23}/></div><div className="min-w-0"><h1 className="truncate text-2xl font-black md:text-3xl">Machines Dashboard</h1><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 sm:text-sm">Live machine register, utility classification, load, energy, maintenance and activity control.</p></div></div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end"><button onClick={() => window.location.reload()} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/> REFRESH</button><button onClick={() => setCategoryOpen(true)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black"><Plus size={15} className="inline mr-1"/> CATEGORY</button><button onClick={exportCsv} className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 px-3 py-3 text-xs font-black text-yellow-300"><Download size={15} className="inline mr-1"/> EXPORT</button><button onClick={() => navigate("/machines/add")} className="col-span-2 rounded-xl bg-yellow-500 px-5 py-3 text-xs font-black text-black sm:col-span-1"><Plus size={16} className="inline mr-1"/> ADD MACHINE</button></div>
    </header>

    {message && <div className="flex min-w-0 items-start gap-2 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/><span className="min-w-0 break-words">{message}</span><button onClick={() => setMessage("")} className="ml-auto shrink-0 text-yellow-500"><X size={16}/></button></div>}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><MetricCard title="Total Machines" value={stats.total} icon={Cpu}/><MetricCard title="Running" value={stats.running} icon={Zap} tone="green"/><MetricCard title="Standby" value={stats.standby} icon={Activity} tone="blue"/><MetricCard title="Maintenance" value={stats.maintenance} icon={Wrench}/><MetricCard title="Out of Service" value={stats.out} icon={AlertTriangle} tone="red"/><MetricCard title="Maintenance Due" value={stats.due} icon={CalendarClock} tone="orange"/></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard title="Rated Capacity" value={stats.rated.toLocaleString()} unit="kW" icon={Gauge} tone="white" hint="Total filtered capacity"/><MetricCard title="Live Running Load" value={stats.runningLoad.toLocaleString()} unit="kW" icon={Zap} tone="green" hint="Currently running"/><MetricCard title="Actual Load" value={stats.actualLoad.toLocaleString()} unit="kW" icon={Activity} hint="Current filtered load"/><MetricCard title="Plant Utilization" value={`${stats.utilization.toFixed(1)}%`} icon={BarChart3} tone="blue" hint="Actual ÷ rated capacity"/></div>

    <Section title="Live Machine Control" subtitle="The same register structure is retained at every screen size. Narrow screens scroll the register horizontally instead of replacing it with a different layout." icon={Layers3} action={<div className="flex items-center gap-2"><span className="hidden rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[9px] font-black uppercase text-green-400 sm:inline-flex">Realtime</span><button onClick={() => setShowFilters(v => !v)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black">{showFilters ? "HIDE FILTERS" : "SHOW FILTERS"}{activeFilters > 0 ? ` · ${activeFilters}` : ""}</button></div>}>
      {showFilters && <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6"><div className="relative min-w-0 xl:col-span-2"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"/><input value={search} onChange={e => setSearch(e.target.value)} className={`${inputClass} pl-11`} placeholder="Search machine, code, model, area, utility..."/></div><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}><option value="all">All Statuses</option>{Object.entries(STATUS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}</select><select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={inputClass}><option value="all">All Categories</option>{allCategories.map(category => <option key={category} value={category}>{category}</option>)}</select><select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={inputClass}><option value="all">All Utility Roles</option>{Object.entries(ROLE).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}</select><select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className={inputClass}><option value="all">All Areas / Locations</option>{allAreas.map(area => <option key={area} value={area}>{area}</option>)}</select><select value={sortBy} onChange={e => setSortBy(e.target.value)} className={inputClass}><option value="name">Sort: Name</option><option value="load">Sort: Live Load</option><option value="capacity">Sort: Capacity</option><option value="status">Sort: Status</option></select>{activeFilters > 0 && <button onClick={clearFilters} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-black text-red-300 md:col-span-2 xl:col-span-1">CLEAR FILTERS</button>}</div>}

      <div className="mt-5 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-white/5 bg-black/10 [scrollbar-width:thin]"><table className="w-full min-w-[1180px] table-auto"><thead className="bg-white/[0.02]"><tr className="border-b border-white/5">{["Machine","Utility","Area","Rated","Live Load","Status","Period kWh","Hours","Peak","Records","Actions"].map(h => <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{visibleMachines.map(machine => { const item = periodByMachine[machine.id] || { energy: 0, hours: 0, peak: 0, records: 0 }; return <tr key={machine.id} className="border-b border-white/[0.04] transition hover:bg-white/[0.025]"><td className="px-3 py-3"><button onClick={() => navigate(`/machines/view/${machine.id}`)} className="group flex min-w-[200px] items-center gap-3 text-left"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">{machine.imageUrl ? <img src={machine.imageUrl} alt="" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} /> : <Cpu size={17} className="text-slate-700"/>}</div><div className="min-w-0"><p className="truncate text-xs font-black text-white group-hover:text-yellow-400">{machine.name || "Unnamed"}</p><p className="text-[9px] text-yellow-500">{machine.code || "No code"}</p><p className="max-w-[190px] truncate text-[9px] text-slate-600">{machine.category || "Uncategorized"} · {machine.type || "General"}</p></div></button></td><td className="px-3 py-3"><div className="space-y-1"><RoleBadge role={machine.utilityRole}/><p className="max-w-[130px] truncate text-[9px] text-slate-600">{machine.utilityType || "Electricity"}</p></div></td><td className="max-w-[150px] truncate px-3 py-3 text-xs text-slate-400">{machine.location || "—"}</td><td className="whitespace-nowrap px-3 py-3 text-xs font-bold">{n(machine.capacity).toLocaleString()} {machine.capacityUnit || "kW"}</td><td className="whitespace-nowrap px-3 py-3 text-xs font-black text-yellow-300">{n(machine.currentRunningLoad).toLocaleString()} {machine.loadUnit || "kW"}</td><td className="px-3 py-3"><StatusBadge status={machine.status}/></td><td className="whitespace-nowrap px-3 py-3 text-xs font-black text-yellow-400">{item.energy.toLocaleString(undefined,{maximumFractionDigits:2})}</td><td className="px-3 py-3 text-xs text-slate-300">{item.hours.toFixed(2)}</td><td className="px-3 py-3 text-xs text-orange-300">{item.peak.toFixed(1)}</td><td className="px-3 py-3 text-xs text-slate-400">{item.records}</td><td className="px-3 py-3"><div className="flex min-w-max gap-1"><button onClick={() => navigate(`/machines/view/${machine.id}`)} className="rounded-lg bg-blue-500/10 p-2 text-blue-300" title="View details"><Eye size={14}/></button><button onClick={() => openLog(machine)} className="rounded-lg bg-green-500/10 p-2 text-green-400" title="Log activity"><Activity size={14}/></button><button onClick={() => navigate(`/machines/edit/${machine.id}`)} className="rounded-lg bg-white/5 p-2 text-slate-300" title="Edit"><Pencil size={14}/></button><button onClick={() => removeMachine(machine)} className="rounded-lg bg-red-500/10 p-2 text-red-400" title="Delete"><Trash2 size={14}/></button></div></td></tr>; })}</tbody></table>{!loading && visibleMachines.length === 0 && <div className="min-w-[1180px] py-14 text-center"><Cpu size={35} className="mx-auto text-slate-700"/><p className="mt-3 text-xs font-black uppercase tracking-widest text-slate-600">No machines match the current filters</p><button onClick={() => { clearFilters(); navigate("/machines/add"); }} className="mt-4 text-xs font-black text-yellow-400">ADD YOUR FIRST MACHINE</button></div>}{loading && <div className="min-w-[1180px] flex items-center justify-center gap-2 py-14 text-xs font-black uppercase tracking-widest text-slate-600"><Loader2 size={18} className="animate-spin"/> Loading live machine records...</div>}</div>
    </Section>

    <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-3">
      <Section title="Utility Mix" subtitle="Live classification of the filtered machine set." icon={Zap}><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniStat label="Produces" value={stats.roleCounts.producer || 0} tone="green"/><MiniStat label="Consumes" value={stats.roleCounts.consumer || 0} tone="orange"/><MiniStat label="Both" value={stats.roleCounts.both || 0} tone="blue"/><MiniStat label="Process" value={stats.roleCounts.process || 0}/></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-white/5"><div className="flex h-full">{["producer","consumer","both","process"].map(role => <div key={role} style={{ width: `${stats.total ? ((stats.roleCounts[role] || 0) / stats.total) * 100 : 0}%` }} className={role === "producer" ? "bg-green-400" : role === "consumer" ? "bg-orange-400" : role === "both" ? "bg-blue-400" : "bg-slate-600"}/>)}</div></div></Section>
      <Section title="Highest Live Load" subtitle="Top five machines by current running load." icon={Gauge}><div className="mt-4 space-y-2">{topMachines.map((machine, index) => <button key={machine.id} onClick={() => navigate(`/machines/view/${machine.id}`)} className="flex w-full items-center gap-3 rounded-xl bg-white/[0.025] p-3 text-left transition hover:bg-white/[0.05]"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-[10px] font-black text-yellow-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{machine.name || machine.code}</p><p className="truncate text-[9px] text-slate-600">{machine.location || "No area"}</p></div><span className="whitespace-nowrap text-xs font-black text-yellow-300">{n(machine.currentRunningLoad)} {machine.loadUnit || "kW"}</span><ChevronRight size={14} className="shrink-0 text-slate-700"/></button>)}{!topMachines.length && <p className="py-6 text-center text-xs text-slate-600">No machine data.</p>}</div></Section>
      <Section title="Selected Period" subtitle={`${from} → ${to}`} icon={CalendarClock}><div className="mt-4 grid grid-cols-2 gap-3"><MiniStat label="Energy" value={`${stats.energy.toFixed(2)} kWh`} tone="yellow"/><MiniStat label="Operating" value={`${stats.hours.toFixed(2)} h`} tone="blue"/><MiniStat label="Records" value={periodLogs.length}/><MiniStat label="Machines" value={visibleMachines.length}/></div></Section>
    </div>

    <Section title="Load & Energy Analytics" subtitle="Daily, weekly, monthly or custom machine activity/load records." icon={BarChart3} action={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end"><select value={period} onChange={e => setPeriod(e.target.value)} className={`${inputClass} sm:w-auto sm:min-w-28`}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>{period === "custom" ? <><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={`${inputClass} sm:w-auto`}/><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={`${inputClass} sm:w-auto`}/></> : <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className={`${inputClass} sm:w-auto`}/>}<button onClick={exportCsv} className="col-span-2 rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black sm:col-span-1">EXPORT CSV</button></div>}>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><MiniStat label="Selected Period" value={period === "custom" ? "Custom" : period[0].toUpperCase() + period.slice(1)}/><MiniStat label="Energy Consumed" value={`${stats.energy.toFixed(2)} kWh`} tone="yellow"/><MiniStat label="Operating Hours" value={`${stats.hours.toFixed(2)} h`} tone="blue"/><MiniStat label="Load Records" value={periodLogs.length}/></div>
    </Section>

    {logMachine && <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm" onClick={() => setLogMachine(null)}><form onSubmit={saveLog} onClick={e => e.stopPropagation()} className="my-6 w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#020617] p-4 sm:p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Machine Activity / Load</p><h2 className="mt-1 truncate text-xl font-black">{logMachine.name || logMachine.code}</h2><p className="mt-1 text-xs text-slate-500">{logMachine.code || "No code"} · {logMachine.utilityType || "Electricity"}</p></div><button type="button" onClick={() => setLogMachine(null)} className="rounded-xl bg-white/5 p-2"><X size={18}/></button></div><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Date"><input required type="date" value={logForm.date} onChange={e => setLogForm(v => ({...v, date: e.target.value}))} className={inputClass}/></Field><Field label="Status"><select value={logForm.status} onChange={e => setLogForm(v => ({...v, status: e.target.value}))} className={inputClass}>{Object.entries(STATUS).map(([value,[label]]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={`Actual Load (${logMachine.loadUnit || "kW"})`}><input required type="number" min="0" value={logForm.actualLoad} onChange={e => setLogForm(v => ({...v, actualLoad: e.target.value}))} className={inputClass}/></Field><Field label="Peak Load"><input type="number" min="0" value={logForm.peakLoad} onChange={e => setLogForm(v => ({...v, peakLoad: e.target.value}))} className={inputClass}/></Field><Field label="Operating Hours"><input type="number" min="0" step="0.01" value={logForm.operatingHours} onChange={e => setLogForm(v => ({...v, operatingHours: e.target.value}))} className={inputClass}/></Field><Field label="Energy Consumed (kWh)"><input type="number" min="0" step="0.01" value={logForm.energyConsumed} onChange={e => setLogForm(v => ({...v, energyConsumed: e.target.value}))} className={inputClass}/></Field><Field label="Meter Start"><input type="number" min="0" step="0.01" value={logForm.meterStart} onChange={e => setLogForm(v => ({...v, meterStart: e.target.value}))} className={inputClass}/></Field><Field label="Meter End"><input type="number" min="0" step="0.01" value={logForm.meterEnd} onChange={e => setLogForm(v => ({...v, meterEnd: e.target.value}))} className={inputClass}/></Field><Field label="Activity Note" full><textarea rows="3" value={logForm.note} onChange={e => setLogForm(v => ({...v, note: e.target.value}))} className={inputClass} placeholder="Describe the machine activity, shift, issue or operating condition..."/></Field></div><button disabled={savingLog} className="mt-5 w-full rounded-xl bg-yellow-500 px-5 py-3 text-xs font-black text-black disabled:opacity-60">{savingLog ? "SAVING..." : "SAVE ACTIVITY RECORD"}</button></form></div>}

    {categoryOpen && <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm" onClick={() => setCategoryOpen(false)}><form onSubmit={saveCategory} className="my-6 w-full max-w-md rounded-[2rem] border border-white/10 bg-[#020617] p-5 sm:p-6" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Machine Categories</p><h2 className="mt-1 text-xl font-black">Create Custom Category</h2></div><button type="button" onClick={() => setCategoryOpen(false)} className="rounded-xl bg-white/5 p-2"><X size={18}/></button></div><p className="mt-2 text-xs leading-5 text-slate-500">Custom categories are saved in Firestore and become available immediately.</p><input autoFocus required value={categoryName} onChange={e => setCategoryName(e.target.value)} className={`${inputClass} mt-5`} placeholder="e.g. Textile Machine"/><button className="mt-3 w-full rounded-xl bg-yellow-500 px-5 py-3 text-xs font-black text-black">SAVE CATEGORY</button></form></div>}
  </div>;
}

function Field({ label, children, full = false }) { return <label className={full ? "sm:col-span-2" : ""}><span className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>{children}</label>; }
