import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, BarChart3, CalendarClock, Cpu, Edit3, Gauge, Image as ImageIcon, Loader2, MapPin, Wrench, Zap } from "lucide-react";
import { subscribeToMachine, subscribeToMachineLoadLogs } from "../services/machineService";
import { getUser } from "../utils/auth";

const STATUS = {
  running: ["Running", "text-green-400 bg-green-500/10 border-green-500/20"],
  standby: ["Standby", "text-blue-400 bg-blue-500/10 border-blue-500/20"],
  stopped: ["Stopped", "text-slate-400 bg-slate-500/10 border-slate-500/20"],
  maintenance: ["Maintenance", "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"],
  out_of_service: ["Out of Service", "text-red-400 bg-red-500/10 border-red-500/20"]
};

const n = value => Number(value) || 0;
const energy = log => n(log.energyConsumed) || n(log.actualLoad) * n(log.operatingHours);

function Field({ label, value }) {
  return <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">{label}</p><p className="mt-1 text-sm font-bold text-white break-words">{value === undefined || value === null || value === "" ? "—" : value}</p></div>;
}

export default function MachineDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = getUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const [machine, setMachine] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const unsubMachine = subscribeToMachine(id, item => { setMachine(item); setLoading(false); }, err => { setError(err.message || "Unable to load machine."); setLoading(false); });
    const unsubLogs = subscribeToMachineLoadLogs(items => setLogs(items.filter(item => String(item.machineId) === String(id))), err => setError(err.message || "Unable to load machine history."));
    return () => { unsubMachine?.(); unsubLogs?.(); };
  }, [id]);

  const stats = useMemo(() => {
    const energyTotal = logs.reduce((sum, log) => sum + energy(log), 0);
    const hours = logs.reduce((sum, log) => sum + n(log.operatingHours), 0);
    const peak = logs.reduce((max, log) => Math.max(max, n(log.peakLoad) || n(log.actualLoad)), 0);
    const avg = logs.length ? logs.reduce((sum, log) => sum + n(log.actualLoad), 0) / logs.length : 0;
    const utilization = n(machine?.capacity) > 0 ? (n(machine?.currentRunningLoad) / n(machine?.capacity)) * 100 : 0;
    return { energyTotal, hours, peak, avg, utilization };
  }, [machine, logs]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 size={32} className="animate-spin text-yellow-500"/></div>;
  if (!machine) return <div className="space-y-5"><button onClick={() => navigate("/machines")} className="flex items-center gap-2 text-xs font-black text-yellow-400"><ArrowLeft size={16}/> BACK TO MACHINES</button><div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-300 font-bold">{error || "Machine record was not found."}</div></div>;

  const [statusLabel, statusClass] = STATUS[machine.status] || STATUS.standby;

  return <div className="space-y-6 animate-in fade-in duration-500">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="flex items-center gap-3"><button onClick={() => navigate("/machines")} className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"><ArrowLeft size={19}/></button><div><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Machine Information</p><h1 className="text-2xl md:text-3xl font-black mt-1">{machine.name || "Unnamed Machine"}</h1><p className="text-slate-500 text-sm mt-1">{machine.code || "No code"} · {machine.location || "No area assigned"}</p></div></div>
      <div className="flex gap-2 items-center"><span className={`rounded-full border px-3 py-2 text-[9px] font-black uppercase ${statusClass}`}>{statusLabel}</span>{isAdmin && <button onClick={() => navigate(`/machines/edit/${machine.id}`)} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Edit3 size={15} className="inline mr-1"/> EDIT MACHINE</button>}</div>
    </div>

    <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)] gap-5">
      <div className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden min-h-[320px] flex items-center justify-center">
        {machine.imageUrl ? <img src={machine.imageUrl} alt={machine.name || "Machine"} className="w-full h-full max-h-[520px] object-contain bg-black/20" onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement.querySelector(".machine-image-fallback")?.classList.remove("hidden"); }}/>}<div className={`machine-image-fallback ${machine.imageUrl ? "hidden" : ""} text-center text-slate-700 p-10`}><ImageIcon size={56} className="mx-auto"/><p className="mt-3 text-xs font-black uppercase tracking-widest">No machine image available</p>{machine.imageUrl && <p className="text-[10px] text-slate-600 mt-2">The supplied image URL could not be loaded.</p>}</div>
      </div>
      <div className="rounded-[2rem] border border-white/5 bg-[#020617] p-6"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Cpu size={21}/></div><div><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">Machine Overview</p><h2 className="font-black text-lg">{machine.manufacturer || "Manufacturer not specified"}</h2></div></div><div className="grid grid-cols-2 gap-3 mt-6"><Field label="Category" value={machine.category}/><Field label="Type" value={machine.type}/><Field label="Model" value={machine.model}/><Field label="Serial Number" value={machine.serialNumber}/><Field label="Department" value={machine.department}/><Field label="Area / Location" value={machine.location}/></div></div>
    </section>

    {machine.description && <section className="rounded-[2rem] border border-blue-500/10 bg-[#020617] p-6"><h2 className="font-black flex items-center gap-2"><Activity size={18} className="text-blue-400"/> Description</h2><p className="mt-3 text-sm leading-7 text-slate-300 whitespace-pre-wrap">{machine.description}</p></section>}

    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Field label="Rated Capacity" value={`${n(machine.capacity).toLocaleString()} ${machine.capacityUnit || "kW"}`}/>
      <Field label="Current Running Load" value={`${n(machine.currentRunningLoad).toLocaleString()} ${machine.loadUnit || "kW"}`}/>
      <Field label="Live Utilization" value={`${stats.utilization.toFixed(1)}%`}/>
      <Field label="Normal Load Factor" value={`${n(machine.normalLoadFactor).toFixed(1)}%`}/>
      <Field label="Status" value={statusLabel}/>
    </section>

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-6"><div className="flex items-center gap-2"><BarChart3 size={18} className="text-yellow-400"/><h2 className="font-black">Machine Performance</h2></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><Metric title="Recorded Energy" value={stats.energyTotal.toLocaleString(undefined,{maximumFractionDigits:2})} unit="kWh" icon={Zap}/><Metric title="Operating Hours" value={stats.hours.toFixed(2)} unit="h" icon={CalendarClock}/><Metric title="Peak Load" value={stats.peak.toFixed(1)} unit={machine.loadUnit || "kW"} icon={Gauge}/><Metric title="Average Load" value={stats.avg.toFixed(1)} unit={machine.loadUnit || "kW"} icon={Activity}/></div></section>

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-6"><div className="flex items-center gap-2"><Wrench size={18} className="text-yellow-400"/><h2 className="font-black">Maintenance & Installation</h2></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-5"><Field label="Installation Date" value={machine.installDate}/><Field label="Last Maintenance" value={machine.lastMaintenance}/><Field label="Next Maintenance" value={machine.nextMaintenance}/><Field label="Maintenance Interval" value={machine.maintenanceIntervalDays ? `${machine.maintenanceIntervalDays} days` : "—"}/></div></section>

    {(machine.notes || machine.imageUrl) && <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-6"><h2 className="font-black">Additional Information</h2>{machine.notes && <div className="mt-4 rounded-xl bg-white/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">Notes</p><p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{machine.notes}</p></div>}{machine.imageUrl && <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 break-all"><ImageIcon size={15}/><span>{machine.imageUrl}</span></div>}</section>}

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Load History</h2><p className="text-xs text-slate-500 mt-1">All saved load/energy records for this machine.</p></div><span className="rounded-full bg-white/5 px-3 py-2 text-[9px] font-black text-slate-400">{logs.length} RECORDS</span></div><div className="overflow-x-auto mt-5"><table className="w-full min-w-[800px]"><thead><tr className="border-b border-white/5">{["Date","Actual Load","Peak","Hours","Energy","Status","Recorded By","Note"].map(label => <th key={label} className="px-3 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">{label}</th>)}</tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-b border-white/[0.04]"><td className="px-3 py-3 text-xs">{log.date || "—"}</td><td className="px-3 py-3 text-xs font-bold text-yellow-300">{n(log.actualLoad)} {machine.loadUnit || "kW"}</td><td className="px-3 py-3 text-xs text-orange-300">{n(log.peakLoad || log.actualLoad).toFixed(1)}</td><td className="px-3 py-3 text-xs">{n(log.operatingHours).toFixed(2)}</td><td className="px-3 py-3 text-xs font-black text-yellow-400">{energy(log).toFixed(2)} kWh</td><td className="px-3 py-3 text-xs">{STATUS[log.status]?.[0] || log.status || "—"}</td><td className="px-3 py-3 text-xs text-slate-400">{log.recordedBy || "—"}</td><td className="px-3 py-3 text-xs text-slate-500 max-w-xs">{log.note || "—"}</td></tr>)}</tbody></table>{logs.length === 0 && <div className="py-12 text-center text-slate-600 text-xs font-black uppercase tracking-widest">No load history recorded yet</div>}</div></section>
  </div>;
}

function Metric({ title, value, unit, icon: Icon }) {
  return <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"><div className="flex items-center justify-between"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</p><Icon size={16} className="text-yellow-400"/></div><p className="mt-2 text-xl md:text-2xl font-black">{value}<span className="ml-1 text-xs text-slate-500">{unit || ""}</span></p></div>;
}
