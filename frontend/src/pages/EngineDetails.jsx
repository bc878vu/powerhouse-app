import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { Activity, ArrowLeft, CalendarDays, Clock3, Download, FileText, Gauge, Info, Wrench, Zap } from "lucide-react";
import { db } from "../firebase";
import { getUser } from "../utils/auth";
import { GENERATOR_MASTER_DATA, GENERATOR_METER_BASELINES } from "../data/generatorMasterData";

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const today = () => new Date().toISOString().slice(0, 10);

function serviceAlert(hours) {
  if (hours >= 220) return { text: "HIGH ALERT", className: "border-red-500/30 bg-red-500/10 text-red-300" };
  if (hours >= 200) return { text: "SERVICE DUE", className: "border-orange-500/30 bg-orange-500/10 text-orange-300" };
  if (hours >= 180) return { text: "SERVICE WATCH", className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300" };
  return { text: "NORMAL", className: "border-green-500/30 bg-green-500/10 text-green-300" };
}

const emptyForm = () => ({ serviceDate: today(), serviceType: "Routine Service", engineHoursAtService: "", technician: "", cost: "", notes: "" });

export default function EngineDetails() {
  const { engineId } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const engine = GENERATOR_MASTER_DATA[engineId];
  const baseline = GENERATOR_METER_BASELINES[engineId] || {};
  const [entries, setEntries] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!engine) return undefined;
    const entriesQuery = query(collection(db, "entries"), orderBy("createdAt", "asc"));
    const unsubscribeEntries = onSnapshot(entriesQuery, snapshot => setEntries(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), error => setMessage(error.message || "Could not load generator history."));
    const unsubscribeServices = onSnapshot(collection(db, "engineServiceLogs"), snapshot => setServices(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), error => setMessage(error.message || "Could not load service history."));
    return () => { unsubscribeEntries(); unsubscribeServices(); };
  }, [engine]);

  const runs = useMemo(() => entries.flatMap(entry => (entry.engines || []).filter(item => item.name === engineId).map(item => ({ ...item, date: entry.date, userName: entry.userName }))), [entries, engineId]);
  const futureRuns = useMemo(() => runs.filter(item => String(item.date || "") >= String(baseline.capturedDate || today())), [runs, baseline.capturedDate]);
  const currentHours = Math.max(n(baseline.runningHours), n(baseline.runningHours) + futureRuns.reduce((sum, item) => sum + n(item.duration), 0), runs.reduce((max, item) => Math.max(max, n(item.currentHours)), 0));
  const currentKwh = Math.max(n(baseline.kwh), n(baseline.kwh) + futureRuns.reduce((sum, item) => sum + n(item.kwh), 0));
  const todayHours = runs.filter(item => item.date === today()).reduce((sum, item) => sum + n(item.duration), 0);
  const previousDate = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }, []);
  const previousDayHours = runs.filter(item => item.date === previousDate).reduce((sum, item) => sum + n(item.duration), 0);
  const engineServices = useMemo(() => services.filter(item => item.engine === engineId).sort((a, b) => String(b.serviceDate || "").localeCompare(String(a.serviceDate || "")) || n(b.engineHoursAtService) - n(a.engineHoursAtService)), [services, engineId]);
  const lastService = engineServices[0];
  const serviceStartHours = lastService ? n(lastService.engineHoursAtService) : n(baseline.runningHours);
  const sinceService = Math.max(0, currentHours - serviceStartHours);
  const alert = serviceAlert(sinceService);

  const dailyHistory = useMemo(() => {
    const grouped = {};
    runs.forEach(item => {
      const date = item.date || "Unknown";
      if (!grouped[date]) grouped[date] = { date, hours: 0, kwh: 0, fuel: 0, entries: 0 };
      grouped[date].hours += n(item.duration);
      grouped[date].kwh += n(item.kwh);
      grouped[date].fuel += n(item.fuel);
      grouped[date].entries += 1;
    });
    return Object.values(grouped).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [runs]);

  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const saveService = async event => {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      await addDoc(collection(db, "engineServiceLogs"), {
        engine: engineId,
        serviceDate: form.serviceDate || today(),
        serviceType: form.serviceType,
        engineHoursAtService: form.engineHoursAtService === "" ? currentHours : n(form.engineHoursAtService),
        technician: form.technician.trim(),
        cost: n(form.cost),
        notes: form.notes.trim(),
        recordedBy: user?.name || user?.email || "Admin",
        recordedById: user?.uid || user?.id || "",
        createdAt: serverTimestamp(),
      });
      setForm(emptyForm());
      setMessage("Service record saved. The service counter now starts from this engine-hour reading.");
    } catch (error) {
      setMessage(error.message || "Could not save service record.");
    } finally { setSaving(false); }
  };

  const exportReport = () => {
    const rows = [
      ["Generator", engine.label], ["Manufacturer", engine.manufacturer], ["Model", engine.model], ["Engine", engine.engineModel],
      ["Serial Number", engine.serialNumber], ["Rated KVA", engine.ratedKVA], ["Rated kW", engine.ratedKW], ["Current Running Hours", currentHours.toFixed(2)], ["Current kWh", currentKwh.toFixed(2)], ["Since Service", sinceService.toFixed(2)], [],
      ["Date", "Runtime h", "kWh", "Fuel L", "Entries"], ...dailyHistory.map(item => [item.date, item.hours.toFixed(2), item.kwh.toFixed(2), item.fuel.toFixed(2), item.entries]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${engineId}-generator-report.csv`; link.click(); URL.revokeObjectURL(url);
  };

  if (!engine) return <div className="p-8 text-white">Generator not found.</div>;
  if (!isAdmin) return <div className="p-8 text-white">Admin access required.</div>;

  const specs = [
    ["Manufacturer", engine.manufacturer], ["Model", engine.model], ["Engine Model", engine.engineModel], ["Serial Number", engine.serialNumber], ["Year", engine.year || "—"],
    ["Country", engine.country || "—"], ["Application", engine.application || "—"], ["Voltage", engine.voltage || "—"], ["Frequency", engine.frequency || "—"], ["RPM", engine.rpm || "—"], ["Battery", engine.battery || "—"], ["Control", engine.control || "—"],
    ["Site Altitude", engine.siteAltitude || "—"], ["Ambient", engine.ambient || "—"], ["Max Mass", engine.maxMass || "—"], ["Power Factor", engine.powerFactor ?? "—"], ["Rated Current", engine.ratedCurrentA ? `${engine.ratedCurrentA} A` : engine.ratedCurrentCalculatedA ? `${engine.ratedCurrentCalculatedA} A (calculated)` : "—"], ["Connection", engine.generatorConnection || "—"], ["Enclosure", engine.enclosure || "—"], ["Insulation", engine.insulationClass || "—"],
  ];

  const statCards = [
    ["Current Running", currentHours, "h", Clock3], ["Today", todayHours, "h", CalendarDays], ["Previous Day", previousDayHours, "h", Activity], ["Current kWh", currentKwh, "", Zap], ["Since Service", sinceService, "h", Wrench],
  ];

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate("/fuel-management")} className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-xs font-black text-slate-200"><ArrowLeft size={15} /> BACK TO FUEL</button>
        <button onClick={exportReport} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black"><Download size={15} /> GENERATOR REPORT</button>
      </div>

      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div><p className="text-[9px] font-black uppercase tracking-[.25em] text-yellow-500">Generator Card / Engine Log</p><h1 className="mt-1 text-3xl font-black md:text-4xl">{engine.label}</h1><p className="mt-1 text-slate-500">{engine.manufacturer} • {engine.model} • complete operating and maintenance record</p></div>
          <span className={`rounded-full border px-4 py-2 text-[9px] font-black ${alert.className}`}>{alert.text}</span>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">{statCards.map(([title, value, unit, Icon]) => <div key={title} className="rounded-2xl bg-white/[.03] p-4"><Icon size={16} className="text-yellow-400" /><p className="mt-3 text-[8px] font-black uppercase tracking-widest text-slate-500">{title}</p><p className="mt-1 text-2xl font-black">{value.toFixed(2)}<span className="ml-1 text-[10px] text-slate-500">{unit}</span></p></div>)}</div>
      </section>

      {message && <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm font-bold text-yellow-300">{message}</div>}

      <section className="rounded-[2rem] bg-white p-5 text-slate-900 md:p-7">
        <div className="flex items-center gap-2"><Info size={18} className="text-yellow-600" /><h2 className="text-xl font-black">Complete Generator Data</h2></div>
        <p className="mt-1 text-xs text-slate-500">All available nameplate, technical and operational data for this generator.</p>
        <div className="mt-5 grid gap-x-8 gap-y-0 md:grid-cols-2 lg:grid-cols-3">{specs.map(([label, value]) => <div key={label} className="flex min-h-[54px] items-center justify-between gap-3 border-b border-slate-100 py-3"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><span className="max-w-[62%] text-right text-xs font-black">{String(value)}</span></div>)}</div>
        <div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current Meter Baseline</p><p className="mt-2 text-2xl font-black">{n(baseline.runningHours).toFixed(2)} h</p><p className="mt-1 text-xs text-slate-500">Captured {baseline.capturedDate || "—"}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Baseline Energy</p><p className="mt-2 text-2xl font-black">{n(baseline.kwh).toLocaleString()} kWh</p><p className="mt-1 text-xs text-slate-500">Current calculated meter: {currentKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh</p></div></div>
        {engine.rating50Hz && <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">50 Hz Rating</p><p className="mt-2 text-sm font-bold">{engine.rating50Hz}</p></div>}
        {engine.rating60Hz && <div className="mt-3 rounded-2xl bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">60 Hz Rating</p><p className="mt-2 text-sm font-bold">{engine.rating60Hz}</p></div>}
        {engine.technicalNotes && <div className="mt-3 rounded-2xl bg-yellow-50 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-yellow-700">Technical Notes</p><p className="mt-2 text-sm font-bold text-slate-800">{engine.technicalNotes}</p></div>}
      </section>

      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7">
        <div className="flex items-center gap-2"><FileText size={18} className="text-yellow-400" /><h2 className="text-xl font-black">Generator Operating Log</h2></div>
        <p className="mt-1 text-xs text-slate-500">Every fuel entry recorded for this generator, including runtime, meter, kWh, load and diesel.</p>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[1050px]"><thead><tr className="border-b border-white/5">{["Date","Recorded By","Previous Meter","Current Meter","Runtime","kWh","Load","Fuel","Start"].map(h => <th key={h} className="px-3 py-3 text-left text-[8px] font-black uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{runs.slice().reverse().map((item, index) => <tr key={`${item.date}-${item.startTime}-${index}`} className="border-b border-white/[.04]"><td className="px-3 py-3 text-xs font-bold">{item.date || "—"}</td><td className="px-3 py-3 text-xs text-slate-400">{item.userName || "—"}</td><td className="px-3 py-3 text-xs">{n(item.previousHours).toFixed(2)}</td><td className="px-3 py-3 text-xs">{n(item.currentHours).toFixed(2)}</td><td className="px-3 py-3 text-xs font-black">{n(item.duration).toFixed(2)} h</td><td className="px-3 py-3 text-xs text-blue-300">{n(item.kwh).toFixed(2)}</td><td className="px-3 py-3 text-xs text-slate-400">{n(item.loadPercent).toFixed(1)}%</td><td className="px-3 py-3 text-xs font-black text-yellow-400">{n(item.fuel).toFixed(2)} L</td><td className="px-3 py-3 text-xs text-slate-400">{item.startTime || "—"}</td></tr>)}</tbody></table>{!runs.length && <div className="py-12 text-center text-xs uppercase text-slate-600">No operating logs yet.</div>}</div>
      </section>

      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7">
        <div className="flex items-center gap-2"><Wrench size={18} className="text-yellow-400" /><h2 className="text-xl font-black">Maintenance / Service Logs</h2></div>
        <p className="mt-1 text-xs text-slate-500">Record oil service, filter changes, inspection, repair and major maintenance for this generator.</p>
        <form onSubmit={saveService} className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Service Date</label><input type="date" value={form.serviceDate} onChange={e => updateForm("serviceDate", e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" /></div>
          <div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Type</label><select value={form.serviceType} onChange={e => updateForm("serviceType", e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"><option>Routine Service</option><option>Oil Change</option><option>Filter Change</option><option>Inspection</option><option>Repair</option><option>Major Maintenance</option></select></div>
          <div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Engine Hours</label><input type="number" min="0" step=".01" placeholder={currentHours.toFixed(2)} value={form.engineHoursAtService} onChange={e => updateForm("engineHoursAtService", e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" /></div>
          <div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Technician</label><input value={form.technician} onChange={e => updateForm("technician", e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" /></div>
          <div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Cost</label><input type="number" min="0" step=".01" value={form.cost} onChange={e => updateForm("cost", e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" /></div>
          <button disabled={saving} className="self-end rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black disabled:opacity-50">{saving ? "Saving..." : "SAVE SERVICE"}</button>
          <div className="md:col-span-2 lg:col-span-6"><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Notes</label><textarea rows="3" value={form.notes} onChange={e => updateForm("notes", e.target.value)} placeholder="Oil grade, filters, parts, fault, observations..." className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" /></div>
        </form>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[850px]"><thead><tr className="border-b border-white/5">{["Date","Type","Engine Hours","Technician","Cost","Notes"].map(h => <th key={h} className="px-3 py-3 text-left text-[8px] font-black uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{engineServices.map(item => <tr key={item.id} className="border-b border-white/[.04]"><td className="px-3 py-3 text-xs">{item.serviceDate}</td><td className="px-3 py-3 text-xs font-black text-yellow-400">{item.serviceType}</td><td className="px-3 py-3 text-xs">{n(item.engineHoursAtService).toFixed(2)} h</td><td className="px-3 py-3 text-xs text-slate-400">{item.technician || "—"}</td><td className="px-3 py-3 text-xs">{n(item.cost).toFixed(2)}</td><td className="px-3 py-3 text-xs text-slate-400">{item.notes || "—"}</td></tr>)}</tbody></table>{!engineServices.length && <div className="py-10 text-center text-xs uppercase text-slate-600">No maintenance records yet.</div>}</div>
      </section>
    </div>
  );
}
