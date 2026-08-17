import React, { useEffect, useMemo, useState } from "react";
import { CircuitBoard, Save, RotateCcw, Route, Link2, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import factoryMap from "../assets/factory-map.svg";
import API from "../firebaseApi";

const initialForm = {
  panel_code: "", panel_name: "", panel_type: "", description: "", area: "", location: "",
  x_position: 50, y_position: 50, marker_width: 3, marker_height: 3, source_panel_id: "",
  status: "live", status_reason: "", voltage: "", rated_current: "", frequency: "50 Hz", phase: "3 Phase",
  incomer_type: "", incomer_rating: "", breaker_type: "", breaker_rating: "", breaking_capacity: "",
  busbar_rating: "", busbar_material: "", incoming_cable_size: "", incoming_cable_type: "",
  incoming_cable_cores: "", incoming_cable_length: "", manufacturer: "", model: "", serial_number: "",
  ip_rating: "", installation_date: "", short_circuit_rating: "", insulation_voltage: "",
  control_voltage: "", earthing_details: "", last_maintenance_date: "", next_maintenance_date: "",
  notes: "", route_name: "", cable_tray_name: ""
};

const fields = [
  ["panel_code", "Panel Code"], ["panel_name", "Panel Name"], ["panel_type", "Panel Type"], ["area", "Area"], ["location", "Location"],
  ["voltage", "Voltage"], ["rated_current", "Rated Current"], ["incomer_type", "Incomer Type"], ["incomer_rating", "Incomer Rating"],
  ["breaker_type", "Breaker Type"], ["breaker_rating", "Breaker Rating"], ["breaking_capacity", "Breaking Capacity"], ["busbar_rating", "Busbar Rating"],
  ["busbar_material", "Busbar Material"], ["incoming_cable_size", "Incoming Cable Size"], ["incoming_cable_type", "Incoming Cable Type"],
  ["incoming_cable_cores", "Cable Cores"], ["incoming_cable_length", "Cable Length"], ["manufacturer", "Manufacturer"], ["model", "Model"],
  ["serial_number", "Serial Number"], ["ip_rating", "IP Rating"], ["installation_date", "Installation Date"], ["short_circuit_rating", "Short Circuit Rating"],
  ["insulation_voltage", "Insulation Voltage"], ["control_voltage", "Control Voltage"], ["earthing_details", "Earthing Details"],
  ["last_maintenance_date", "Last Maintenance"], ["next_maintenance_date", "Next Maintenance"], ["frequency", "Frequency"], ["phase", "Phase"]
];

export default function AddPanel() {
  const [form, setForm] = useState(initialForm);
  const [panels, setPanels] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routePoints, setRoutePoints] = useState([]);
  const [mode, setMode] = useState("panel");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([API.get("/panels"), API.get("/panels/routes/all")]);
      setPanels(p.data?.panels || []);
      setRoutes(r.data?.routes || []);
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Could not load Firebase panel data." });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const update = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const mapPoints = useMemo(() => routePoints.map((p) => `${p.x},${p.y}`).join(" "), [routePoints]);

  const handleMapClick = (event) => {
    if (mode !== "route") {
      const rect = event.currentTarget.getBoundingClientRect();
      update("x_position", Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(3)));
      update("y_position", Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(3)));
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setRoutePoints((prev) => [...prev, {
      x: Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(3)),
      y: Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(3))
    }]);
  };

  const attachExisting = () => {
    const route = routes.find((r) => String(r.id) === String(form.connected_route_id));
    const points = route?.route_points || route?.points;
    if (Array.isArray(points)) setRoutePoints(points.map((p) => ({ x: Number(p.x), y: Number(p.y) })));
  };

  const reset = () => { setForm(initialForm); setRoutePoints([]); setMode("panel"); setMessage({ type: "", text: "" }); };

  const save = async (event) => {
    event.preventDefault();
    if (!form.panel_code.trim() || !form.panel_name.trim()) {
      setMessage({ type: "error", text: "Panel Code and Panel Name are required." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        panel_code: form.panel_code.trim(),
        panel_name: form.panel_name.trim(),
        x_position: Number(form.x_position), y_position: Number(form.y_position),
        marker_width: Number(form.marker_width), marker_height: Number(form.marker_height),
        source_panel_id: form.source_panel_id ? String(form.source_panel_id) : null,
        cable_route_points: routePoints
      };
      const response = await API.post("/panels", payload);
      setMessage({ type: "success", text: `${response.data?.panel?.panel_name || "Panel"} saved to Firebase.` });
      reset();
      await load();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to save panel." });
    } finally { setSaving(false); }
  };

  return <div className="space-y-6 pb-12">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="flex items-center gap-4"><div className="w-14 h-14 bg-yellow-500 rounded-2xl text-black flex items-center justify-center"><CircuitBoard size={28}/></div><div><h1 className="text-2xl md:text-3xl font-black text-white">Add Electrical Panel</h1><p className="text-slate-500 text-sm">Complete specifications, status, hierarchy, map position and cable route.</p></div></div>
      <div className="flex gap-2"><button onClick={reset} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black"><RotateCcw size={15} className="inline mr-2"/>Reset</button><button onClick={save} disabled={saving} className="px-5 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black disabled:opacity-60"><Save size={15} className="inline mr-2"/>{saving ? "Saving..." : "Save Panel"}</button></div>
    </div>
    {message.text && <div className={`p-4 rounded-2xl border flex items-center gap-3 ${message.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>{message.type === "success" ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}<span className="text-sm font-bold">{message.text}</span></div>}

    <form onSubmit={save} className="grid xl:grid-cols-[1fr_420px] gap-6">
      <div className="bg-[#020617] border border-white/5 rounded-3xl p-5 md:p-7 space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          {fields.map(([name, label]) => <label key={name} className="space-y-2"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{label}</span><input type={name.includes("date") ? "date" : "text"} value={form[name]} onChange={(e) => update(name, e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500" /></label>)}
        </div>
        <div className="grid sm:grid-cols-3 gap-4"><label className="space-y-2"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Status</span><select value={form.status} onChange={(e) => update("status", e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"><option value="live">Live</option><option value="off">Off</option><option value="maintenance">Maintenance</option></select></label><label className="space-y-2"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Source Panel</span><select value={form.source_panel_id} onChange={(e) => update("source_panel_id", e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"><option value="">None</option>{panels.map((p) => <option key={p.id} value={p.id}>{p.panel_code} — {p.panel_name}</option>)}</select></label><label className="space-y-2"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Existing Route</span><select value={form.connected_route_id || ""} onChange={(e) => update("connected_route_id", e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"><option value="">None</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.route_name || `Route ${r.id}`}</option>)}</select></label></div>
        <label className="space-y-2 block"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Description / Notes</span><textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="w-full min-h-28 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"/></label>
        <label className="space-y-2 block"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Additional Notes</span><textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="w-full min-h-28 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"/></label>
      </div>

      <div className="bg-[#020617] border border-white/5 rounded-3xl p-5 h-fit sticky top-6 space-y-4">
        <div className="flex items-center justify-between"><div><h2 className="text-white font-black">Factory Map</h2><p className="text-[10px] text-slate-500">Click to place panel or draw cable route.</p></div><MapPin size={20} className="text-yellow-500"/></div>
        <div className="flex gap-2"><button type="button" onClick={() => setMode("panel")} className={`flex-1 py-2 rounded-xl text-xs font-black ${mode === "panel" ? "bg-yellow-500 text-black" : "bg-white/5 text-slate-300"}`}>Panel Point</button><button type="button" onClick={() => setMode("route")} className={`flex-1 py-2 rounded-xl text-xs font-black ${mode === "route" ? "bg-yellow-500 text-black" : "bg-white/5 text-slate-300"}`}><Route size={13} className="inline mr-1"/>Route</button></div>
        <div onClick={handleMapClick} className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-slate-950 cursor-crosshair"><img src={factoryMap} alt="Factory map" className="absolute inset-0 w-full h-full object-contain opacity-70"/><div className="absolute w-5 h-5 rounded-full bg-yellow-500 border-2 border-white -translate-x-1/2 -translate-y-1/2" style={{ left: `${form.x_position}%`, top: `${form.y_position}%` }} />{routePoints.map((p, i) => <div key={i} className="absolute w-3 h-3 rounded-full bg-cyan-400 border border-white -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}/>) }{routePoints.length > 1 && <svg className="absolute inset-0 w-full h-full pointer-events-none"><polyline points={mapPoints} fill="none" stroke="currentColor" className="text-cyan-400" strokeWidth="0.8" vectorEffect="non-scaling-stroke"/></svg>}</div>
        <div className="grid grid-cols-2 gap-2"><div className="p-3 rounded-xl bg-white/5"><p className="text-[9px] text-slate-500 uppercase font-black">X Position</p><p className="text-white font-bold">{Number(form.x_position).toFixed(2)}%</p></div><div className="p-3 rounded-xl bg-white/5"><p className="text-[9px] text-slate-500 uppercase font-black">Y Position</p><p className="text-white font-bold">{Number(form.y_position).toFixed(2)}%</p></div></div>
        <button type="button" onClick={attachExisting} className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black"><Link2 size={14} className="inline mr-2"/>Load Selected Route</button>
        <button type="button" onClick={() => setRoutePoints([])} className="w-full py-3 rounded-xl bg-red-500/10 text-red-400 text-xs font-black">Clear Route</button>
        {loading && <p className="text-[10px] text-slate-500">Loading existing Firebase panels…</p>}
      </div>
    </form>
  </div>;
}
