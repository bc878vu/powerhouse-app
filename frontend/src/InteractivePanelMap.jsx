import React, { useEffect, useMemo, useState } from "react";
import factoryMap from "./assets/factory-map.svg";
import API from "./firebaseApi";
import { Map, RefreshCw, Search, Zap, Power, Wrench, AlertTriangle } from "lucide-react";

const STATUS = {
  live: { label: "Live", color: "text-green-400", bg: "bg-green-500/10", icon: Zap },
  off: { label: "Off", color: "text-red-400", bg: "bg-red-500/10", icon: Power },
  maintenance: { label: "Maintenance", color: "text-yellow-400", bg: "bg-yellow-500/10", icon: Wrench },
  affected: { label: "Affected", color: "text-orange-400", bg: "bg-orange-500/10", icon: AlertTriangle }
};

export default function InteractivePanelMap() {
  const [panels, setPanels] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [panelResult, routeResult] = await Promise.all([API.get("/panels"), API.get("/panels/routes/all")]);
      setPanels(panelResult.data?.panels || []);
      setRoutes(routeResult.data?.routes || []);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const unsubscribe = API.subscribeToPanels?.((items) => setPanels(items));
    return () => unsubscribe?.();
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return panels.filter(p => !term || [p.panel_code, p.panel_name, p.panel_type, p.area, p.location].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [panels, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Map size={22}/></div><div><h2 className="text-xl font-black text-white">Interactive Panel Map</h2><p className="text-slate-500 text-xs">Live electrical network from Firebase Firestore</p></div></div>
        <div className="flex gap-2"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search panel" className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white outline-none"/></div><button onClick={load} className="p-3 bg-white/5 border border-white/10 rounded-xl"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/></button></div>
      </div>
      <div className="bg-[#020617] border border-white/5 rounded-3xl overflow-hidden">
        <div className="relative min-h-[520px] bg-slate-950/80">
          <img src={factoryMap} alt="Factory map" className="absolute inset-0 w-full h-full object-contain opacity-70"/>
          {visible.map(panel => {
            const status = String(panel.effective_status || panel.status || "live").toLowerCase();
            const cfg = STATUS[status] || STATUS.live;
            const Icon = cfg.icon;
            return <button key={panel.id} onClick={() => setSelected(panel)} title={panel.panel_name} style={{ left: `${Number(panel.x_position ?? 50)}%`, top: `${Number(panel.y_position ?? 50)}%` }} className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-8 min-h-8 px-2 rounded-xl ${cfg.bg} ${cfg.color} border border-white/20 shadow-xl flex items-center justify-center gap-1`}><Icon size={14}/><span className="text-[9px] font-black max-w-24 truncate">{panel.panel_code}</span></button>;
          })}
          {visible.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-black text-xs uppercase">No panels found</div>}
        </div>
      </div>
      {routes.length > 0 && <p className="text-[10px] text-slate-500">{routes.length} cable route records available in Firestore.</p>}
      {selected && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setSelected(null)}><div className="w-full max-w-xl bg-[#07101f] border border-white/10 rounded-3xl p-6" onClick={e => e.stopPropagation()}><h3 className="text-xl font-black text-white">{selected.panel_name}</h3><p className="text-yellow-500 text-xs font-black mt-1">{selected.panel_code}</p><div className="grid grid-cols-2 gap-3 mt-5">{[["Type",selected.panel_type],["Area",selected.area],["Location",selected.location],["Status",selected.status],["Voltage",selected.voltage],["Rated Current",selected.rated_current]].map(([k,v]) => <div key={k} className="p-3 bg-white/5 rounded-xl"><p className="text-[9px] text-slate-500 uppercase font-black">{k}</p><p className="text-sm text-white font-bold mt-1">{v || "N/A"}</p></div>)}</div><button onClick={() => setSelected(null)} className="mt-5 px-5 py-3 bg-yellow-500 text-black rounded-xl font-black text-xs">Close</button></div></div>}
    </div>
  );
}
