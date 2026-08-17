import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, CalendarClock, Cpu, Gauge, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Wrench, Zap } from "lucide-react";
import { deleteMachine, subscribeToMachines } from "../services/machineService";

const STATUS = {
  running: { label: "Running", icon: Zap, cls: "text-green-400 bg-green-500/10 border-green-500/20" },
  standby: { label: "Standby", icon: Activity, cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  stopped: { label: "Stopped", icon: Gauge, cls: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  maintenance: { label: "Maintenance", icon: Wrench, cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  out_of_service: { label: "Out of Service", icon: AlertTriangle, cls: "text-red-400 bg-red-500/10 border-red-500/20" }
};

const isMaintenanceDue = (date) => {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  return !Number.isNaN(due.getTime()) && due <= today;
};

export default function Machines() {
  const navigate = useNavigate();
  const [machines, setMachines] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    setLoading(true);
    setMessage("");
  };

  useEffect(() => {
    const unsubscribe = subscribeToMachines((items) => {
      setMachines(items);
      setLoading(false);
    }, (error) => {
      console.error(error);
      setMessage(error.message || "Unable to load machines from Firebase.");
      setLoading(false);
    });
    return () => unsubscribe?.();
  }, []);

  const categories = useMemo(() => [...new Set(machines.map(item => item.category).filter(Boolean))].sort(), [machines]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return machines.filter((machine) => {
      const status = machine.status || "standby";
      const text = [machine.name, machine.code, machine.category, machine.type, machine.manufacturer, machine.model, machine.serialNumber, machine.location, machine.department].filter(Boolean).join(" ").toLowerCase();
      return (statusFilter === "all" || status === statusFilter) && (categoryFilter === "all" || machine.category === categoryFilter) && (!term || text.includes(term));
    });
  }, [machines, search, statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    const capacity = machines.reduce((sum, machine) => sum + (Number(machine.capacity) || 0), 0);
    return {
      total: machines.length,
      running: machines.filter(m => m.status === "running").length,
      standby: machines.filter(m => m.status === "standby").length,
      maintenance: machines.filter(m => m.status === "maintenance").length,
      out: machines.filter(m => m.status === "out_of_service").length,
      due: machines.filter(m => isMaintenanceDue(m.nextMaintenance)).length,
      capacity
    };
  }, [machines]);

  const remove = async (machine) => {
    if (!window.confirm(`Delete ${machine.name || machine.code}? This machine record will be permanently removed.`)) return;
    setDeleting(machine.id);
    try {
      await deleteMachine(machine.id);
    } catch (error) {
      setMessage(error.message || "Could not delete machine.");
    } finally {
      setDeleting(null);
    }
  };

  const statCards = [
    ["Total Machines", stats.total, Cpu, "text-yellow-400"],
    ["Running", stats.running, Zap, "text-green-400"],
    ["Standby", stats.standby, Activity, "text-blue-400"],
    ["Maintenance", stats.maintenance, Wrench, "text-yellow-400"],
    ["Out of Service", stats.out, AlertTriangle, "text-red-400"],
    ["Maintenance Due", stats.due, CalendarClock, "text-orange-400"]
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-yellow-500 rounded-2xl flex items-center justify-center text-black"><Cpu size={24}/></div>
          <div><h1 className="text-2xl md:text-3xl font-black text-white">Machines Dashboard</h1><p className="text-slate-500 text-sm mt-1">Central machine register, live status and maintenance overview</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white" title="Refresh"><RefreshCw size={18} className={loading ? "animate-spin" : ""}/></button>
          <button onClick={() => navigate("/machines/add")} className="flex items-center gap-2 px-5 py-3 bg-yellow-500 text-black rounded-xl text-xs font-black uppercase tracking-wide"><Plus size={17}/> Add Machine</button>
        </div>
      </div>

      {message && <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-sm">{message}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map(([label, value, Icon, color]) => <button key={label} onClick={() => label === "Total Machines" ? setStatusFilter("all") : label === "Maintenance Due" ? setStatusFilter("all") : setStatusFilter(label === "Out of Service" ? "out_of_service" : label.toLowerCase())} className="text-left rounded-2xl border border-white/5 bg-[#020617] p-4 hover:bg-white/[0.03] transition"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{label}</p><p className={`mt-2 text-2xl md:text-3xl font-black ${color}`}>{value}</p><Icon size={16} className={`mt-2 ${color}`}/></button>)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/5 bg-[#020617] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Total Registered Capacity</p><p className="text-2xl font-black text-white mt-2">{stats.capacity.toLocaleString()} <span className="text-xs text-slate-500">mixed units</span></p><p className="text-[10px] text-slate-600 mt-1">Capacity is shown as entered per machine.</p></div>
        <div className="rounded-2xl border border-orange-500/10 bg-orange-500/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-orange-400 font-black">Maintenance Attention</p><p className="text-2xl font-black text-white mt-2">{stats.due} <span className="text-xs text-slate-500">machine{stats.due === 1 ? "" : "s"} due</span></p><p className="text-[10px] text-slate-600 mt-1">Based on each machine's next maintenance date.</p></div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#020617] p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search machine, code, manufacturer, location..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white outline-none"/></div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"><option value="all">All Statuses</option>{Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"><option value="all">All Categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>
      </div>

      <div className="rounded-[2rem] overflow-hidden border border-white/5 bg-[#020617]">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between"><div><h2 className="text-white font-black text-sm uppercase">All Machines</h2><p className="text-slate-500 text-[10px] mt-1">Showing {filtered.length} of {machines.length} registered machines</p></div><span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">Firestore Live</span></div>
        {loading ? <div className="min-h-[300px] flex items-center justify-center"><Loader2 size={30} className="animate-spin text-yellow-500"/></div> : filtered.length === 0 ? <div className="min-h-[300px] flex flex-col items-center justify-center gap-3 text-slate-500"><Cpu size={36}/><p className="font-black text-xs uppercase">No machines found</p><button onClick={() => navigate("/machines/add")} className="text-yellow-500 text-xs font-black uppercase">Add your first machine</button></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px]"><thead><tr className="border-b border-white/5">{["Machine","Category / Type","Location","Capacity","Status","Maintenance","Actions"].map(header => <th key={header} className="text-left px-5 py-4 text-[9px] uppercase tracking-widest text-slate-500">{header}</th>)}</tr></thead><tbody>{filtered.map(machine => { const cfg = STATUS[machine.status] || STATUS.standby; const Icon = cfg.icon; const due = isMaintenanceDue(machine.nextMaintenance); return <tr key={machine.id} className="border-b border-white/[0.04] hover:bg-white/[0.025]"><td className="px-5 py-4"><p className="text-white text-sm font-black">{machine.name || "Unnamed Machine"}</p><p className="text-yellow-500 text-[10px] font-black mt-1">{machine.code || "No code"}</p><p className="text-slate-600 text-[10px] mt-1">{machine.manufacturer || ""} {machine.model || ""}</p></td><td className="px-5 py-4"><p className="text-white text-xs">{machine.category || "General"}</p><p className="text-slate-500 text-[10px] mt-1">{machine.type || "No type"}</p></td><td className="px-5 py-4"><p className="text-white text-xs">{machine.location || "No location"}</p><p className="text-slate-500 text-[10px] mt-1">{machine.department || ""}</p></td><td className="px-5 py-4 text-xs text-white font-bold">{Number(machine.capacity || 0).toLocaleString()} <span className="text-slate-500 font-normal">{machine.capacityUnit || ""}</span></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-[9px] uppercase font-black border ${cfg.cls}`}><Icon size={12}/>{cfg.label}</span></td><td className="px-5 py-4"><p className={`text-xs font-bold ${due ? "text-orange-400" : "text-slate-300"}`}>{machine.nextMaintenance || "Not scheduled"}</p>{due && <p className="text-[9px] text-orange-500 uppercase font-black mt-1">Due</p>}</td><td className="px-5 py-4"><div className="flex gap-2"><button onClick={() => navigate(`/machines/edit/${machine.id}`)} className="w-9 h-9 bg-yellow-500/10 text-yellow-400 rounded-xl flex items-center justify-center" title="Edit"><Pencil size={15}/></button><button onClick={() => remove(machine)} disabled={deleting === machine.id} className="w-9 h-9 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center disabled:opacity-50" title="Delete"><Trash2 size={15}/></button></div></td></tr>; })}</tbody></table></div>}
      </div>
    </div>
  );
}
