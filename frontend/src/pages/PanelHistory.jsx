import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../firebaseApi";
import { Archive, RefreshCw, RotateCcw, Trash2, Eye, ArrowLeft } from "lucide-react";

export default function PanelHistory() {
  const navigate = useNavigate();
  const [panels, setPanels] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await API.get("/panels/history/deleted");
      setPanels(response.data?.panels || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Failed to load panel history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return panels;
    return panels.filter(p => [p.id, p.panel_code, p.panel_name, p.panel_type, p.area, p.location, p.manufacturer, p.model].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [panels, search]);

  const restore = async (panel) => {
    if (!window.confirm(`Restore ${panel.panel_name || panel.panel_code}?`)) return;
    try { await API.put(`/panels/history/deleted/${panel.id}/restore`); await load(); } catch (error) { setMessage(error.message); }
  };

  const permanentDelete = async (panel) => {
    if (!window.confirm(`Permanently delete ${panel.panel_name || panel.panel_code}? This cannot be undone.`)) return;
    try { await API.delete(`/panels/history/deleted/${panel.id}/permanent`); await load(); } catch (error) { setMessage(error.message); }
  };

  return (
    <div className="space-y-6">
      {message && <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold">{message}</div>}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4"><button onClick={() => navigate("/panels")} className="p-3 bg-white/5 border border-white/10 rounded-xl"><ArrowLeft size={18}/></button><div><h1 className="text-2xl md:text-3xl font-black text-white">Panel History</h1><p className="text-slate-500 text-sm">Archived panels stored in Firebase Firestore</p></div></div>
        <button onClick={load} className="p-3 bg-white/5 border border-white/10 rounded-xl"><RefreshCw size={18} className={loading ? "animate-spin" : ""}/></button>
      </div>
      <div className="bg-[#020617] border border-white/5 rounded-2xl p-4"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deleted panels..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none"/></div>
      <div className="bg-[#020617] border border-white/5 rounded-[2rem] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5"><div className="flex items-center gap-2 text-white font-black uppercase text-sm"><Archive size={17}/> Archived Panels</div><p className="text-slate-500 text-[10px] mt-1">{filtered.length} records</p></div>
        {loading ? <div className="min-h-[300px] flex items-center justify-center"><RefreshCw size={30} className="animate-spin text-yellow-500"/></div> : filtered.length === 0 ? <div className="min-h-[300px] flex items-center justify-center text-slate-500 font-black text-xs uppercase">No archived panels found</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px]"><thead><tr className="border-b border-white/5">{["Panel","Type","Location","Status","Actions"].map(h => <th key={h} className="text-left px-5 py-4 text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{filtered.map(panel => <tr key={panel.id} className="border-b border-white/[0.04]"><td className="px-5 py-4"><p className="text-white font-black text-sm">{panel.panel_name || "Unnamed"}</p><p className="text-yellow-500 text-[10px]">{panel.panel_code || "N/A"}</p></td><td className="px-5 py-4 text-xs text-slate-300">{panel.panel_type || "N/A"}</td><td className="px-5 py-4 text-xs text-slate-300">{panel.area || "N/A"} — {panel.location || "N/A"}</td><td className="px-5 py-4 text-xs text-slate-300">{panel.status || "unknown"}</td><td className="px-5 py-4"><div className="flex gap-2"><button onClick={() => setSelected(panel)} className="w-9 h-9 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center"><Eye size={15}/></button><button onClick={() => restore(panel)} className="w-9 h-9 bg-green-500/10 text-green-400 rounded-xl flex items-center justify-center"><RotateCcw size={15}/></button><button onClick={() => permanentDelete(panel)} className="w-9 h-9 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center"><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
      </div>
      {selected && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setSelected(null)}><div className="w-full max-w-2xl bg-[#07101f] border border-white/10 rounded-3xl p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}><div className="flex justify-between items-center mb-5"><h2 className="text-xl font-black text-white">Panel Details</h2><button onClick={() => setSelected(null)} className="px-4 py-2 bg-white/5 rounded-xl text-white">Close</button></div><pre className="text-xs text-slate-300 whitespace-pre-wrap break-words">{JSON.stringify(selected, null, 2)}</pre></div></div>}
    </div>
  );
}
