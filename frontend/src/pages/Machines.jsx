import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, CalendarClock, Cpu, Gauge, Loader2, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, Wrench, X, Zap } from "lucide-react";
import { addMachineCategory, addMachineLoadLog, deleteMachine, deleteMachineLoadLog, subscribeToMachineCategories, subscribeToMachineLoadLogs, subscribeToMachines } from "../services/machineService";
import { getUser } from "../utils/auth";

const STATUS = {
  running: ["Running", "text-green-400 bg-green-500/10 border-green-500/20"],
  standby: ["Standby", "text-blue-400 bg-blue-500/10 border-blue-500/20"],
  stopped: ["Stopped", "text-slate-400 bg-slate-500/10 border-slate-500/20"],
  maintenance: ["Maintenance", "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"],
  out_of_service: ["Out of Service", "text-red-400 bg-red-500/10 border-red-500/20"]
};

const today = () => new Date().toISOString().slice(0, 10);
const asNumber = (value) => Number(value) || 0;
const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500/60 placeholder:text-slate-600";
const labelClass = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";

function rangeFor(period, selected, customFrom, customTo) {
  if (period === "custom") return [customFrom || selected, customTo || selected];
  const d = new Date(`${selected}T00:00:00`);
  if (Number.isNaN(d.getTime())) return [selected, selected];
  if (period === "daily") return [selected, selected];
  if (period === "monthly") return [new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)];
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

const within = (date, from, to) => String(date || "") >= from && String(date || "") <= to;
const logEnergy = (log) => asNumber(log.energyConsumed) || asNumber(log.actualLoad) * asNumber(log.operatingHours);

function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] || STATUS.standby;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${cls}`}>{label}</span>;
}

function MetricCard({ title, value, unit, icon: Icon, tone = "yellow", hint }) {
  const tones = { yellow: "text-yellow-400", green: "text-green-400", blue: "text-blue-400", orange: "text-orange-400", red: "text-red-400", white: "text-white" };
  return <div className="rounded-2xl border border-white/5 bg-[#020617] p-4 md:p-5"><div className="flex items-center justify-between"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</p><Icon size={16} className={tones[tone] || tones.yellow}/></div><p className={`mt-2 text-2xl md:text-3xl font-black ${tones[tone] || tones.yellow}`}>{value}<span className="ml-1 text-[10px] text-slate-500">{unit || ""}</span></p>{hint && <p className="mt-1 text-[9px] text-slate-600">{hint}</p>}</div>;
}

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
  const [period, setPeriod] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(today());
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState(null);
  const [logMachine, setLogMachine] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [logForm, setLogForm] = useState({ date: today(), actualLoad: "", peakLoad: "", operatingHours: "", meterStart: "", meterEnd: "", energyConsumed: "", status: "running", note: "" });
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubs = [
      subscribeToMachines(items => { setMachines(items); setLoading(false); }, error => { setMessage(error.message || "Unable to read machine records."); setLoading(false); }),
      subscribeToMachineLoadLogs(setLogs, error => setMessage(error.message || "Unable to read machine load history.")),
      subscribeToMachineCategories(setCategories, error => setMessage(error.message || "Unable to read machine categories."))
    ];
    return () => unsubs.forEach(unsub => unsub?.());
  }, []);

  const allCategories = useMemo(() => [...new Set([...categories.map(x => x.name), ...machines.map(x => x.category)].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [categories, machines]);
  const allAreas = useMemo(() => [...new Set(machines.map(x => x.location).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [machines]);

  const visibleMachines = useMemo(() => {
    const term = search.trim().toLowerCase();
    return machines.filter(m => {
      const hay = [m.name, m.code, m.category, m.type, m.manufacturer, m.model, m.serialNumber, m.location, m.department].filter(Boolean).join(" ").toLowerCase();
      return (!term || hay.includes(term)) && (statusFilter === "all" || (m.status || "standby") === statusFilter) && (categoryFilter === "all" || m.category === categoryFilter) && (areaFilter === "all" || m.location === areaFilter);
    });
  }, [machines, search, statusFilter, categoryFilter, areaFilter]);

  const [from, to] = rangeFor(period, selectedDate, customFrom, customTo);
  const periodLogs = useMemo(() => logs.filter(log => within(log.date, from, to) && visibleMachines.some(machine => machine.id === log.machineId)), [logs, from, to, visibleMachines]);

  const periodByMachine = useMemo(() => {
    const map = {};
    periodLogs.forEach(log => {
      if (!map[log.machineId]) map[log.machineId] = { energy: 0, hours: 0, peak: 0, loadTotal: 0, records: 0 };
      map[log.machineId].energy += logEnergy(log);
      map[log.machineId].hours += asNumber(log.operatingHours);
      map[log.machineId].peak = Math.max(map[log.machineId].peak, asNumber(log.peakLoad) || asNumber(log.actualLoad));
      map[log.machineId].loadTotal += asNumber(log.actualLoad);
      map[log.machineId].records += 1;
    });
    return map;
  }, [periodLogs]);

  const stats = useMemo(() => {
    const rated = visibleMachines.reduce((sum, m) => sum + asNumber(m.capacity), 0);
    const runningLoad = visibleMachines.filter(m => m.status === "running").reduce((sum, m) => sum + asNumber(m.currentRunningLoad), 0);
    const actualLoad = visibleMachines.reduce((sum, m) => sum + asNumber(m.currentRunningLoad), 0);
    const energy = periodLogs.reduce((sum, log) => sum + logEnergy(log), 0);
    const hours = periodLogs.reduce((sum, log) => sum + asNumber(log.operatingHours), 0);
    const due = visibleMachines.filter(m => m.nextMaintenance && new Date(`${m.nextMaintenance}T00:00:00`) <= new Date(`${today()}T00:00:00`)).length;
    return { total: visibleMachines.length, running: visibleMachines.filter(m => m.status === "running").length, standby: visibleMachines.filter(m => m.status === "standby").length, maintenance: visibleMachines.filter(m => m.status === "maintenance").length, out: visibleMachines.filter(m => m.status === "out_of_service").length, rated, runningLoad, actualLoad, energy, hours, due, utilization: rated ? (actualLoad / rated) * 100 : 0 };
  }, [visibleMachines, periodLogs]);

  const openLog = machine => {
    setLogMachine(machine);
    setLogForm({ date: selectedDate, actualLoad: machine.currentRunningLoad || "", peakLoad: "", operatingHours: "", meterStart: "", meterEnd: "", energyConsumed: "", status: machine.status === "running" ? "running" : "standby", note: "" });
  };

  const saveLog = async event => {
    event.preventDefault();
    setSavingLog(true); setMessage("");
    try {
      await addMachineLoadLog({ ...logForm, machineId: logMachine.id, machineName: logMachine.name, machineCode: logMachine.code, recordedBy: user?.name || user?.email || "Admin" });
      setLogMachine(null); setMessage("Machine load record saved. Current running load and analytics were updated.");
    } catch (error) { setMessage(error.message || "Could not save machine load record."); }
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

  const exportCsv = () => {
    const rows = visibleMachines.map(machine => {
      const item = periodByMachine[machine.id] || {};
      return [machine.name, machine.code, machine.category, machine.type, machine.location, machine.status, machine.capacity, machine.currentRunningLoad, item.energy || 0, item.hours || 0, item.peak || 0, item.records || 0];
    });
    const esc = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [["Machine","Code","Category","Type","Area","Status","Rated Load","Actual Load","Period Energy kWh","Hours","Peak Load","Records"], ...rows].map(row => row.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `machine-load-report-${from}-to-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-6 animate-in fade-in duration-500 print:bg-white print:text-black">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Cpu size={24}/></div><div><h1 className="text-2xl md:text-3xl font-black">Machines Dashboard</h1><p className="text-slate-500 text-sm mt-1">Machine register, rated load, actual running load, energy consumption and maintenance control</p></div></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => window.location.reload()} className="p-3 rounded-xl bg-white/5 border border-white/10" title="Refresh"><RefreshCw size={17} className={loading ? "animate-spin" : ""}/></button><button onClick={() => setCategoryOpen(true)} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black"><Plus size={15} className="inline mr-1"/> CATEGORY</button><button onClick={() => navigate("/machines/add")} className="px-5 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Plus size={17} className="inline mr-1"/> ADD MACHINE</button></div>
    </div>

    {message && <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">{message}</div>}

    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <MetricCard title="Total Machines" value={stats.total} icon={Cpu} tone="yellow"/>
      <MetricCard title="Running" value={stats.running} icon={Zap} tone="green"/>
      <MetricCard title="Standby" value={stats.standby} icon={Activity} tone="blue"/>
      <MetricCard title="Maintenance" value={stats.maintenance} icon={Wrench} tone="yellow"/>
      <MetricCard title="Out of Service" value={stats.out} icon={AlertTriangle} tone="red"/>
      <MetricCard title="Maintenance Due" value={stats.due} icon={CalendarClock} tone="orange"/>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard title="Total / Rated Load" value={stats.rated.toLocaleString()} unit="kW" icon={Gauge} tone="white" hint="Sum of all visible machine capacities"/>
      <MetricCard title="Running Load" value={stats.runningLoad.toLocaleString()} unit="kW" icon={Zap} tone="green" hint="Only machines currently marked Running"/>
      <MetricCard title="Actual Registered Load" value={stats.actualLoad.toLocaleString()} unit="kW" icon={Activity} tone="yellow" hint="Current load of all visible machines"/>
      <MetricCard title="Utilization" value={`${stats.utilization.toFixed(1)}%`} icon={BarChart3} tone="blue" hint="Actual load ÷ rated load"/>
    </div>

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5">
      <div className="flex flex-col 2xl:flex-row 2xl:items-end justify-between gap-4"><div><div className="flex items-center gap-2"><BarChart3 size={18} className="text-yellow-500"/><h2 className="font-black">Load & Energy Analytics</h2></div><p className="text-slate-500 text-xs mt-1">Daily, weekly, monthly or custom energy consumption for each machine and the complete filtered plant.</p></div><div className="flex flex-wrap gap-2"><select value={period} onChange={e => setPeriod(e.target.value)} className={inputClass + " w-auto min-w-28"}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>{period === "custom" ? <><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={inputClass + " w-auto"}/><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={inputClass + " w-auto"}/></> : <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className={inputClass + " w-auto"}/>}<button onClick={exportCsv} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">EXPORT CSV</button></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div className="rounded-xl bg-white/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Selected Period</p><p className="text-white font-black mt-1">{period[0].toUpperCase() + period.slice(1)}</p><p className="text-[9px] text-slate-600 mt-1">{from} → {to}</p></div><div className="rounded-xl bg-white/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Energy Consumed</p><p className="text-yellow-400 text-xl font-black mt-1">{stats.energy.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-xs">kWh</span></p></div><div className="rounded-xl bg-white/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Operating Hours</p><p className="text-white text-xl font-black mt-1">{stats.hours.toFixed(2)} <span className="text-xs text-slate-500">h</span></p></div><div className="rounded-xl bg-white/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Load Records</p><p className="text-white text-xl font-black mt-1">{periodLogs.length}</p></div></div>

      <div className="overflow-x-auto mt-5"><table className="w-full min-w-[1100px]"><thead><tr className="border-b border-white/5">{["Machine","Area","Rated Load","Actual Load","Status","Period kWh","Hours","Avg Load","Peak","Records","Actions"].map(h => <th key={h} className="px-3 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{visibleMachines.map(machine => { const item = periodByMachine[machine.id] || { energy: 0, hours: 0, peak: 0, loadTotal: 0, records: 0 }; const avg = item.records ? item.loadTotal / item.records : 0; return <tr key={machine.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]"><td className="px-3 py-3"><button onClick={() => setDetail(machine)} className="text-left"><p className="text-xs font-black text-white hover:text-yellow-400">{machine.name || "Unnamed"}</p><p className="text-[9px] text-yellow-500">{machine.code}</p><p className="text-[9px] text-slate-600">{machine.category} · {machine.type || "General"}</p></button></td><td className="px-3 py-3 text-xs text-slate-400">{machine.location || "—"}</td><td className="px-3 py-3 text-xs font-bold">{asNumber(machine.capacity).toLocaleString()} {machine.capacityUnit || "kW"}</td><td className="px-3 py-3 text-xs font-bold text-yellow-300">{asNumber(machine.currentRunningLoad).toLocaleString()} {machine.loadUnit || "kW"}</td><td className="px-3 py-3"><StatusBadge status={machine.status}/></td><td className="px-3 py-3 text-xs font-black text-yellow-400">{item.energy.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td className="px-3 py-3 text-xs text-slate-300">{item.hours.toFixed(2)}</td><td className="px-3 py-3 text-xs text-slate-300">{avg.toFixed(1)}</td><td className="px-3 py-3 text-xs text-orange-300">{item.peak.toFixed(1)}</td><td className="px-3 py-3 text-xs text-slate-400">{item.records}</td><td className="px-3 py-3"><div className="flex gap-1"><button onClick={() => openLog(machine)} className="p-2 rounded-lg bg-green-500/10 text-green-400" title="Log load"><Activity size={14}/></button><button onClick={() => navigate(`/machines/edit/${machine.id}`)} className="p-2 rounded-lg bg-white/5 text-slate-300" title="Edit"><Pencil size={14}/></button><button onClick={() => removeMachine(machine)} className="p-2 rounded-lg bg-red-500/10 text-red-400" title="Delete"><Trash2 size={14}/></button></div></td></tr>; })}</tbody></table>{!loading && visibleMachines.length === 0 && <div className="py-16 text-center"><Cpu size={35} className="mx-auto text-slate-700"/><p className="mt-3 text-xs font-black uppercase tracking-widest text-slate-600">No machines match the current filters</p><button onClick={() => navigate("/machines/add")} className="mt-4 text-xs font-black text-yellow-400">ADD YOUR FIRST MACHINE</button></div>}</div>
    </section>

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5"><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"><div className="xl:col-span-2 relative"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"/><input value={search} onChange={e => setSearch(e.target.value)} className={inputClass + " pl-11"} placeholder="Search machine, code, manufacturer, model, serial, area..."/></div><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}><option value="all">All Statuses</option>{Object.entries(STATUS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}</select><select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={inputClass}><option value="all">All Categories</option>{allCategories.map(category => <option key={category}>{category}</option>)}</select><select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className={inputClass}><option value="all">All Areas / Locations</option>{allAreas.map(area => <option key={area}>{area}</option>)}</select></div></section>

    {detail && <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetail(null)}><div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[#020617] p-6 shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Machine Detail</p><h2 className="text-2xl font-black mt-1">{detail.name}</h2><p className="text-slate-500 text-xs mt-1">{detail.code} · {detail.location || "No area assigned"}</p></div><button onClick={() => setDetail(null)} className="p-2 rounded-xl bg-white/5"><X size={19}/></button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6"><MetricCard title="Rated Load" value={asNumber(detail.capacity).toLocaleString()} unit={detail.capacityUnit} icon={Gauge}/><MetricCard title="Actual Load" value={asNumber(detail.currentRunningLoad).toLocaleString()} unit={detail.loadUnit} icon={Zap} tone="green"/><MetricCard title="Utilization" value={`${detail.capacity ? ((asNumber(detail.currentRunningLoad) / asNumber(detail.capacity)) * 100).toFixed(1) : "0.0"}%`} icon={BarChart3} tone="blue"/><MetricCard title="Period Energy" value={(periodByMachine[detail.id]?.energy || 0).toFixed(2)} unit="kWh" icon={Activity} tone="yellow"/></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">{[["Category",detail.category],["Type",detail.type], ["Manufacturer",detail.manufacturer],["Model",detail.model],["Serial Number",detail.serialNumber],["Department",detail.department],["Area / Location",detail.location],["Installation Date",detail.installDate],["Last Maintenance",detail.lastMaintenance],["Next Maintenance",detail.nextMaintenance],["Maintenance Interval",detail.maintenanceIntervalDays ? `${detail.maintenanceIntervalDays} days` : "—"],["Status",detail.status]].map(([label,value]) => <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">{label}</p><p className="text-sm font-bold text-white mt-1">{value || "—"}</p></div>)}</div>{detail.notes && <div className="mt-4 rounded-xl bg-white/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">Notes</p><p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{detail.notes}</p></div>}<div className="mt-5 flex gap-2"><button onClick={() => openLog(detail)} className="px-4 py-3 rounded-xl bg-green-500 text-black text-xs font-black">LOG LOAD</button><button onClick={() => navigate(`/machines/edit/${detail.id}`)} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">EDIT MACHINE</button></div></div></div>}

    {logMachine && <div className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLogMachine(null)}><form onSubmit={saveLog} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[#020617] p-6" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-[9px] uppercase tracking-widest text-green-400 font-black">Load History</p><h2 className="text-xl font-black mt-1">{logMachine.name}</h2><p className="text-slate-500 text-xs">{logMachine.code} · {logMachine.location || "No area"}</p></div><button type="button" onClick={() => setLogMachine(null)} className="p-2 rounded-xl bg-white/5"><X size={18}/></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6"><div><label className={labelClass}>Date *</label><input required type="date" className={inputClass} value={logForm.date} onChange={e => setLogForm(f => ({ ...f, date: e.target.value }))}/></div><div><label className={labelClass}>Actual Load ({logMachine.loadUnit || "kW"}) *</label><input required type="number" min="0" step="0.01" className={inputClass} value={logForm.actualLoad} onChange={e => setLogForm(f => ({ ...f, actualLoad: e.target.value }))}/></div><div><label className={labelClass}>Peak Load</label><input type="number" min="0" step="0.01" className={inputClass} value={logForm.peakLoad} onChange={e => setLogForm(f => ({ ...f, peakLoad: e.target.value }))}/></div><div><label className={labelClass}>Operating Hours</label><input type="number" min="0" step="0.01" className={inputClass} value={logForm.operatingHours} onChange={e => setLogForm(f => ({ ...f, operatingHours: e.target.value }))}/></div><div><label className={labelClass}>Energy Meter Start (kWh)</label><input type="number" min="0" step="0.01" className={inputClass} value={logForm.meterStart} onChange={e => setLogForm(f => ({ ...f, meterStart: e.target.value }))}/></div><div><label className={labelClass}>Energy Meter End (kWh)</label><input type="number" min="0" step="0.01" className={inputClass} value={logForm.meterEnd} onChange={e => setLogForm(f => ({ ...f, meterEnd: e.target.value }))}/></div><div><label className={labelClass}>Direct Energy (kWh)</label><input type="number" min="0" step="0.01" className={inputClass} value={logForm.energyConsumed} onChange={e => setLogForm(f => ({ ...f, energyConsumed: e.target.value }))}/><p className="text-[9px] text-slate-600 mt-1">Used only when meter values are not supplied.</p></div><div><label className={labelClass}>Current Status</label><select className={inputClass} value={logForm.status} onChange={e => setLogForm(f => ({ ...f, status: e.target.value }))}>{Object.entries(STATUS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}</select></div></div><div className="mt-4"><label className={labelClass}>Notes</label><textarea rows="3" className={inputClass} value={logForm.note} onChange={e => setLogForm(f => ({ ...f, note: e.target.value }))} placeholder="Shift, load condition, meter notes..."/></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setLogMachine(null)} className="px-5 py-3 rounded-xl bg-white/5 text-xs font-black">Cancel</button><button disabled={savingLog} className="px-6 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">{savingLog ? "Saving..." : "SAVE LOAD RECORD"}</button></div></form></div>}

    {categoryOpen && <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCategoryOpen(false)}><form onSubmit={saveCategory} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#020617] p-6" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Machine Categories</p><h2 className="text-xl font-black mt-1">Create Custom Category</h2></div><button type="button" onClick={() => setCategoryOpen(false)} className="p-2 rounded-xl bg-white/5"><X size={18}/></button></div><p className="text-xs text-slate-500 mt-2">Pre-defined categories remain available. Custom categories are stored in Firestore and become available immediately.</p><input autoFocus required value={categoryName} onChange={e => setCategoryName(e.target.value)} className={inputClass + " mt-5"} placeholder="e.g. Textile Machine"/><button className="w-full mt-3 px-5 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">SAVE CATEGORY</button></form></div>}
  </div>;
}
