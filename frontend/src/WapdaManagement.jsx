import React, { useMemo, useState, useEffect } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { CalendarDays, Download, FileText, Plus, Printer, RefreshCw, Trash2, Zap } from "lucide-react";
import { db } from "./firebase";
import { getUser } from "./utils/auth";

const n = v => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = d => { const x = new Date(`${d}T00:00:00`); return new Date(x.getFullYear(), x.getMonth(), 1).toISOString().slice(0, 10); };
const monthEnd = d => { const x = new Date(`${d}T00:00:00`); return new Date(x.getFullYear(), x.getMonth() + 1, 0).toISOString().slice(0, 10); };
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white";
const light = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900";
const label = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";

function Card({ title, value, unit = "KWH", tone = "blue" }) {
  const c = { blue: "text-blue-400", yellow: "text-yellow-400", green: "text-green-400", orange: "text-orange-400", white: "text-white" };
  return <div className="rounded-2xl border border-white/5 bg-[#020617] p-4"><div className="flex items-center justify-between"><span className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</span><Zap size={15} className={c[tone]} /></div><div className={`mt-2 text-2xl font-black ${c[tone]}`}>{Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:2})}<small className="ml-1 text-[10px] text-slate-500">{unit}</small></div></div>;
}

const empty = () => ({ date: today(), time: "", previousReading: "", currentReading: "", dayUnits: "", nightUnits: "", preDepartUnits: "", consumedKwh: "", netUnits: "", notes: "" });

export default function WapdaManagement() {
  const user = getUser();
  const [rows, setRows] = useState([]);
  const [view, setView] = useState("report");
  const [mode, setMode] = useState("monthly");
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [draft, setDraft] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onSnapshot(collection(db, "wapdaReadings"), snap => {
    setRows(snap.docs.map(x => ({ id: x.id, ...x.data() })));
  }, err => setMessage(err.message || "WAPDA data load failed.")), []);

  const sorted = useMemo(() => [...rows].sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")) || String(a.time||"").localeCompare(String(b.time||""))), [rows]);
  const filtered = useMemo(() => {
    let start = anchor, end = anchor;
    const d = new Date(`${anchor}T00:00:00`);
    if (mode === "monthly") { start = monthStart(anchor); end = monthEnd(anchor); }
    if (mode === "weekly") { const s = new Date(d); s.setDate(d.getDate()-d.getDay()); const e = new Date(s); e.setDate(s.getDate()+6); start=s.toISOString().slice(0,10); end=e.toISOString().slice(0,10); }
    if (mode === "custom") { start = from; end = to; }
    return sorted.filter(x => String(x.date||"") >= start && String(x.date||"") <= end);
  }, [sorted, mode, anchor, from, to]);

  const totals = useMemo(() => ({
    consumed: filtered.reduce((s,x)=>s+n(x.consumedKwh),0),
    day: filtered.reduce((s,x)=>s+n(x.dayUnits),0),
    night: filtered.reduce((s,x)=>s+n(x.nightUnits),0),
    pre: filtered.reduce((s,x)=>s+n(x.preDepartUnits),0),
    net: filtered.reduce((s,x)=>s+n(x.netUnits),0)
  }), [filtered]);

  const calculated = useMemo(() => {
    const meter = n(draft.currentReading) - n(draft.previousReading);
    const consumed = n(draft.consumedKwh) || (meter > 0 ? meter : 0);
    const net = n(draft.netUnits) || (n(draft.dayUnits)+n(draft.nightUnits)+n(draft.preDepartUnits));
    return { consumed, net };
  }, [draft]);

  const save = async e => {
    e.preventDefault(); setSaving(true); setMessage("");
    if (!draft.date) { setMessage("Date is required."); setSaving(false); return; }
    if (n(draft.currentReading) < n(draft.previousReading)) { setMessage("Current meter reading cannot be lower than previous reading."); setSaving(false); return; }
    if (calculated.consumed <= 0 && calculated.net <= 0) { setMessage("Enter meter readings or unit values."); setSaving(false); return; }
    try {
      await addDoc(collection(db,"wapdaReadings"), {
        date:draft.date, time:draft.time, previousReading:n(draft.previousReading), currentReading:n(draft.currentReading),
        consumedKwh:Number(calculated.consumed.toFixed(2)), dayUnits:n(draft.dayUnits), nightUnits:n(draft.nightUnits),
        preDepartUnits:n(draft.preDepartUnits), netUnits:Number(calculated.net.toFixed(2)), notes:draft.notes||"",
        recordedBy:user?.name||user?.email||"Admin", userId:user?.uid||user?.id||"", createdAt:serverTimestamp(), updatedAt:serverTimestamp()
      });
      setMessage("WAPDA reading saved successfully."); setDraft(empty()); setView("report");
    } catch(err) { setMessage(err.message || "Could not save WAPDA reading."); }
    finally { setSaving(false); }
  };

  const remove = async id => { if(!window.confirm("Delete this WAPDA reading permanently?")) return; try { await deleteDoc(doc(db,"wapdaReadings",id)); setMessage("WAPDA reading deleted."); } catch(err){ setMessage(err.message||"Delete failed."); } };
  const exportCsv = () => { const data = filtered.map(x=>[x.date,x.time||"",x.previousReading,x.currentReading,x.consumedKwh,x.dayUnits,x.nightUnits,x.preDepartUnits,x.netUnits,x.recordedBy||""]); const csv=[["Date","Time","Previous Reading","Current Reading","Consumed KWH","Day Units","Night Units","Pre-Depart Units","Net Units","Recorded By"],...data].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"); const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); const a=document.createElement("a"); a.href=url; a.download="wapda-report.csv"; a.click(); URL.revokeObjectURL(url); };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-black">WAPDA Management</h2><p className="text-xs text-slate-500 mt-1">Daily meter readings, KWH consumption and utility reports.</p></div>
      <div className="flex gap-2"><button onClick={()=>setView("entry")} className={view==="entry"?"px-4 py-2.5 rounded-xl bg-yellow-500 text-black text-xs font-black flex items-center gap-2":"px-4 py-2.5 rounded-xl bg-white/5 text-xs font-black flex items-center gap-2"}><Plus size={15}/>WAPDA ENTRY</button><button onClick={()=>setView("report")} className={view==="report"?"px-4 py-2.5 rounded-xl bg-yellow-500 text-black text-xs font-black flex items-center gap-2":"px-4 py-2.5 rounded-xl bg-white/5 text-xs font-black flex items-center gap-2"}><FileText size={15}/>REPORT</button><button onClick={()=>window.location.reload()} className="p-2.5 rounded-xl bg-white/5"><RefreshCw size={15}/></button></div>
    </div>
    {message && <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">{message}</div>}

    {view === "entry" && <form onSubmit={save} className="space-y-5">
      <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div><label className={label}>Date *</label><input required type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})} className={light}/></div>
        <div><label className={label}>Time</label><input type="time" value={draft.time} onChange={e=>setDraft({...draft,time:e.target.value})} className={light}/></div>
        <div><label className={label}>Recorded By</label><input readOnly value={user?.name||user?.email||"Admin"} className={light}/></div>
        <div><label className={label}>Notes</label><input value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} className={light}/></div>
      </div></section>
      <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><h3 className="font-black text-lg">WAPDA Meter Reading</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div><label className={label}>Previous Meter Reading</label><input type="number" step=".01" min="0" value={draft.previousReading} onChange={e=>setDraft({...draft,previousReading:e.target.value})} className={light}/></div>
        <div><label className={label}>Current Meter Reading</label><input type="number" step=".01" min="0" value={draft.currentReading} onChange={e=>setDraft({...draft,currentReading:e.target.value})} className={light}/></div>
        <div><label className={label}>Consumed KWH (Auto)</label><div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 font-black text-blue-800">{calculated.consumed.toFixed(2)} KWH</div></div>
      </div></section>
      <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><h3 className="font-black text-lg">Unit Breakdown</h3><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
        <div><label className={label}>Day Units</label><input type="number" step=".01" min="0" value={draft.dayUnits} onChange={e=>setDraft({...draft,dayUnits:e.target.value})} className={light}/></div>
        <div><label className={label}>Night Units</label><input type="number" step=".01" min="0" value={draft.nightUnits} onChange={e=>setDraft({...draft,nightUnits:e.target.value})} className={light}/></div>
        <div><label className={label}>Pre-Depart Units</label><input type="number" step=".01" min="0" value={draft.preDepartUnits} onChange={e=>setDraft({...draft,preDepartUnits:e.target.value})} className={light}/></div>
        <div><label className={label}>Net Units</label><input type="number" step=".01" min="0" value={draft.netUnits} onChange={e=>setDraft({...draft,netUnits:e.target.value})} placeholder={calculated.net.toFixed(2)} className={light}/></div>
      </div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><Card title="Consumed" value={calculated.consumed}/><Card title="Day" value={draft.dayUnits}/><Card title="Night" value={draft.nightUnits}/><Card title="Net" value={calculated.net} tone="green"/></div><div className="flex justify-end mt-5"><button disabled={saving} className="px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">{saving?"SAVING...":"SAVE WAPDA READING"}</button></div></section>
    </form>}

    {view === "report" && <div className="space-y-5"><section className="rounded-[2rem] bg-[#020617] border border-white/5 p-5"><div className="flex flex-wrap items-end gap-2"><select value={mode} onChange={e=>setMode(e.target.value)} className={input+" w-auto"}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>{mode==="custom"?<><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={input+" w-auto"}/><input type="date" value={to} onChange={e=>setTo(e.target.value)} className={input+" w-auto"}/></>:<input type="date" value={anchor} onChange={e=>setAnchor(e.target.value)} className={input+" w-auto"}/>}<button onClick={exportCsv} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Download size={15} className="inline mr-1"/>CSV</button><button onClick={()=>window.print()} className="px-4 py-3 rounded-xl bg-white/5 text-xs font-black"><Printer size={15} className="inline mr-1"/>PRINT</button></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5"><Card title="Consumed KWH" value={totals.consumed} tone="orange"/><Card title="Day Units" value={totals.day}/><Card title="Night Units" value={totals.night}/><Card title="Pre-Depart" value={totals.pre} tone="yellow"/><Card title="Net Units" value={totals.net} tone="green"/></div><p className="text-[10px] text-slate-500 mt-4">WAPDA report: {filtered.length} readings</p></section>
      <section className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1100px]"><thead><tr className="border-b border-white/5">{["Date","Time","Previous","Current","Consumed KWH","Day","Night","Pre-Depart","Net","Recorded By","Action"].map(h=><th key={h} className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">{h}</th>)}</tr></thead><tbody>{filtered.map(x=><tr key={x.id} className="border-b border-white/[.04]"><td className="px-4 py-3 text-xs font-bold">{x.date}</td><td className="px-4 py-3 text-xs text-slate-400">{x.time||"—"}</td><td className="px-4 py-3 text-xs">{n(x.previousReading).toFixed(2)}</td><td className="px-4 py-3 text-xs">{n(x.currentReading).toFixed(2)}</td><td className="px-4 py-3 text-xs text-orange-400 font-black">{n(x.consumedKwh).toFixed(2)}</td><td className="px-4 py-3 text-xs">{n(x.dayUnits).toFixed(2)}</td><td className="px-4 py-3 text-xs">{n(x.nightUnits).toFixed(2)}</td><td className="px-4 py-3 text-xs">{n(x.preDepartUnits).toFixed(2)}</td><td className="px-4 py-3 text-xs text-green-400 font-black">{n(x.netUnits).toFixed(2)}</td><td className="px-4 py-3 text-xs text-slate-400">{x.recordedBy||"—"}</td><td className="px-4 py-3"><button onClick={()=>remove(x.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400"><Trash2 size={14}/></button></td></tr>)}</tbody></table>{!filtered.length&&<div className="p-16 text-center text-xs uppercase tracking-widest text-slate-600">No WAPDA readings for this period.</div>}</div></section></div>}
  </div>;
}
