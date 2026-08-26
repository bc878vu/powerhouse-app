import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../firebaseApi";
import factoryMap from "../assets/factory-map.svg";
import { RefreshCw, Plus, Eye, Pencil, Trash2, Zap, Power, Wrench, AlertTriangle, LayoutGrid, Archive, Search, MapPin, X, Info } from "lucide-react";

const STATUS = {
  live: { label: "Live", icon: Zap, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", dot: "bg-green-400" },
  off: { label: "Off", icon: Power, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-400" },
  maintenance: { label: "Maintenance", icon: Wrench, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  affected: { label: "Affected", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "bg-orange-400" },
  unknown: { label: "Unknown", icon: AlertTriangle, color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", dot: "bg-slate-400" }
};

const value = (p, key) => p?.[key] ?? "N/A";

export default function Panels() {
  const navigate = useNavigate();
  const [panels, setPanels] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updating, setUpdating] = useState(null);
  const [selectedPanel, setSelectedPanel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await API.get("/panels");
      setPanels(Array.isArray(response.data?.panels) ? response.data.panels : []);
      setMessage("");
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Failed to load panels from Firebase.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = API.subscribeToPanels?.((items) => setPanels(Array.isArray(items) ? items : []));
    return () => unsubscribe?.();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return panels.filter((panel) => {
      const status = String(panel.effective_status || panel.status || "unknown").toLowerCase();
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const text = [panel.panel_code, panel.panel_name, panel.panel_type, panel.area, panel.location, panel.manufacturer, panel.model].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && (!term || text.includes(term));
    });
  }, [panels, search, statusFilter]);

  const counts = useMemo(() => ({
    total: panels.length,
    live: panels.filter(p => (p.effective_status || p.status || "unknown") === "live").length,
    off: panels.filter(p => (p.effective_status || p.status) === "off").length,
    maintenance: panels.filter(p => (p.effective_status || p.status) === "maintenance").length,
    affected: panels.filter(p => p.effective_status === "affected").length
  }), [panels]);

  const changeStatus = async (panel, status) => {
    if (panel.status === status) return;
    setUpdating(panel.id);
    try { await API.put(`/panels/${panel.id}/status`, { status, reason: `Panel changed to ${status}` }); await load(); setSelectedPanel(p => p?.id === panel.id ? { ...p, status } : p); }
    catch (error) { setMessage(error.message || "Could not update panel status."); }
    finally { setUpdating(null); }
  };

  const archive = async (panel) => {
    if (!window.confirm(`Move ${panel.panel_name || panel.panel_code} to Panel History?`)) return;
    setUpdating(panel.id);
    try { await API.delete(`/panels/${panel.id}`); setSelectedPanel(null); await load(); }
    catch (error) { setMessage(error.message || "Could not archive panel."); }
    finally { setUpdating(null); }
  };

  const openPanel = panel => setSelectedPanel(panel);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-8">
      {message && <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-sm">{message}</div>}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4"><div className="w-12 h-12 bg-yellow-500 rounded-2xl flex items-center justify-center text-black"><LayoutGrid size={24} /></div><div><h1 className="text-2xl md:text-3xl font-black text-white">Panel Management</h1><p className="text-slate-500 text-sm mt-1">Interactive electrical panel map, live status and complete panel information</p></div></div>
        <div className="flex flex-wrap gap-2"><button onClick={load} className="p-3 bg-white/5 border border-white/10 rounded-xl"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button><button onClick={() => navigate("/panel-history")} className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase"><Archive size={17}/> Panel History</button><button onClick={() => navigate("/add-panel")} className="flex items-center gap-2 px-5 py-3 bg-yellow-500 text-black rounded-xl text-xs font-black uppercase"><Plus size={17}/> Add New Panel</button></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {["total", "live", "off", "maintenance", "affected"].map(key => { const config = STATUS[key] || STATUS.unknown; const Icon = key === "total" ? LayoutGrid : config.icon; return <button key={key} onClick={() => setStatusFilter(key === "total" ? "all" : key)} className={`text-left p-4 rounded-2xl border ${statusFilter === (key === "total" ? "all" : key) ? `${config.bg} ${config.border}` : "bg-[#020617] border-white/5"}`}><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{key}</p><p className={`text-3xl font-black mt-2 ${config.color}`}>{counts[key]}</p><Icon size={17} className={`mt-2 ${config.color}`} /></button>; })}
      </div>

      <section className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-white font-black text-sm uppercase">Panel Location Map</h2><p className="text-slate-500 text-[10px] mt-1">All saved panels are shown on the factory map. Click any panel marker for complete information and status.</p></div><div className="flex flex-wrap gap-2 text-[9px] font-black uppercase">{Object.entries(STATUS).slice(0,4).map(([key,cfg]) => <span key={key} className="flex items-center gap-1.5 text-slate-400"><i className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`}/>{cfg.label}</span>)}</div></div>
        <div className="relative w-full min-h-[360px] md:min-h-[520px] bg-slate-950 overflow-hidden">
          <img src={factoryMap} alt="Factory panel map" className="absolute inset-0 w-full h-full object-contain opacity-80" />
          {loading && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50"><RefreshCw size={30} className="animate-spin text-yellow-500"/></div>}
          {!loading && panels.length === 0 && <div className="absolute inset-0 flex items-center justify-center"><div className="text-center"><MapPin size={34} className="mx-auto text-slate-600 mb-2"/><p className="text-slate-500 font-black text-xs uppercase">No panels saved yet</p></div></div>}
          {!loading && filtered.map(panel => { const status = String(panel.effective_status || panel.status || "unknown").toLowerCase(); const cfg = STATUS[status] || STATUS.unknown; return <button key={panel.id} type="button" title={`${panel.panel_code || "Panel"} — ${cfg.label}`} onClick={() => openPanel(panel)} className="absolute -translate-x-1/2 -translate-y-1/2 group z-10 focus:outline-none" style={{ left: `${Number(panel.x_position ?? 50)}%`, top: `${Number(panel.y_position ?? 50)}%` }}><span className={`flex items-center justify-center w-7 h-7 md:w-9 md:h-9 rounded-full ${cfg.dot} border-2 border-white shadow-lg shadow-black/50 group-hover:scale-125 transition-transform`}><MapPin size={15} className="text-slate-950"/></span><span className="mt-1 block max-w-28 truncate rounded-md bg-slate-950/90 border border-white/10 px-1.5 py-0.5 text-[8px] md:text-[9px] font-black text-white">{panel.panel_code || panel.panel_name || "Panel"}</span></button>; })}
        </div>
      </section>

      <div className="bg-[#020617] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search panels..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white outline-none"/></div><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"><option value="all">All Statuses</option><option value="live">Live</option><option value="off">Off</option><option value="maintenance">Maintenance</option><option value="affected">Affected</option></select></div>

      <div className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden"><div className="px-5 py-4 border-b border-white/5"><h2 className="text-white font-black text-sm uppercase">All Electrical Panels</h2><p className="text-slate-500 text-[10px] mt-1">Showing {filtered.length} of {panels.length} panels</p></div>{loading ? <div className="min-h-[300px] flex items-center justify-center"><RefreshCw size={30} className="animate-spin text-yellow-500"/></div> : filtered.length === 0 ? <div className="min-h-[300px] flex items-center justify-center text-slate-500 font-black text-xs uppercase">No panels found</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px]"><thead><tr className="border-b border-white/5">{["Panel","Type","Location","Status","Electrical","Actions"].map(h => <th key={h} className="text-left px-5 py-4 text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{filtered.map(panel => { const status = String(panel.effective_status || panel.status || "unknown").toLowerCase(); const cfg = STATUS[status] || STATUS.unknown; const Icon = cfg.icon; return <tr key={panel.id} onClick={() => openPanel(panel)} className="border-b border-white/[0.04] hover:bg-white/[0.025] cursor-pointer"><td className="px-5 py-4"><p className="text-white text-sm font-black">{panel.panel_name || "Unnamed Panel"}</p><p className="text-yellow-500 text-[10px] font-black mt-1">{panel.panel_code || "N/A"}</p></td><td className="px-5 py-4 text-xs text-slate-300">{panel.panel_type || "N/A"}</td><td className="px-5 py-4"><p className="text-white text-xs">{panel.area || "N/A"}</p><p className="text-slate-500 text-[10px]">{panel.location || "No location"}</p></td><td className="px-5 py-4"><div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-[9px] uppercase font-black ${cfg.bg} ${cfg.color} border ${cfg.border}`}><Icon size={12}/>{cfg.label}</div><select onClick={e => e.stopPropagation()} value={panel.status || "live"} disabled={updating === panel.id} onChange={e => changeStatus(panel, e.target.value)} className="block mt-2 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-white"><option value="live">Live</option><option value="off">Off</option><option value="maintenance">Maintenance</option></select></td><td className="px-5 py-4"><p className="text-white text-xs">{panel.voltage || "N/A"}</p><p className="text-slate-500 text-[10px]">{panel.rated_current || "N/A"}</p></td><td className="px-5 py-4"><div className="flex gap-2"><button onClick={e => {e.stopPropagation(); navigate(`/add-panel/${panel.id}`)}} className="w-9 h-9 bg-yellow-500/10 text-yellow-400 rounded-xl flex items-center justify-center"><Pencil size={15}/></button><button onClick={e => {e.stopPropagation(); archive(panel)}} disabled={updating === panel.id} className="w-9 h-9 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center"><Trash2 size={15}/></button><button onClick={e => {e.stopPropagation(); openPanel(panel)}} className="w-9 h-9 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center"><Eye size={15}/></button></div></td></tr>; })}</tbody></table></div>}</div>

      {selectedPanel && <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center" onMouseDown={e => e.target === e.currentTarget && setSelectedPanel(null)}><div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[#020617] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-5 border-b border-white/5 bg-[#020617]/95 backdrop-blur"><div><div className="flex items-center gap-2"><Info size={18} className="text-yellow-400"/><h2 className="text-xl font-black text-white">{value(selectedPanel,"panel_name")}</h2></div><p className="text-yellow-500 text-xs font-black mt-1">{value(selectedPanel,"panel_code")}</p></div><button onClick={() => setSelectedPanel(null)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center"><X size={18}/></button></div><div className="p-5 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${STATUS[String(selectedPanel.effective_status || selectedPanel.status || "unknown").toLowerCase()]?.bg || STATUS.unknown.bg} ${STATUS[String(selectedPanel.effective_status || selectedPanel.status || "unknown").toLowerCase()]?.color || STATUS.unknown.color} border ${STATUS[String(selectedPanel.effective_status || selectedPanel.status || "unknown").toLowerCase()]?.border || STATUS.unknown.border} text-xs font-black uppercase`}>{(STATUS[String(selectedPanel.effective_status || selectedPanel.status || "unknown").toLowerCase()] || STATUS.unknown).label}</span><span className="text-xs text-slate-500">{value(selectedPanel,"area")} · {value(selectedPanel,"location")}</span></div><select value={selectedPanel.status || "live"} disabled={updating === selectedPanel.id} onChange={e => changeStatus(selectedPanel,e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white"><option value="live">Live</option><option value="off">Off</option><option value="maintenance">Maintenance</option></select></div><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{[["Panel Type","panel_type"],["Voltage","voltage"],["Rated Current","rated_current"],["Frequency","frequency"],["Phase","phase"],["Incomer","incomer_type"],["Incomer Rating","incomer_rating"],["Breaker","breaker_type"],["Breaker Rating","breaker_rating"],["Breaking Capacity","breaking_capacity"],["Busbar","busbar_rating"],["Manufacturer","manufacturer"],["Model","model"],["Serial Number","serial_number"],["IP Rating","ip_rating"],["Installation","installation_date"],["Short Circuit","short_circuit_rating"],["Control Voltage","control_voltage"],["Earthing","earthing_details"],["Last Maintenance","last_maintenance_date"],["Next Maintenance","next_maintenance_date"]].map(([label,key]) => <div key={key} className="rounded-xl bg-white/[0.035] border border-white/5 p-3"><p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">{label}</p><p className="text-sm text-white font-bold mt-1 break-words">{value(selectedPanel,key)}</p></div>)}</div><div className="grid md:grid-cols-2 gap-4"><div className="rounded-xl bg-white/[0.035] border border-white/5 p-4"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Description</p><p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{value(selectedPanel,"description")}</p></div><div className="rounded-xl bg-white/[0.035] border border-white/5 p-4"><p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Notes</p><p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{value(selectedPanel,"notes")}</p></div></div><div className="flex flex-col sm:flex-row justify-end gap-2"><button onClick={() => {setSelectedPanel(null); navigate(`/add-panel/${selectedPanel.id}`)}} className="px-5 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Pencil size={14} className="inline mr-2"/>Edit Panel</button><button onClick={() => archive(selectedPanel)} className="px-5 py-3 rounded-xl bg-red-500/10 text-red-400 text-xs font-black"><Trash2 size={14} className="inline mr-2"/>Archive Panel</button></div></div></div></div>}
    </div>
  );
}
