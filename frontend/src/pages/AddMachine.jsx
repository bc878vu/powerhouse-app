import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Cpu, ExternalLink, Image as ImageIcon, Loader2, Save, Zap } from "lucide-react";
import { addMachine, subscribeToMachine, updateMachine } from "../services/machineService";

const CATEGORIES = ["General", "Generator", "Compressor", "Boiler", "Motor", "Pump", "HVAC", "Production", "Electrical", "Packaging", "Cooling", "Utility", "Other"];
const TYPES = ["Generator", "Air Compressor", "Screw Compressor", "Motor", "Electric Motor", "Pump", "Water Pump", "Boiler", "Chiller", "Cooling Tower", "AHU", "HVAC Unit", "Transformer", "UPS", "Panel / MCC", "Production Machine", "Packaging Machine", "Lifter", "Fan", "Blower", "Other"];
const UTILITY_TYPES = ["Electricity", "Compressed Air", "Steam", "Chilled Water", "Cooling Water", "Process Water", "Fuel", "Heat", "Other"];
const EMPTY = { name: "", code: "", category: "General", type: "", manufacturer: "", model: "", serialNumber: "", location: "", department: "Power House", imageUrl: "", description: "", utilityRole: "consumer", utilityType: "Electricity", capacity: "", capacityUnit: "kW", status: "standby", currentRunningLoad: "", loadUnit: "kW", normalLoadFactor: "", installDate: "", lastMaintenance: "", nextMaintenance: "", maintenanceIntervalDays: "", notes: "" };
const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-yellow-500/60 placeholder:text-slate-600";
const labelClass = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";
const DRAFT_PREFIX = "powerhouse_machine_draft_v2";

const draftKey = (id) => `${DRAFT_PREFIX}:${id || "new"}`;
const readDraft = (id) => { try { const raw = localStorage.getItem(draftKey(id)); if (!raw) return null; const parsed = JSON.parse(raw); return parsed && typeof parsed === "object" ? { ...EMPTY, ...parsed } : null; } catch { return null; } };
const writeDraft = (id, form) => { try { localStorage.setItem(draftKey(id), JSON.stringify(form)); } catch {} };
const clearDraft = (id) => { try { localStorage.removeItem(draftKey(id)); } catch {} };
function isValidImageUrl(value) { if (!String(value || "").trim()) return true; try { const url = new URL(String(value).trim()); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; } }

export default function AddMachine() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const draft = readDraft(id);
    if (draft) { setForm(draft); setDraftRestored(true); }
    if (!id) { setLoading(false); return undefined; }
    const unsubscribe = subscribeToMachine(id, machine => { if (machine && !draft) setForm({ ...EMPTY, ...machine }); setLoading(false); }, err => { setError(err.message || "Unable to load machine."); setLoading(false); });
    return () => unsubscribe?.();
  }, [id]);

  useEffect(() => { if (loading || saving) return undefined; const timer = window.setTimeout(() => writeDraft(id, form), 250); return () => window.clearTimeout(timer); }, [form, id, loading, saving]);
  useEffect(() => { const saveBeforeExit = () => { if (!saving) writeDraft(id, form); }; window.addEventListener("beforeunload", saveBeforeExit); return () => window.removeEventListener("beforeunload", saveBeforeExit); }, [form, id, saving]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const customCategory = form.category && !CATEGORIES.includes(form.category);
  const customType = form.type && !TYPES.includes(form.type);
  const utilization = Number(form.capacity) > 0 ? (Number(form.currentRunningLoad || 0) / Number(form.capacity)) * 100 : 0;

  const submit = async event => {
    event.preventDefault(); setError(""); setMessage("");
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const capacity = Number(form.capacity || 0);
    const runningLoad = Number(form.currentRunningLoad || 0);
    const normalLoadFactor = Number(form.normalLoadFactor || 0);
    const interval = Number(form.maintenanceIntervalDays || 0);
    if (!name || !code) return setError("Machine name and machine code are required.");
    if (!isValidImageUrl(form.imageUrl)) return setError("Please enter a valid http:// or https:// image URL.");
    if (capacity < 0 || runningLoad < 0 || normalLoadFactor < 0 || normalLoadFactor > 100 || interval < 0) return setError("Please enter valid positive values. Load factor must be between 0 and 100%.");
    if (capacity > 0 && runningLoad > capacity) return setError("Actual running load cannot exceed rated load.");
    setSaving(true);
    try {
      const data = { ...form, name, code, category: String(form.category || "General").trim(), type: String(form.type || "General").trim(), utilityRole: String(form.utilityRole || "consumer").trim(), utilityType: String(form.utilityType || "Electricity").trim(), imageUrl: String(form.imageUrl || "").trim(), description: String(form.description || "").trim() };
      if (id) { await updateMachine(id, data); setMessage("Machine updated successfully and saved to Firebase."); }
      else { await addMachine(data); setMessage("Machine added successfully and saved to Firebase."); }
      clearDraft(id); window.setTimeout(() => navigate("/machines"), 800);
    } catch (err) { setError(err.message || "Could not save machine. Your entered data is still kept as a local draft."); writeDraft(id, form); }
    finally { setSaving(false); }
  };

  const discardDraft = () => { clearDraft(id); setForm(EMPTY); setDraftRestored(false); setMessage("Saved draft cleared."); };
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 size={32} className="animate-spin text-yellow-500" /></div>;

  return <div className="space-y-6 animate-in fade-in duration-500">
    <div className="flex flex-col sm:flex-row sm:items-center gap-4"><button type="button" onClick={() => navigate("/machines")} className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"><ArrowLeft size={19} /></button><div className="w-12 h-12 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Cpu size={24} /></div><div className="min-w-0"><h1 className="text-2xl md:text-3xl font-black">{id ? "Edit Machine" : "Add Machine"}</h1><p className="text-slate-500 text-sm mt-1">Register complete machine identity, utility role, image, description, rated load and maintenance profile.</p></div></div>
    {draftRestored && <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-200"><span>Your unfinished machine data was restored from this device.</span><button type="button" onClick={discardDraft} className="self-start sm:self-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-black uppercase">Clear Draft</button></div>}
    {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">{error}</div>}
    {message && <div className="flex items-center gap-2 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-300"><CheckCircle2 size={17} />{message}</div>}

    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7"><h2 className="font-black">Basic Information</h2><p className="text-xs text-slate-500 mt-1">Identify the machine and classify what utility it produces or consumes.</p><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
        <div><label className={labelClass}>Machine Name *</label><input required className={inputClass} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Air Compressor 01" /></div>
        <div><label className={labelClass}>Machine Code *</label><input required className={inputClass} value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="e.g. MC-001" /></div>
        <div><label className={labelClass}>Category</label><select className={inputClass} value={customCategory ? "__custom__" : form.category} onChange={e => set("category", e.target.value === "__custom__" ? "" : e.target.value)}>{CATEGORIES.map(x => <option key={x} value={x}>{x}</option>)}<option value="__custom__">+ Create Custom Category</option></select>{(customCategory || !form.category) && <input className={`${inputClass} mt-2`} value={form.category} onChange={e => set("category", e.target.value)} placeholder="Type custom category" />}</div>
        <div><label className={labelClass}>Machine Type</label><select className={inputClass} value={customType ? "__custom__" : form.type} onChange={e => set("type", e.target.value === "__custom__" ? "" : e.target.value)}><option value="">Select type</option>{TYPES.map(x => <option key={x} value={x}>{x}</option>)}<option value="__custom__">+ Create Custom Type</option></select>{(customType || !form.type) && <input className={`${inputClass} mt-2`} value={form.type} onChange={e => set("type", e.target.value)} placeholder="Type custom machine type" />}</div>
        <div><label className={labelClass}>Manufacturer</label><input className={inputClass} value={form.manufacturer} onChange={e => set("manufacturer", e.target.value)} placeholder="Manufacturer" /></div>
        <div><label className={labelClass}>Model</label><input className={inputClass} value={form.model} onChange={e => set("model", e.target.value)} placeholder="Model number" /></div>
        <div><label className={labelClass}>Serial Number</label><input className={inputClass} value={form.serialNumber} onChange={e => set("serialNumber", e.target.value)} placeholder="Serial number" /></div>
        <div><label className={labelClass}>Area / Location</label><input className={inputClass} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Power House / Floor / Area" /></div>
        <div><label className={labelClass}>Department</label><input className={inputClass} value={form.department} onChange={e => set("department", e.target.value)} placeholder="Department" /></div>
        <div><label className={labelClass}>Utility Role *</label><select required className={inputClass} value={form.utilityRole} onChange={e => set("utilityRole", e.target.value)}><option value="producer">Produces Utility</option><option value="consumer">Consumes Utility</option><option value="both">Produces & Consumes</option><option value="process">Process / Non-Utility</option></select></div>
        <div><label className={labelClass}>Utility / Resource Type *</label><select required className={inputClass} value={form.utilityType} onChange={e => set("utilityType", e.target.value)}>{UTILITY_TYPES.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
      </div></section>

      <section className="rounded-[2rem] border border-blue-500/10 bg-[#020617] p-5 md:p-7"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center"><ImageIcon size={18} /></div><div><h2 className="font-black">Machine Photo & Description</h2><p className="text-xs text-slate-500 mt-1">Paste a direct image URL. The image is stored as a URL, so no upload/storage change is required.</p></div></div><div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-5 mt-6"><div><label className={labelClass}>Machine Image URL</label><div className="flex gap-2"><input type="url" className={inputClass} value={form.imageUrl} onChange={e => set("imageUrl", e.target.value)} placeholder="https://example.com/machine.jpg" /><a href={form.imageUrl || undefined} target="_blank" rel="noreferrer" className={`shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 flex items-center justify-center ${form.imageUrl ? "text-blue-400" : "pointer-events-none text-slate-700"}`} title="Open image URL"><ExternalLink size={17} /></a></div><p className="text-[9px] text-slate-600 mt-2">Use a direct image URL ending in an image resource (JPG, PNG, WEBP, etc.).</p></div><div><label className={labelClass}>Preview</label><div className="h-44 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex items-center justify-center">{form.imageUrl ? <img src={form.imageUrl} alt={form.name || "Machine preview"} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} /> : <div className="text-center text-slate-700"><ImageIcon size={30} className="mx-auto" /><p className="text-[9px] uppercase tracking-widest mt-2">No image URL</p></div>}</div></div></div><div className="mt-5"><label className={labelClass}>Machine Description</label><textarea rows="5" className={inputClass} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Describe the machine, its purpose, major function, operating role, specifications or other useful information..." /></div></section>

      <section className="rounded-[2rem] border border-yellow-500/10 bg-[#020617] p-5 md:p-7"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center"><Zap size={18} /></div><div><h2 className="font-black">Load Configuration</h2><p className="text-xs text-slate-500 mt-1">These values drive rated load, actual running load and utilization calculations.</p></div></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
        <div><label className={labelClass}>Rated / Total Load *</label><input required type="number" min="0" step="0.01" className={inputClass} value={form.capacity} onChange={e => set("capacity", e.target.value)} placeholder="e.g. 250" /></div>
        <div><label className={labelClass}>Capacity Unit</label><select className={inputClass} value={form.capacityUnit} onChange={e => set("capacityUnit", e.target.value)}><option>kW</option><option>kVA</option><option>HP</option><option>TR</option><option>L/min</option><option>m³/h</option><option>Other</option></select></div>
        <div><label className={labelClass}>Actual Running Load</label><input type="number" min="0" step="0.01" className={inputClass} value={form.currentRunningLoad} onChange={e => set("currentRunningLoad", e.target.value)} placeholder="Current actual load" /></div>
        <div><label className={labelClass}>Load Unit</label><select className={inputClass} value={form.loadUnit} onChange={e => set("loadUnit", e.target.value)}><option>kW</option><option>kVA</option><option>HP</option><option>TR</option><option>Other</option></select></div>
        <div><label className={labelClass}>Normal Load Factor (%)</label><input type="number" min="0" max="100" step="0.1" className={inputClass} value={form.normalLoadFactor} onChange={e => set("normalLoadFactor", e.target.value)} placeholder="e.g. 75" /></div>
        <div><label className={labelClass}>Current Status</label><select className={inputClass} value={form.status} onChange={e => set("status", e.target.value)}><option value="running">Running</option><option value="standby">Standby</option><option value="stopped">Stopped</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of Service</option></select></div>
        <div><label className={labelClass}>Installation Date</label><input type="date" className={inputClass} value={form.installDate || ""} onChange={e => set("installDate", e.target.value)} /></div>
        <div className="rounded-xl border border-green-500/10 bg-green-500/5 p-4"><p className="text-[9px] uppercase tracking-widest text-green-400 font-black">Live Utilization</p><p className="text-2xl font-black mt-1">{utilization.toFixed(1)}%</p><p className="text-[9px] text-slate-600 mt-1">Actual running ÷ rated load</p></div>
      </div></section>

      <section className="rounded-[2rem] border border-white/5 bg-[#020617] p-5 md:p-7"><h2 className="font-black">Maintenance Information</h2><p className="text-xs text-slate-500 mt-1">Dates are used by the Machines Dashboard to calculate maintenance due.</p><div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6"><div><label className={labelClass}>Last Maintenance</label><input type="date" className={inputClass} value={form.lastMaintenance || ""} onChange={e => set("lastMaintenance", e.target.value)} /></div><div><label className={labelClass}>Next Maintenance</label><input type="date" className={inputClass} value={form.nextMaintenance || ""} onChange={e => set("nextMaintenance", e.target.value)} /></div><div><label className={labelClass}>Maintenance Interval (Days)</label><input type="number" min="0" className={inputClass} value={form.maintenanceIntervalDays} onChange={e => set("maintenanceIntervalDays", e.target.value)} placeholder="e.g. 90" /></div></div><div className="mt-5"><label className={labelClass}>Notes</label><textarea rows="4" className={inputClass} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Safety notes, machine details, remarks..." /></div></section>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3"><button type="button" onClick={() => navigate("/machines")} className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-xs font-black uppercase">Cancel</button><button disabled={saving} className="flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black uppercase disabled:opacity-60"><Save size={17} />{saving ? "Saving to Firebase..." : id ? "Update Machine" : "Save Machine"}</button></div>
    </form>
  </div>;
}
