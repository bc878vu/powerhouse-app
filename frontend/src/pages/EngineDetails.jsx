import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Activity, ArrowLeft, CalendarDays, Clock3, Download, FileText, Gauge, Wrench, Zap } from "lucide-react";
import { db } from "../firebase";
import { getUser } from "../utils/auth";

const ENGINES = {
  "1400kva": {
    label: "1400 KVA", ratedKVA: 1400, ratedKW: 1120, model: "Cummins C1250D2R",
    manufacturer: "Cummins Power Generation", engineModel: "Cummins KTA50-G3", year: 2008,
    serialNumber: "G08S702950", country: "Singapore", application: "Prime", voltage: "380 / 480 V",
    frequency: "50 / 60 Hz", rpm: "1500 / 1800 RPM", battery: "24 VDC", control: "PCC3100",
    siteAltitude: "600 / 1400 mASL", ambient: "45 °C", maxMass: "18160 kg",
    rating50Hz: "Prime 1005 kW / 1256 kVA; Standby 1120 kW / 1400 kVA",
    rating60Hz: "Prime 1120 kW / 1400 kVA; Standby 1270 kW / ~1588 kVA",
    notes: "16-cylinder KTA50-G3, turbocharged/aftercooled; 50.3 L approx.; oil 178 L; radiator coolant 470 L."
  },
  "1020kva": {
    label: "1020 KVA", ratedKVA: 1020, ratedKW: 816, model: "ESMO G.M.S.",
    manufacturer: "ESMO", engineModel: "KTA50 series (engine plate worn; exact subtype to verify)", year: 1991,
    serialNumber: "S21109.3", country: "France", application: "Continuous / S1", voltage: "400 V",
    frequency: "50 Hz", rpm: "1500 RPM", battery: "Not visible", control: "Not visible",
    siteAltitude: "1524 m max", ambient: "25 °C max", maxMass: "Not available",
    rating50Hz: "1020 kVA at PF 0.8; calculated ~816 kW",
    rating60Hz: "Not applicable / not shown",
    notes: "3-phase, S-STAR connection, IP23, insulation class H, excitation 40 V; rated current calculated ~1472 A."
  },
  "650kva": {
    label: "650 KVA", ratedKVA: 650, ratedKW: 520, model: "Caterpillar 650",
    manufacturer: "Caterpillar", engineModel: "CAT C18", year: 2006,
    serialNumber: "CAT00000EG4C02045", country: "U.K.", application: "Standby", voltage: "400 / 230 V",
    frequency: "50 Hz", rpm: "1500 RPM", battery: "Not visible", control: "Not visible",
    siteAltitude: "1524 m max", ambient: "25 °C max", maxMass: "Not available",
    rating50Hz: "650 kVA / 520 kW / PF 0.80 / 938 A",
    rating60Hz: "Not shown",
    notes: "Generator L7A00869, S-STAR, IP23, insulation H, excitation 40 V; ISO 8528 marking present."
  }
};

// Current physical meter readings supplied by operations and kept separate from historical daily-entry totals.
const METER = {
  "1400kva": { runningHours: 22442.4, kwh: 1771094, source: "Current meter reading" },
  "1020kva": { runningHours: 2574.50, kwh: 932820, source: "Current meter reading" },
  "650kva": { runningHours: 10017.8, kwh: 203857, source: "Current meter reading" }
};

const n = (value) => Number(value) || 0;
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
  const engine = ENGINES[engineId];
  const meter = METER[engineId];
  const [entries, setEntries] = useState([]); const [services, setServices] = useState([]); const [form, setForm] = useState(emptyForm); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");

  useEffect(() => {
    if (!engine) return undefined;
    const unsubEntries = onSnapshot(collection(db, "entries"), snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setMessage(e.message || "Could not load engine history."));
    const unsubServices = onSnapshot(collection(db, "engineServiceLogs"), snap => setServices(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setMessage(e.message || "Could not load service history."));
    return () => { unsubEntries(); unsubServices(); };
  }, [engine]);

  const runs = useMemo(() => entries.flatMap(entry => (entry.engines || []).filter(item => item.name === engineId).map(item => ({ ...item, date: entry.date, userName: entry.userName }))), [entries, engineId]);
  const historicalHours = useMemo(() => runs.reduce((sum, item) => sum + n(item.duration), 0), [runs]);
  const historicalKwh = useMemo(() => runs.reduce((sum, item) => sum + n(item.kwh), 0), [runs]);
  const displayHours = meter?.runningHours ?? historicalHours;
  const displayKwh = meter?.kwh ?? historicalKwh;
  const historyHoursToday = useMemo(() => runs.filter(x => x.date === today()).reduce((s,x) => s+n(x.duration),0), [runs]);
  const engineServices = useMemo(() => services.filter(item => item.engine === engineId).sort((a,b) => String(b.serviceDate || "").localeCompare(String(a.serviceDate || "")) || n(b.engineHoursAtService)-n(a.engineHoursAtService)), [services, engineId]);
  const lastService = engineServices[0];
  const serviceStartHours = lastService ? n(lastService.engineHoursAtService) : displayHours;
  const sinceService = lastService ? Math.max(0, displayHours - serviceStartHours) : 0;
  const alert = serviceAlert(sinceService);
  const dailyHistory = useMemo(() => { const grouped={}; runs.forEach(item=>{const d=item.date||"Unknown"; if(!grouped[d]) grouped[d]={date:d,hours:0,kwh:0,fuel:0}; grouped[d].hours+=n(item.duration); grouped[d].kwh+=n(item.kwh); grouped[d].fuel+=n(item.fuel);}); return Object.values(grouped).sort((a,b)=>String(a.date).localeCompare(String(b.date))); }, [runs]);
  const updateForm = (key,value) => setForm(current => ({...current,[key]:value}));
  const saveService = async event => { event.preventDefault(); setSaving(true); setMessage(""); try { const serviceHours=form.engineHoursAtService===""?displayHours:n(form.engineHoursAtService); await addDoc(collection(db,"engineServiceLogs"),{engine:engineId,serviceDate:form.serviceDate||today(),serviceType:form.serviceType,engineHoursAtService:serviceHours,technician:form.technician.trim(),cost:n(form.cost),notes:form.notes.trim(),recordedBy:user?.name||user?.email||"Admin",recordedById:user?.uid||user?.id||"",createdAt:serverTimestamp()}); setForm(emptyForm()); setMessage("Service record saved. The service-hour counter now starts from this engine-hour reading."); } catch(e){setMessage(e.message||"Could not save service record.");} finally{setSaving(false);} };

  const exportReport = () => {
    const rows = [["Engine",engine.label],["Manufacturer",engine.manufacturer],["Model",engine.model],["Engine",engine.engineModel],["Year",engine.year],["Serial Number",engine.serialNumber],["Rated KVA",engine.ratedKVA],["Rated kW",engine.ratedKW],["Voltage",engine.voltage],["Frequency",engine.frequency],["RPM",engine.rpm],["Current Meter Hours",displayHours.toFixed(2)],["Current Meter kWh",displayKwh.toFixed(2)],["Historical Entry Hours",historicalHours.toFixed(2)],["Historical Entry kWh",historicalKwh.toFixed(2)],["Since Last Service",sinceService.toFixed(2)],[],["Date","Running Hours","kWh","Fuel L"],...dailyHistory.map(x=>[x.date,x.hours.toFixed(2),x.kwh.toFixed(2),x.fuel.toFixed(2)])];
    const csv=rows.map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(",")).join("\n"); const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const link=document.createElement("a"); link.href=url; link.download=`${engineId}-engine-report.csv`; link.click(); URL.revokeObjectURL(url);
  };
  if(!engine) return <div className="p-8 text-white">Engine not found.</div>;
  if(!isAdmin) return <div className="p-8 text-white">Admin access required.</div>;
  const statCards=[["Current Running",displayHours,"h",Clock3],["Today From Logs",historyHoursToday,"h",CalendarDays],["Current Meter kWh",displayKwh,"",Zap],["Historical kWh",historicalKwh,"",Activity],["Since Service",sinceService,"h",Wrench]];
  const specRows=[["Manufacturer",engine.manufacturer],["Model",engine.model],["Engine",engine.engineModel],["Year",engine.year],["Serial",engine.serialNumber],["Rated",`${engine.ratedKVA} KVA / ${engine.ratedKW} kW`],["Voltage",engine.voltage],["Frequency",engine.frequency],["Speed",engine.rpm],["Application",engine.application],["Country",engine.country],["Altitude",engine.siteAltitude],["Ambient",engine.ambient],["Rating 50 Hz",engine.rating50Hz],["Rating 60 Hz",engine.rating60Hz],["Technical Notes",engine.notes]];
  return <div className="space-y-5 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><button onClick={()=>navigate("/fuel-management")} className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-xs font-black text-slate-200"><ArrowLeft size={15}/> BACK TO FUEL</button><button onClick={exportReport} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black"><Download size={15}/> ENGINE REPORT</button></div>
    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.25em] text-yellow-500">Engine Control Center</p><h1 className="mt-1 text-3xl font-black md:text-4xl">{engine.label}</h1><p className="mt-1 text-slate-500">{engine.manufacturer} • {engine.model} • {engine.engineModel}</p><p className="mt-2 text-xs text-slate-500">Meter baseline: {meter?.source || "Historical entry totals"}</p></div><span className={`rounded-full border px-4 py-2 text-[9px] font-black ${alert.className}`}>{alert.text}</span></div><div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">{statCards.map(([title,value,unit,Icon])=><div key={title} className="rounded-2xl bg-white/[.03] p-4"><Icon size={16} className="text-yellow-400"/><p className="mt-3 text-[8px] font-black uppercase tracking-widest text-slate-500">{title}</p><p className="mt-1 text-2xl font-black">{Number(value).toFixed(2)}<span className="ml-1 text-[10px] text-slate-500">{unit}</span></p></div>)}</div></section>
    {message&&<div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm font-bold text-yellow-300">{message}</div>}
    <div className="grid gap-5 lg:grid-cols-3"><section className="rounded-[2rem] bg-white p-5 text-slate-900"><div className="flex items-center gap-2"><Gauge size={17} className="text-yellow-600"/><h2 className="font-black">Full Specifications</h2></div>{specRows.map(([label,value])=><div key={label} className="flex justify-between gap-3 border-b border-slate-100 py-2.5"><span className="text-[8px] font-black uppercase text-slate-400">{label}</span><span className="max-w-[65%] text-right text-[11px] font-black">{value}</span></div>)}</section>
      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 lg:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-black">Runtime / Fuel History</h2><p className="mt-1 text-xs text-slate-500">Daily operating history from Firestore fuel entries.</p></div><FileText size={18} className="text-yellow-400"/></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px]"><thead><tr className="border-b border-white/5">{["Date","Hours","kWh","Fuel","Load"].map(h=><th key={h} className="px-3 py-3 text-left text-[8px] font-black uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{dailyHistory.slice().reverse().map(item=>{const load=item.hours>0&&item.kwh>0?Math.min(100,(item.kwh/(engine.ratedKW*item.hours))*100):0;return <tr key={item.date} className="border-b border-white/[.04]"><td className="px-3 py-3 text-xs font-bold">{item.date}</td><td className="px-3 py-3 text-xs">{item.hours.toFixed(2)} h</td><td className="px-3 py-3 text-xs text-blue-300">{item.kwh.toFixed(2)}</td><td className="px-3 py-3 text-xs font-black text-yellow-400">{item.fuel.toFixed(2)} L</td><td className="px-3 py-3 text-xs text-slate-400">{load.toFixed(1)}%</td></tr>})}</tbody></table>{!dailyHistory.length&&<div className="py-12 text-center text-xs uppercase text-slate-600">No daily history yet.</div>}</div></section></div>
    <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7"><div className="flex items-center gap-2"><Wrench size={18} className="text-yellow-400"/><h2 className="text-xl font-black">Maintenance / Service Logs</h2></div><p className="mt-1 text-xs text-slate-500">Record oil service, filters, inspection, repair and major maintenance.</p><form onSubmit={saveService} className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6"><div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Service Date</label><input type="date" value={form.serviceDate} onChange={e=>updateForm("serviceDate",e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"/></div><div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Type</label><select value={form.serviceType} onChange={e=>updateForm("serviceType",e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"><option>Routine Service</option><option>Oil Change</option><option>Filter Change</option><option>Inspection</option><option>Repair</option><option>Major Maintenance</option></select></div><div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Engine Hours</label><input type="number" min="0" step=".01" placeholder={displayHours.toFixed(2)} value={form.engineHoursAtService} onChange={e=>updateForm("engineHoursAtService",e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"/></div><div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Technician</label><input value={form.technician} onChange={e=>updateForm("technician",e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"/></div><div><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Cost</label><input type="number" min="0" step=".01" value={form.cost} onChange={e=>updateForm("cost",e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"/></div><button disabled={saving} className="self-end rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black disabled:opacity-50">{saving?"Saving...":"SAVE SERVICE"}</button><div className="md:col-span-2 lg:col-span-6"><label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500">Notes</label><textarea rows="3" value={form.notes} onChange={e=>updateForm("notes",e.target.value)} placeholder="Oil grade, filters, parts, fault, observations..." className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"/></div></form><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[850px]"><thead><tr className="border-b border-white/5">{["Date","Type","Engine Hours","Technician","Cost","Notes"].map(h=><th key={h} className="px-3 py-3 text-left text-[8px] font-black uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{engineServices.map(item=><tr key={item.id} className="border-b border-white/[.04]"><td className="px-3 py-3 text-xs">{item.serviceDate}</td><td className="px-3 py-3 text-xs font-black text-yellow-400">{item.serviceType}</td><td className="px-3 py-3 text-xs">{n(item.engineHoursAtService).toFixed(2)} h</td><td className="px-3 py-3 text-xs text-slate-400">{item.technician||"—"}</td><td className="px-3 py-3 text-xs">{n(item.cost).toFixed(2)}</td><td className="px-3 py-3 text-xs text-slate-400">{item.notes||"—"}</td></tr>)}</tbody></table>{!engineServices.length&&<div className="py-10 text-center text-xs uppercase text-slate-600">No maintenance records yet.</div>}</div></section>
  </div>;
}