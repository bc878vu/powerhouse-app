import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Cpu, Save, Loader2, CheckCircle2 } from "lucide-react";
import { addMachine, subscribeToMachines, updateMachine } from "../services/machineService";

const EMPTY = {
  name: "",
  code: "",
  category: "General",
  type: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  location: "",
  department: "Power House",
  capacity: "",
  capacityUnit: "kW",
  status: "standby",
  installDate: "",
  lastMaintenance: "",
  nextMaintenance: "",
  maintenanceIntervalDays: "",
  notes: ""
};

const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-yellow-500/60 focus:bg-white/[0.06] placeholder:text-slate-600";
const labelClass = "mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500";

export default function AddMachine() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return undefined;
    const unsubscribe = subscribeToMachines((items) => {
      const machine = items.find((item) => item.id === id);
      if (machine) setForm({ ...EMPTY, ...machine });
      setLoading(false);
    }, (err) => {
      setError(err.message || "Unable to load machine.");
      setLoading(false);
    });
    return () => unsubscribe?.();
  }, [id]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!form.name.trim()) return setError("Machine name is required.");
    if (!form.code.trim()) return setError("Machine code is required.");

    setSaving(true);
    try {
      if (id) {
        await updateMachine(id, form);
        setMessage("Machine updated successfully.");
      } else {
        await addMachine(form);
        setMessage("Machine added successfully.");
        setForm(EMPTY);
      }
      window.setTimeout(() => navigate("/machines"), 700);
    } catch (err) {
      setError(err.message || "Could not save machine.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="animate-spin text-yellow-500" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/machines")} className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white"><ArrowLeft size={19} /></button>
          <div className="w-12 h-12 rounded-2xl bg-yellow-500 flex items-center justify-center text-black"><Cpu size={24} /></div>
          <div><h1 className="text-2xl md:text-3xl font-black text-white">{id ? "Edit Machine" : "Add Machine"}</h1><p className="text-slate-500 text-sm mt-1">Save complete machine information in Firestore</p></div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{error}</div>}
      {message && <div className="flex items-center gap-2 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-400"><CheckCircle2 size={17}/>{message}</div>}

      <form onSubmit={submit} className="space-y-5">
        <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7">
          <div className="mb-6"><h2 className="text-white font-black">Basic Information</h2><p className="text-slate-500 text-xs mt-1">Identify the machine and its operational category.</p></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div><label className={labelClass}>Machine Name *</label><input className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Air Compressor 01" /></div>
            <div><label className={labelClass}>Machine Code *</label><input className={inputClass} value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="e.g. MC-001" /></div>
            <div><label className={labelClass}>Category</label><select className={inputClass} value={form.category} onChange={e => set("category", e.target.value)}><option>General</option><option>Generator</option><option>Compressor</option><option>Boiler</option><option>Motor</option><option>Pump</option><option>HVAC</option><option>Production</option><option>Other</option></select></div>
            <div><label className={labelClass}>Machine Type</label><input className={inputClass} value={form.type} onChange={e => set("type", e.target.value)} placeholder="e.g. Screw Compressor" /></div>
            <div><label className={labelClass}>Manufacturer</label><input className={inputClass} value={form.manufacturer} onChange={e => set("manufacturer", e.target.value)} placeholder="Manufacturer" /></div>
            <div><label className={labelClass}>Model</label><input className={inputClass} value={form.model} onChange={e => set("model", e.target.value)} placeholder="Model number" /></div>
            <div><label className={labelClass}>Serial Number</label><input className={inputClass} value={form.serialNumber} onChange={e => set("serialNumber", e.target.value)} placeholder="Serial number" /></div>
            <div><label className={labelClass}>Location</label><input className={inputClass} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Power House / Floor / Area" /></div>
            <div><label className={labelClass}>Department</label><input className={inputClass} value={form.department} onChange={e => set("department", e.target.value)} placeholder="Department" /></div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7">
          <div className="mb-6"><h2 className="text-white font-black">Capacity & Status</h2><p className="text-slate-500 text-xs mt-1">Operational values used on the Machines dashboard.</p></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div><label className={labelClass}>Capacity</label><input type="number" min="0" step="0.01" className={inputClass} value={form.capacity} onChange={e => set("capacity", e.target.value)} placeholder="0" /></div>
            <div><label className={labelClass}>Capacity Unit</label><select className={inputClass} value={form.capacityUnit} onChange={e => set("capacityUnit", e.target.value)}><option>kW</option><option>kVA</option><option>HP</option><option>TR</option><option>L/min</option><option>m³/h</option><option>Other</option></select></div>
            <div><label className={labelClass}>Current Status</label><select className={inputClass} value={form.status} onChange={e => set("status", e.target.value)}><option value="running">Running</option><option value="standby">Standby</option><option value="stopped">Stopped</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of Service</option></select></div>
            <div><label className={labelClass}>Installation Date</label><input type="date" className={inputClass} value={form.installDate || ""} onChange={e => set("installDate", e.target.value)} /></div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7">
          <div className="mb-6"><h2 className="text-white font-black">Maintenance Information</h2><p className="text-slate-500 text-xs mt-1">Keep maintenance dates with the machine record for dashboard tracking.</p></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div><label className={labelClass}>Last Maintenance</label><input type="date" className={inputClass} value={form.lastMaintenance || ""} onChange={e => set("lastMaintenance", e.target.value)} /></div>
            <div><label className={labelClass}>Next Maintenance</label><input type="date" className={inputClass} value={form.nextMaintenance || ""} onChange={e => set("nextMaintenance", e.target.value)} /></div>
            <div><label className={labelClass}>Maintenance Interval (Days)</label><input type="number" min="0" className={inputClass} value={form.maintenanceIntervalDays} onChange={e => set("maintenanceIntervalDays", e.target.value)} placeholder="e.g. 90" /></div>
          </div>
          <div className="mt-5"><label className={labelClass}>Notes</label><textarea rows="4" className={`${inputClass} resize-y`} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Additional machine information, safety notes, remarks..." /></div>
        </section>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button type="button" onClick={() => navigate("/machines")} className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-xs font-black uppercase tracking-widest">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black uppercase tracking-widest disabled:opacity-60"><Save size={17}/>{saving ? "Saving..." : id ? "Update Machine" : "Save Machine"}</button>
        </div>
      </form>
    </div>
  );
}
