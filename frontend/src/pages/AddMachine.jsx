import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Cpu, Loader2, MapPin, Save, Zap } from "lucide-react";
import { addMachine, subscribeToMachines, updateMachine } from "../services/machineService";

const CATEGORIES = ["General", "Generator", "Compressor", "Boiler", "Motor", "Pump", "HVAC", "Production", "Electrical", "Packaging", "Cooling", "Utility", "Other"];
const TYPES = ["Generator", "Air Compressor", "Screw Compressor", "Motor", "Electric Motor", "Pump", "Water Pump", "Boiler", "Chiller", "Cooling Tower", "AHU", "HVAC Unit", "Transformer", "UPS", "Panel / MCC", "Production Machine", "Packaging Machine", "Lifter", "Fan", "Blower", "Other"];
const EMPTY = { name: "", code: "", category: "General", type: "", manufacturer: "", model: "", serialNumber: "", location: "", department: "Power House", capacity: "", capacityUnit: "kW", status: "standby", currentRunningLoad: "", loadUnit: "kW", normalLoadFactor: "", installDate: "", lastMaintenance: "", nextMaintenance: "", maintenanceIntervalDays: "", notes: "" };
const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500/60 placeholder:text-slate-600";
const labelClass = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";

export default function AddMachine() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToMachines(items => {
      const machine = items.find(item => item.id === id);
      if (machine) setForm({ ...EMPTY, ...machine });
      setLoading(false);
    }, err => { setError(err.message || "Unable to load machine."); setLoading(false); });
    return () => unsubscribe?.();
  }, [id]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const customCategory = form.category && !CATEGORIES.includes(form.category);
  const customType = form.type && !TYPES.includes(form.type);
  const utilization = Number(form.capacity) > 0 ? (Number(form.currentRunningLoad || 0) / Number(form.capacity)) * 100 : 0;

  const submit = async event => {
    event.preventDefault(); setError(""); setMessage("");
    if (!form.name.trim() || !form.code.trim()) return setError("Machine name and machine code are required.");
    if (Number(form.capacity || 0) > 0 && Number(form.currentRunningLoad || 0) > Number(form.capacity || 0)) return setError("Actual running load cannot exceed rated load.");
    setSaving(true);
    try {
      const data = { ...form, name: form.name.trim(), code: form.code.trim().toUpperCase(), category: form.category.trim() || "General", type: form.type.trim() || "General" };
      if (id) { await updateMachine(id, data); setMessage("Machine updated successfully."); }
      else { await addMachine(data); setMessage("Machine added successfully."); setForm(EMPTY); }
      window.setTimeout(() => navigate("/machines"), 700);
    } catch (err) { setError(err.message || "Could not save machine."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 size={32} className="animate-spin text-yellow-500"/></div>;

  return <div className="space-y-6 animate-in fade-in duration-500">
    <div className="flex items-center gap-4"><button onClick={() => navigate("/machines")} className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"><ArrowLeft size={19}/></button><div className="w-12 h-12 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Cpu size={24}/></div><div><h1 className="text-2xl md:text-3xl font-black">{id ? "Edit Machine" : "Add Machine"}</h1><p className="text-slate-500 text-sm mt-1">Register complete machine identity, area, rated load, actual running load and maintenance profile.</p></div></div>
    {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">{error}</div>}
    {message && <div className="flex items-center gap-2 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-300"><CheckCircle2 size={17}/>{message}</div>}

    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7"><h2 className="font-black">Basic Information</h2><p className="text-xs text-slate-500 mt-1">Choose a pre-defined category/type or create your own value.</p><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
        <div><label className={labelClass}>Machine Name *</label><input required className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Air Compressor 01"/></div>
        <div><label className={labelClass}>Machine Code *</label><input required className={inputClass} value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="e.g. MC-001"/></div>
        <div><label className={labelClass}>Category</label><select className={inputClass} value={customCategory ? "__custom__" : form.category} onChange={e => set("category", e.target.value === "__custom__" ? "" : e.target.value)}>{CATEGORIES.map(x => <option key={x}>{x}</option>)}<option value="__custom__">+ Create Custom Category</option></select>{(customCategory || !form.category) && <input className={inputClass + " mt-2"} value={form.category} onChange={e => set("category", e.target.value)} placeholder="Type custom category"/>}</div>
        <div><label className={labelClass}>Machine Type</label><select className={inputClass} value={customType ? "__custom__" : form.type} onChange={e => set("type", e.target.value === "__custom__" ? "" : e.target.value)}><option value="">Select type</option>{TYPES.map(x => <option key={x}>{x}</option>)}<option value="__custom__">+ Create Custom Type</option></select>{(customType || (!form.type && form.type !== undefined)) && <input className={inputClass + " mt-2"} value={form.type} onChange={e => set("type", e.target.value)} placeholder="Type custom machine type"/>}</div>
        <div><label className={labelClass}>Manufacturer</label><input className={inputClass} value={form.manufacturer} onChange={e => set("manufacturer", e.target.value)} placeholder="Manufacturer"/></div>
        <div><label className={labelClass}>Model</label><input className={inputClass} value={form.model} onChange={e => set("model", e.target.value)} placeholder="Model number"/></div>
        <div><label className={labelClass}>Serial Number</label><input className={inputClass} value={form.serialNumber} onChange={e => set("serialNumber", e.target.value)} placeholder="Serial number"/></div>
        <div><label className={labelClass}>Area / Location</label><div className="relative"><MapPin size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"/><input className={inputClass + " pl-10"} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Power House / Floor / Area"/></div></div>
        <div><label className={labelClass}>Department</label><input className={inputClass} value={form.department} onChange={e => set("department", e.target.value)} placeholder="Department"/></div>
      </div></section>

      <section className="rounded-[2rem] border border-yellow-500/10 bg-[#020617] p-5 md:p-7"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center"><Zap size={18}/></div><div><h2 className="font-black">Load Configuration</h2><p className="text-xs text-slate-500 mt-1">These values drive the total rated load, actual running load and utilization calculations.</p></div></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
        <div><label className={labelClass}>Rated / Total Load *</label><input required type="number" min="0" step="0.01" className={inputClass} value={form.capacity} onChange={e => set("capacity", e.target.value)} placeholder="e.g. 250"/></div>
        <div><label className={labelClass}>Capacity Unit</label><select className={inputClass} value={form.capacityUnit} onChange={e => set("capacityUnit", e.target.value)}><option>kW</option><option>kVA</option><option>HP</option><option>TR</option><option>L/min</option><option>m³/h</option><option>Other</option></select></div>
        <div><label className={labelClass}>Actual Running Load</label><input type="number" min="0" step="0.01" className={inputClass} value={form.currentRunningLoad} onChange={e => set("currentRunningLoad", e.target.value)} placeholder="Current actual load"/></div>
        <div><label className={labelClass}>Load Unit</label><select className={inputClass} value={form.loadUnit} onChange={e => set("loadUnit", e.target.value)}><option>kW</option><option>kVA</option><option>HP</option><option>TR</option><option>Other</option></select></div>
        <div><label className={labelClass}>Normal Load Factor (%)</label><input type="number" min="0" max="100" step="0.1" className={inputClass} value={form.normalLoadFactor} onChange={e => set("normalLoadFactor", e.target.value)} placeholder="e.g. 75"/></div>
        <div><label className={labelClass}>Current Status</label><select className={inputClass} value={form.status} onChange={e => set("status", e.target.value)}><option value="running">Running</option><option value="standby">Standby</option><option value="stopped">Stopped</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of Service</option></select></div>
        <div><label className={labelClass}>Installation Date</label><input type="date" className={inputClass} value={form.installDate || ""} onChange={e => set("installDate", e.target.value)}/></div>
        <div className="rounded-xl border border-green-500/10 bg-green-500/5 p-4"><p className="text-[9px] uppercase tracking-widest text-green-400 font-black">Live Utilization</p><p className="text-2xl font-black mt-1">{utilization.toFixed(1)}%</p><p className="text-[9px] text-slate-600 mt-1">Actual running ÷ rated load</p></div>
      </div></section>

      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7"><h2 className="font-black">Maintenance Information</h2><p className="text-xs text-slate-500 mt-1">Dates are used by the Machines Dashboard to calculate maintenance due.</p><div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6"><div><label className={labelClass}>Last Maintenance</label><input type="date" className={inputClass} value={form.lastMaintenance || ""} onChange={e => set("lastMaintenance", e.target.value)}/></div><div><label className={labelClass}>Next Maintenance</label><input type="date" className={inputClass} value={form.nextMaintenance || ""} onChange={e => set("nextMaintenance", e.target.value)}/></div><div><label className={labelClass}>Maintenance Interval (Days)</label><input type="number" min="0" className={inputClass} value={form.maintenanceIntervalDays} onChange={e => set("maintenanceIntervalDays", e.target.value)} placeholder="e.g. 90"/></div></div><div className="mt-5"><label className={labelClass}>Notes</label><textarea rows="4" className={inputClass} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Safety notes, machine details, remarks..."/></div></section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3"><button type="button" onClick={() => navigate("/machines")} className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-xs font-black uppercase">Cancel</button><button disabled={saving} className="flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black uppercase disabled:opacity-60"><Save size={17}/>{saving ? "Saving..." : id ? "Update Machine" : "Save Machine"}</button></div>
    </form>
  </div>;
}
