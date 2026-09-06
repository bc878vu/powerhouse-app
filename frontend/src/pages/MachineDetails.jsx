import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, AlertTriangle, ArrowLeft, BarChart3, Calendar, CalendarClock, CheckCircle2, Clock3, Cpu, Download, Edit3, Gauge, Image as ImageIcon, Loader2, Printer, RefreshCw, ShieldCheck, Wrench, Zap } from "lucide-react";
import { subscribeToMachine, subscribeToMachineLoadLogs } from "../services/machineService";
import { getMachineImageUrl } from "../services/machineImageService";
import { getUser } from "../utils/auth";

const STATUS = {
  running: ["Running", "text-green-400 bg-green-500/10 border-green-500/20"],
  standby: ["Standby", "text-blue-400 bg-blue-500/10 border-blue-500/20"],
  stopped: ["Stopped", "text-slate-400 bg-slate-500/10 border-slate-500/20"],
  maintenance: ["Maintenance", "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"],
  out_of_service: ["Out of Service", "text-red-400 bg-red-500/10 border-red-500/20"]
};
const ROLE = {
  producer: ["Produces Utility", "text-green-400 bg-green-500/10 border-green-500/20"],
  consumer: ["Consumes Utility", "text-orange-400 bg-orange-500/10 border-orange-500/20"],
  both: ["Produces & Consumes", "text-blue-400 bg-blue-500/10 border-blue-500/20"],
  process: ["Process / Non-Utility", "text-slate-300 bg-white/5 border-white/10"]
};
const n = value => Number(value) || 0;
const energy = log => n(log.energyConsumed) || n(log.actualLoad) * n(log.operatingHours);
const toDate = value => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const dateKey = value => {
  const date = toDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
};
const formatDate = value => {
  if (!value) return "—";
  const date = toDate(value);
  return date ? date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : String(value);
};
const formatNumber = (value, digits = 1) => n(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Field({ label, value, hint }) {
  return <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4 min-w-0"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">{label}</p><p className="mt-1 text-sm font-bold text-white break-words">{value === undefined || value === null || value === "" ? "—" : value}</p>{hint && <p className="mt-1 text-[10px] text-slate-600">{hint}</p>}</div>;
}
function Badge({ children, className = "" }) { return <span className={`inline-flex rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-wide ${className}`}>{children}</span>; }
function Metric({ title, value, unit, icon: Icon, sub }) { return <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4 min-w-0"><div className="flex items-center justify-between gap-2"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</p><Icon size={16} className="text-yellow-400 shrink-0" /></div><p className="mt-2 text-xl md:text-2xl font-black break-words">{value}<span className="ml-1 text-xs text-slate-500">{unit || ""}</span></p>{sub && <p className="mt-1 text-[10px] text-slate-600">{sub}</p>}</div>; }

export default function MachineDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = getUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const [machine, setMachine] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportRange, setReportRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    const unsubMachine = subscribeToMachine(id, item => { setMachine(item); setLoading(false); }, err => { setError(err.message || "Unable to load machine."); setLoading(false); });
    const unsubLogs = subscribeToMachineLoadLogs(items => setLogs(items.filter(item => String(item.machineId) === String(id))), err => setError(err.message || "Unable to load machine activity history."));
    return () => { unsubMachine?.(); unsubLogs?.(); };
  }, [id]);

  const reportLogs = useMemo(() => {
    if (reportRange === "all") return logs;
    const now = new Date();
    const end = customEnd ? new Date(`${customEnd}T23:59:59`) : now;
    let start;
    if (reportRange === "custom") start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(0);
    else {
      const days = Number(reportRange);
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (days - 1));
    }
    return logs.filter(log => {
      const date = toDate(log.date);
      return date && date >= start && date <= end;
    });
  }, [logs, reportRange, customStart, customEnd]);

  const report = useMemo(() => {
    const energyTotal = reportLogs.reduce((sum, log) => sum + energy(log), 0);
    const hours = reportLogs.reduce((sum, log) => sum + n(log.operatingHours), 0);
    const peak = reportLogs.reduce((max, log) => Math.max(max, n(log.peakLoad) || n(log.actualLoad)), 0);
    const avg = reportLogs.length ? reportLogs.reduce((sum, log) => sum + n(log.actualLoad), 0) / reportLogs.length : 0;
    const capacity = n(machine?.capacity);
    const avgUtilization = capacity > 0 ? (avg / capacity) * 100 : 0;
    const liveUtilization = capacity > 0 ? (n(machine?.currentRunningLoad) / capacity) * 100 : 0;
    const loadFactor = capacity > 0 ? (avg / capacity) * 100 : 0;
    const highestEnergy = reportLogs.reduce((best, log) => energy(log) > energy(best) ? log : best, reportLogs[0] || null);
    const highestLoad = reportLogs.reduce((best, log) => n(log.peakLoad || log.actualLoad) > n(best?.peakLoad || best?.actualLoad) ? log : best, reportLogs[0] || null);
    const activeHoursPercent = reportLogs.length ? (reportLogs.filter(log => n(log.operatingHours) > 0).length / reportLogs.length) * 100 : 0;
    const statusCounts = reportLogs.reduce((acc, log) => { const key = log.status || "unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
    const uniqueDays = new Set(reportLogs.map(log => dateKey(log.date)).filter(Boolean)).size;
    return { energyTotal, hours, peak, avg, avgUtilization, liveUtilization, loadFactor, highestEnergy, highestLoad, activeHoursPercent, statusCounts, uniqueDays };
  }, [machine, reportLogs]);

  const trend = useMemo(() => {
    const grouped = reportLogs.reduce((acc, log) => {
      const key = dateKey(log.date) || "Unknown";
      if (!acc[key]) acc[key] = { date: key, energy: 0, load: 0, hours: 0, count: 0 };
      acc[key].energy += energy(log);
      acc[key].load += n(log.actualLoad);
      acc[key].hours += n(log.operatingHours);
      acc[key].count += 1;
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)).slice(-14).map(item => ({ ...item, avgLoad: item.count ? item.load / item.count : 0 }));
  }, [reportLogs]);

  const maxTrendEnergy = Math.max(1, ...trend.map(item => item.energy));
  const maxTrendLoad = Math.max(1, n(machine?.capacity), ...trend.map(item => item.avgLoad));

  const maintenance = useMemo(() => {
    const next = toDate(machine?.nextMaintenance);
    if (!next) return { state: "unknown", label: "Schedule not set", days: null };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    next.setHours(0, 0, 0, 0);
    const days = Math.ceil((next - today) / 86400000);
    if (days < 0) return { state: "overdue", label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`, days };
    if (days <= 7) return { state: "due", label: `Due in ${days} day${days === 1 ? "" : "s"}`, days };
    return { state: "healthy", label: `${days} days remaining`, days };
  }, [machine?.nextMaintenance]);

  const exportReport = () => {
    const rows = [
      ["Machine Report", machine?.name || ""], ["Machine Code", machine?.code || ""], ["Report Period", reportRange === "all" ? "All records" : reportRange === "custom" ? `${customStart || "Start"} to ${customEnd || "Today"}` : `Last ${reportRange} days`],
      [], ["Date", "Actual Load", "Peak Load", "Operating Hours", "Energy (kWh)", "Status", "Recorded By", "Note"],
      ...reportLogs.map(log => [log.date || "", n(log.actualLoad), n(log.peakLoad || log.actualLoad), n(log.operatingHours), Number(energy(log).toFixed(2)), log.status || "", log.recordedBy || "", log.note || ""])
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${(machine?.code || machine?.name || "machine").replace(/[^a-z0-9_-]+/gi, "_")}_report.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const printReport = () => window.print();

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 size={32} className="animate-spin text-yellow-500" /></div>;
  if (!machine) return <div className="space-y-5"><button onClick={() => navigate("/machines")} className="flex items-center gap-2 text-xs font-black text-yellow-400"><ArrowLeft size={16} /> BACK TO MACHINES</button><div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-300 font-bold">{error || "Machine record was not found."}</div></div>;

  const [statusLabel, statusClass] = STATUS[machine.status] || STATUS.standby;
  const [roleLabel, roleClass] = ROLE[machine.utilityRole] || ROLE.process;
  const resolvedImageUrl = getMachineImageUrl(machine.imageUrl);

  return <div className="space-y-6 animate-in fade-in duration-500 print:space-y-4">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 print:hidden">
      <div className="flex items-start gap-3 min-w-0"><button onClick={() => navigate("/machines")} className="w-11 h-11 shrink-0 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"><ArrowLeft size={19} /></button><div className="min-w-0"><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Machine Performance Report</p><h1 className="text-2xl md:text-3xl font-black mt-1 truncate">{machine.name || "Unnamed Machine"}</h1><p className="text-slate-500 text-sm mt-1 break-words">{machine.code || "No code"} · {machine.location || "No area assigned"}</p></div></div>
      <div className="flex flex-wrap gap-2 items-center"><Badge className={statusClass}>{statusLabel}</Badge><button onClick={exportReport} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black flex items-center gap-2"><Download size={15} /> EXPORT</button><button onClick={printReport} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black flex items-center gap-2"><Printer size={15} /> PRINT</button>{isAdmin && <button onClick={() => navigate(`/machines/edit/${machine.id}`)} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black flex items-center gap-2"><Edit3 size={15} /> EDIT MACHINE</button>}</div>
    </div>

    <section className="rounded-[2rem] border border-yellow-500/10 bg-gradient-to-br from-yellow-500/[0.07] via-[#020617] to-blue-500/[0.04] p-5 md:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5"><div><p className="text-[9px] uppercase tracking-widest text-yellow-500 font-black">Operational Report</p><h2 className="text-xl md:text-2xl font-black mt-1">{machine.name} · Live & Historical Performance</h2><p className="text-xs text-slate-500 mt-2">Realtime machine data combined with saved load/activity records.</p></div><div className="flex flex-wrap gap-2 print:hidden"><button onClick={() => setReportRange("all")} className={`px-3 py-2 rounded-xl text-[10px] font-black border ${reportRange === "all" ? "bg-yellow-500 text-black border-yellow-500" : "bg-white/5 border-white/10 text-slate-400"}`}>ALL</button><button onClick={() => setReportRange("7")} className={`px-3 py-2 rounded-xl text-[10px] font-black border ${reportRange === "7" ? "bg-yellow-500 text-black border-yellow-500" : "bg-white/5 border-white/10 text-slate-400"}`}>7 DAYS</button><button onClick={() => setReportRange("30")} className={`px-3 py-2 rounded-xl text-[10px] font-black border ${reportRange === "30" ? "bg-yellow-500 text-black border-yellow-500" : "bg-white/5 border-white/10 text-slate-400"}`}>30 DAYS</button><button onClick={() => setReportRange("90")} className={`px-3 py-2 rounded-xl text-[10px] font-black border ${reportRange === "90" ? "bg-yellow-500 text-black border-yellow-500" : "bg-white/5 border-white/10 text-slate-400"}`}>90 DAYS</button><button onClick={() => setReportRange("custom")} className={`px-3 py-2 rounded-xl text-[10px] font-black border flex items-center gap-1 ${reportRange === "custom" ? "bg-yellow-500 text-black border-yellow-500" : "bg-white/5 border-white/10 text-slate-400"}`}><Calendar size={13} /> CUSTOM</button></div></div>
      {reportRange === "custom" && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-xl print:hidden"><label className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Start date<input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-3 py-3 text-sm text-white" /></label><label className="text-[9px] uppercase tracking-widest text-slate-500 font-black">End date<input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-3 py-3 text-sm text-white" /></label></div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5"><Metric title="Live Load" value={formatNumber(machine.currentRunningLoad)} unit={machine.loadUnit || "kW"} icon={Activity} sub={`${formatNumber(report.liveUtilization)}% of capacity`} /><Metric title="Period Energy" value={formatNumber(report.energyTotal, 2)} unit="kWh" icon={Zap} sub={`${reportLogs.length} recorded events`} /><Metric title="Peak Load" value={formatNumber(report.peak)} unit={machine.loadUnit || "kW"} icon={Gauge} sub={report.highestLoad ? formatDate(report.highestLoad.date) : "No peak record"} /><Metric title="Operating Hours" value={formatNumber(report.hours, 2)} unit="h" icon={Clock3} sub={`${report.uniqueDays} active day${report.uniqueDays === 1 ? "" : "s"}`} /></div>
    </section>

    <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)] gap-5">
      <div className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden min-h-[320px] flex items-center justify-center"><div className="relative w-full min-h-[320px] flex items-center justify-center">{resolvedImageUrl ? <img key={resolvedImageUrl} src={resolvedImageUrl} alt={machine.name || "Machine"} className="w-full h-full max-h-[520px] object-contain bg-black/20" onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement.querySelector(".machine-image-fallback")?.classList.remove("hidden"); }} /> : null}<div className={`machine-image-fallback ${resolvedImageUrl ? "hidden" : ""} text-center text-slate-700 p-10`}><ImageIcon size={56} className="mx-auto" /><p className="mt-3 text-xs font-black uppercase tracking-widest">No machine image available</p>{machine.imageUrl && <p className="text-[10px] text-slate-600 mt-2">The supplied image/share URL could not be loaded.</p>}</div></div></div>
      <div className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-6"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-yellow-500 text-black flex items-center justify-center shrink-0"><Cpu size={21} /></div><div className="min-w-0"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">Machine Overview</p><h2 className="font-black text-lg truncate">{machine.manufacturer || "Manufacturer not specified"}</h2></div></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6"><Field label="Category" value={machine.category} /><Field label="Type" value={machine.type} /><Field label="Model" value={machine.model} /><Field label="Serial Number" value={machine.serialNumber} /><Field label="Department" value={machine.department} /><Field label="Area / Location" value={machine.location} /></div></div>
    </section>

    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Field label="Rated Capacity" value={`${n(machine.capacity).toLocaleString()} ${machine.capacityUnit || "kW"}`} /><Field label="Current Running Load" value={`${n(machine.currentRunningLoad).toLocaleString()} ${machine.loadUnit || "kW"}`} /><Field label="Live Utilization" value={`${report.liveUtilization.toFixed(1)}%`} /><Field label="Normal Load Factor" value={`${n(machine.normalLoadFactor).toFixed(1)}%`} /><Field label="Status" value={statusLabel} /></section>

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><BarChart3 size={18} className="text-yellow-400" /><h2 className="font-black">Performance Analytics</h2></div><p className="text-xs text-slate-500 mt-1">Calculated dynamically from the selected report period.</p></div><Badge className={report.avgUtilization >= 90 ? "text-red-400 bg-red-500/10 border-red-500/20" : report.avgUtilization >= 70 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : "text-green-400 bg-green-500/10 border-green-500/20"}>Avg utilization {report.avgUtilization.toFixed(1)}%</Badge></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><Metric title="Avg Load" value={formatNumber(report.avg)} unit={machine.loadUnit || "kW"} icon={Activity} /><Metric title="Avg Utilization" value={formatNumber(report.avgUtilization)} unit="%" icon={Gauge} /><Metric title="Load Factor" value={formatNumber(report.loadFactor)} unit="%" icon={BarChart3} /><Metric title="Active Records" value={reportLogs.filter(log => n(log.operatingHours) > 0).length} unit="" icon={CheckCircle2} sub={`${report.activeHoursPercent.toFixed(0)}% of records`} /></div></section>

    <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Energy Trend</h2><p className="text-xs text-slate-500 mt-1">Daily energy consumption · latest 14 days in the selected range</p></div><Zap size={18} className="text-yellow-400" /></div><div className="mt-6 space-y-3">{trend.map(item => <div key={item.date} className="grid grid-cols-[72px_minmax(0,1fr)_70px] items-center gap-3"><span className="text-[10px] text-slate-500">{item.date === "Unknown" ? "Unknown" : formatDate(item.date)}</span><div className="h-3 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-yellow-500/70" style={{ width: `${Math.max(3, (item.energy / maxTrendEnergy) * 100)}%` }} /></div><span className="text-right text-[10px] font-black text-yellow-300">{item.energy.toFixed(1)} kWh</span></div>)}{trend.length === 0 && <Empty text="No trend data available for this period" />}</div></div>
      <div className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Load Utilization Trend</h2><p className="text-xs text-slate-500 mt-1">Average recorded load against rated capacity</p></div><Gauge size={18} className="text-blue-400" /></div><div className="mt-6 space-y-3">{trend.map(item => <div key={item.date} className="grid grid-cols-[72px_minmax(0,1fr)_76px] items-center gap-3"><span className="text-[10px] text-slate-500">{item.date === "Unknown" ? "Unknown" : formatDate(item.date)}</span><div className="h-3 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-blue-500/70" style={{ width: `${Math.min(100, Math.max(2, (item.avgLoad / maxTrendLoad) * 100))}%` }} /></div><span className="text-right text-[10px] font-black text-blue-300">{item.avgLoad.toFixed(1)} {machine.loadUnit || "kW"}</span></div>)}{trend.length === 0 && <Empty text="No load trend available for this period" />}</div></div>
    </section>

    <section className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="rounded-2xl border border-white/5 bg-[#020617] p-5"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Highest Energy Record</p>{report.highestEnergy ? <><p className="mt-2 text-2xl font-black text-yellow-300">{energy(report.highestEnergy).toFixed(2)} kWh</p><p className="text-xs text-slate-500 mt-1">{formatDate(report.highestEnergy.date)} · {n(report.highestEnergy.operatingHours).toFixed(2)} h</p></> : <p className="mt-3 text-xs text-slate-600">No record available</p>}</div><div className="rounded-2xl border border-white/5 bg-[#020617] p-5"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Highest Load Record</p>{report.highestLoad ? <><p className="mt-2 text-2xl font-black text-orange-300">{n(report.highestLoad.peakLoad || report.highestLoad.actualLoad).toFixed(1)} {machine.loadUnit || "kW"}</p><p className="text-xs text-slate-500 mt-1">{formatDate(report.highestLoad.date)} · {report.highestLoad.status || "Status not set"}</p></> : <p className="mt-3 text-xs text-slate-600">No record available</p>}</div><div className="rounded-2xl border border-white/5 bg-[#020617] p-5"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Current Capacity Headroom</p><p className="mt-2 text-2xl font-black text-green-300">{Math.max(0, n(machine.capacity) - n(machine.currentRunningLoad)).toFixed(1)} {machine.loadUnit || "kW"}</p><p className="text-xs text-slate-500 mt-1">{Math.max(0, 100 - report.liveUtilization).toFixed(1)}% available capacity</p></div></section>

    <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)] gap-5">
      <div className="rounded-[2rem] border border-yellow-500/10 bg-[#020617] p-5 md:p-6"><div className="flex flex-wrap items-center gap-3"><div><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">Utility Classification</p><h2 className="font-black mt-1">{machine.utilityType || "Electricity"}</h2></div><Badge className={roleClass}>{roleLabel}</Badge></div><p className="text-sm text-slate-400 mt-4">This machine is classified as <strong className="text-white">{roleLabel.toLowerCase()}</strong> for <strong className="text-yellow-400">{machine.utilityType || "Electricity"}</strong>. The classification is stored with the machine record and shown consistently across the machine register and report.</p></div>
      <div className={`rounded-[2rem] border p-5 md:p-6 ${maintenance.state === "overdue" ? "border-red-500/20 bg-red-500/5" : maintenance.state === "due" ? "border-yellow-500/20 bg-yellow-500/5" : "border-white/5 bg-[#020617]"}`}><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">{maintenance.state === "overdue" ? <AlertTriangle size={18} className="text-red-400" /> : maintenance.state === "due" ? <Clock3 size={18} className="text-yellow-400" /> : <ShieldCheck size={18} className="text-green-400" />}</div><div><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Maintenance Health</p><h2 className="font-black mt-1">{maintenance.label}</h2></div></div><div className="grid grid-cols-2 gap-3 mt-4"><Field label="Last Maintenance" value={formatDate(machine.lastMaintenance)} /><Field label="Next Maintenance" value={formatDate(machine.nextMaintenance)} /></div></div>
    </section>

    {machine.description && <section className="rounded-[2rem] border border-blue-500/10 bg-[#020617] p-5 md:p-6"><h2 className="font-black flex items-center gap-2"><Activity size={18} className="text-blue-400" /> Description</h2><p className="mt-3 text-sm leading-7 text-slate-300 whitespace-pre-wrap">{machine.description}</p></section>}

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-6"><div className="flex items-center gap-2"><Wrench size={18} className="text-yellow-400" /><h2 className="font-black">Maintenance & Installation</h2></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5"><Field label="Installation Date" value={formatDate(machine.installDate)} /><Field label="Last Maintenance" value={formatDate(machine.lastMaintenance)} /><Field label="Next Maintenance" value={formatDate(machine.nextMaintenance)} /><Field label="Maintenance Interval" value={machine.maintenanceIntervalDays ? `${machine.maintenanceIntervalDays} days` : "—"} /></div></section>

    {(machine.notes || machine.imageUrl) && <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-6"><h2 className="font-black">Additional Information</h2>{machine.notes && <div className="mt-4 rounded-xl bg-white/[0.03] p-4"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">Notes</p><p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{machine.notes}</p></div>}{machine.imageUrl && <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 break-all"><ImageIcon size={15} className="shrink-0" /><span>{machine.imageUrl}</span></div>}</section>}

    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-6"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-black">Activity & Load History</h2><p className="text-xs text-slate-500 mt-1">Live history from the machine load log records. The table keeps the same report structure and scrolls horizontally on small screens.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-white/5 px-3 py-2 text-[9px] font-black text-slate-400">{reportLogs.length} IN PERIOD</span><span className="rounded-full bg-white/5 px-3 py-2 text-[9px] font-black text-slate-400">{logs.length} TOTAL</span></div></div><div className="overflow-x-auto mt-5"><table className="w-full min-w-[980px]"><thead><tr className="border-b border-white/5">{["Date","Activity","Actual Load","Peak","Hours","Energy","Status","Recorded By","Note"].map(label => <th key={label} className="px-3 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">{label}</th>)}</tr></thead><tbody>{reportLogs.map(log => <tr key={log.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]"><td className="px-3 py-3 text-xs">{formatDate(log.date)}</td><td className="px-3 py-3 text-xs font-black text-blue-300">{log.activityType === "load_record" ? "Load Record" : "Machine Activity"}</td><td className="px-3 py-3 text-xs font-bold text-yellow-300">{n(log.actualLoad)} {machine.loadUnit || "kW"}</td><td className="px-3 py-3 text-xs text-orange-300">{n(log.peakLoad || log.actualLoad).toFixed(1)}</td><td className="px-3 py-3 text-xs">{n(log.operatingHours).toFixed(2)}</td><td className="px-3 py-3 text-xs font-black text-yellow-400">{energy(log).toFixed(2)} kWh</td><td className="px-3 py-3 text-xs">{STATUS[log.status]?.[0] || log.status || "—"}</td><td className="px-3 py-3 text-xs text-slate-400">{log.recordedBy || "—"}</td><td className="px-3 py-3 text-xs text-slate-500 max-w-xs">{log.note || "—"}</td></tr>)}</tbody></table>{reportLogs.length === 0 && <Empty text="No activity/load history recorded for this report period" />}</div></section>

    <footer className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:mt-4"><div><p className="text-[9px] uppercase tracking-widest text-slate-600 font-black">Report Snapshot</p><p className="text-xs text-slate-500 mt-1">Generated {new Date().toLocaleString()} · Realtime data may update while this page remains open.</p></div><div className="flex flex-wrap gap-2 print:hidden"><button onClick={() => window.location.reload()} className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black flex items-center gap-2"><RefreshCw size={13} /> REFRESH</button><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black">BACK TO TOP</button></div></footer>

    <style>{`@media print { body { background: white !important; color: #111827 !important; } .print\\:hidden { display: none !important; } }`}</style>
  </div>;
}

function Empty({ text }) { return <div className="py-12 text-center text-slate-600 text-xs font-black uppercase tracking-widest border border-dashed border-white/5 rounded-2xl">{text}</div>; }
