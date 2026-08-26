import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Download, FileSpreadsheet, FileText, Plus, Printer, RefreshCw, Trash2, Zap } from "lucide-react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { getUser } from "./utils/auth";

const PF_DEFAULT = 2000;
const n = v => Number(v) || 0;
const localToday = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};
const monthStart = d => {
  const x = new Date(`${d}T00:00:00`);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`;
};
const monthEnd = d => {
  const x = new Date(`${d}T00:00:00`);
  const y = new Date(x.getFullYear(), x.getMonth() + 1, 0);
  return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
};
const fmt = v => n(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white";
const light = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900";
const label = "mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-500";

function Card({ title, value, tone = "blue" }) {
  const c = { blue: "text-blue-400", yellow: "text-yellow-400", green: "text-green-400", orange: "text-orange-400" };
  return <div className="rounded-2xl border border-white/5 bg-[#020617] p-4">
    <div className="flex items-center justify-between"><span className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{title}</span><Zap size={15} className={c[tone]} /></div>
    <div className={`mt-2 text-2xl font-black ${c[tone]}`}>{fmt(value)}<small className="ml-1 text-[10px] text-slate-500">KWH</small></div>
  </div>;
}

const empty = previous => ({
  date: localToday(), time: "08:00", previousReading: previous ?? "", currentReading: "", pf: PF_DEFAULT,
  dayUnits: "", nightUnits: "", preDepartUnits: "", notes: ""
});

export default function WapdaManagement() {
  const user = getUser();
  const [rows, setRows] = useState([]);
  const [view, setView] = useState("report");
  const [mode, setMode] = useState("monthly");
  const [anchor, setAnchor] = useState(localToday());
  const [from, setFrom] = useState(localToday());
  const [to, setTo] = useState(localToday());
  const [draft, setDraft] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onSnapshot(collection(db, "wapdaReadings"), snap => {
    const data = snap.docs.map(x => ({ id: x.id, ...x.data() }));
    setRows(data);
    if (view === "entry" && !draft.currentReading && !draft.previousReading && data.length) {
      const latest = [...data].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.time || "").localeCompare(String(a.time || "")))[0];
      setDraft(d => ({ ...d, previousReading: latest?.currentReading ?? "" }));
    }
  }, err => setMessage(err.message || "WAPDA data load failed.")), []);

  const sorted = useMemo(() => [...rows].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || ""))), [rows]);
  const latestCurrent = sorted.length ? sorted[sorted.length - 1].currentReading : "";

  const filtered = useMemo(() => {
    let start = anchor, end = anchor;
    const d = new Date(`${anchor}T00:00:00`);
    if (mode === "monthly") { start = monthStart(anchor); end = monthEnd(anchor); }
    if (mode === "weekly") {
      const s = new Date(d); s.setDate(d.getDate() - d.getDay());
      const e = new Date(s); e.setDate(s.getDate() + 6);
      start = s.toISOString().slice(0, 10); end = e.toISOString().slice(0, 10);
    }
    if (mode === "custom") { start = from; end = to; }
    return sorted.filter(x => String(x.date || "") >= start && String(x.date || "") <= end);
  }, [sorted, mode, anchor, from, to]);

  const totals = useMemo(() => ({
    consumed: filtered.reduce((s, x) => s + n(x.consumedKwh), 0),
    day: filtered.reduce((s, x) => s + n(x.dayUnits), 0),
    night: filtered.reduce((s, x) => s + n(x.nightUnits), 0),
    pre: filtered.reduce((s, x) => s + n(x.preDepartUnits), 0),
    net: filtered.reduce((s, x) => s + n(x.netUnits), 0)
  }), [filtered]);

  const calculated = useMemo(() => {
    const previous = n(draft.previousReading);
    const current = n(draft.currentReading);
    const pf = n(draft.pf) || PF_DEFAULT;
    const consumed = current >= previous ? (current - previous) * pf : 0;
    const pre = n(draft.preDepartUnits);
    const net = consumed - pre;
    return { previous, current, pf, consumed, pre, net };
  }, [draft]);

  const openEntry = () => {
    setMessage("");
    setDraft(empty(latestCurrent));
    setView("entry");
  };

  const save = async e => {
    e.preventDefault(); setSaving(true); setMessage("");
    if (!draft.date) { setMessage("Date is required."); setSaving(false); return; }
    if (calculated.current < calculated.previous) { setMessage("Current meter reading cannot be lower than previous reading."); setSaving(false); return; }
    if (calculated.pf <= 0) { setMessage("PF must be greater than 0."); setSaving(false); return; }
    if (calculated.current === calculated.previous && calculated.pre === 0) { setMessage("Enter a new Current Meter Reading or Pre Depart Units."); setSaving(false); return; }
    try {
      await addDoc(collection(db, "wapdaReadings"), {
        date: draft.date,
        time: draft.time || "08:00",
        previousReading: Number(calculated.previous.toFixed(2)),
        currentReading: Number(calculated.current.toFixed(2)),
        pf: Number(calculated.pf.toFixed(4)),
        consumedKwh: Number(calculated.consumed.toFixed(2)),
        dayUnits: n(draft.dayUnits),
        nightUnits: n(draft.nightUnits),
        preDepartUnits: Number(calculated.pre.toFixed(2)),
        netUnits: Number(calculated.net.toFixed(2)),
        notes: draft.notes || "",
        recordedBy: user?.name || user?.email || "Admin",
        userId: user?.uid || user?.id || "",
        calculationVersion: "PF2000_EXCEL_STYLE_V1",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setMessage("WAPDA reading saved successfully.");
      setDraft(empty(calculated.current));
      setView("report");
    } catch (err) { setMessage(err.message || "Could not save WAPDA reading."); }
    finally { setSaving(false); }
  };

  const remove = async id => {
    if (!window.confirm("Delete this WAPDA reading permanently?")) return;
    try { await deleteDoc(doc(db, "wapdaReadings", id)); setMessage("WAPDA reading deleted."); }
    catch (err) { setMessage(err.message || "Delete failed."); }
  };

  const exportCsv = () => {
    const data = filtered.map(x => [x.date, x.time || "", x.previousReading, x.currentReading, x.consumedKwh, x.dayUnits, x.nightUnits, x.preDepartUnits, x.netUnits, x.recordedBy || ""]);
    const csv = [["Date", "Time", "Previous", "Current", "Consumed", "Day", "Night", "Units", "Net Units", "Recorded By"], ...data]
      .map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `wapda-report-${anchor}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const wsData = [
      ["Daily KWH WAPDA Reading"],
      ["Date", "Time", "KWh", "", "", "", "", "Pre Depart", ""],
      ["", "", "Previous", "Current", "Consumed", "Day", "Night", "Units", "Net Units"],
      ...filtered.map(x => [x.date, x.time || "", n(x.previousReading), n(x.currentReading), n(x.consumedKwh), n(x.dayUnits), n(x.nightUnits), n(x.preDepartUnits), n(x.netUnits)])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["A1"].s = { font: { bold: true, sz: 16 }, alignment: { horizontal: "center" } };
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 2 }, e: { r: 1, c: 6 } },
      { s: { r: 1, c: 7 }, e: { r: 1, c: 8 } }
    ];
    ws["!cols"] = [{ wch: 14 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WAPDA Reading");
    XLSX.writeFile(wb, `WAPDA-Reading-${anchor}.xlsx`);
  };

  return <div className="space-y-5 print:bg-white print:text-black">
    <style>{`@media print { body{background:#fff!important;color:#000!important}.no-print{display:none!important}.wapda-print-table{display:table!important;width:100%!important;border-collapse:collapse!important}.wapda-print-table th,.wapda-print-table td{border:1px solid #222!important;padding:6px!important;color:#000!important;font-size:10px!important}.print-title{display:block!important;text-align:center!important;font-size:18px!important;font-weight:800!important;margin-bottom:12px!important} } .print-title{display:none}`}</style>
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-black">WAPDA Management</h2><p className="text-xs text-slate-500 mt-1">Daily meter readings, KWH consumption and Excel-style utility reports.</p></div>
      <div className="flex gap-2"><button onClick={openEntry} className="px-4 py-2.5 rounded-xl bg-yellow-500 text-black text-xs font-black flex items-center gap-2"><Plus size={15}/>WAPDA ENTRY</button><button onClick={()=>setView("report")} className="px-4 py-2.5 rounded-xl bg-white/5 text-xs font-black flex items-center gap-2"><FileText size={15}/>REPORT</button><button onClick={()=>window.location.reload()} className="p-2.5 rounded-xl bg-white/5"><RefreshCw size={15}/></button></div>
    </div>
    {message && <div className="no-print rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">{message}</div>}

    {view === "entry" && <form onSubmit={save} className="no-print space-y-5">
      <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div><label className={label}>Date *</label><input required type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})} className={light}/></div>
        <div><label className={label}>Time</label><input type="time" value={draft.time} onChange={e=>setDraft({...draft,time:e.target.value})} className={light}/></div>
        <div><label className={label}>PF</label><input type="number" step="0.0001" min="0.0001" value={draft.pf} onChange={e=>setDraft({...draft,pf:e.target.value})} className={light}/><p className="mt-1 text-[10px] text-slate-500">Default 2000 — editable</p></div>
        <div><label className={label}>Previous Meter Reading</label><input type="number" step=".01" min="0" value={draft.previousReading} onChange={e=>setDraft({...draft,previousReading:e.target.value})} className={light}/></div>
        <div><label className={label}>Current Meter Reading *</label><input required type="number" step=".01" min="0" value={draft.currentReading} onChange={e=>setDraft({...draft,currentReading:e.target.value})} className={light}/></div>
      </div></section>

      <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><h3 className="font-black text-lg">KWh Calculation</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div><label className={label}>Formula</label><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-black">(Current − Previous) × PF</div></div>
        <div><label className={label}>Consumed KWH</label><div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 font-black text-blue-800">{fmt(calculated.consumed)} KWH</div></div>
        <div><label className={label}>PF Used</label><div className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-3 font-black text-yellow-800">{fmt(calculated.pf)}</div></div>
      </div></section>

      <section className="rounded-[2rem] bg-white text-slate-900 p-5 md:p-7"><h3 className="font-black text-lg">Day / Night / Pre Depart</h3><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
        <div><label className={label}>Day Units</label><input type="number" step=".01" min="0" value={draft.dayUnits} onChange={e=>setDraft({...draft,dayUnits:e.target.value})} className={light}/></div>
        <div><label className={label}>Night Units</label><input type="number" step=".01" min="0" value={draft.nightUnits} onChange={e=>setDraft({...draft,nightUnits:e.target.value})} className={light}/></div>
        <div><label className={label}>Pre Depart Units</label><input type="number" step=".01" min="0" value={draft.preDepartUnits} onChange={e=>setDraft({...draft,preDepartUnits:e.target.value})} className={light}/></div>
        <div><label className={label}>Net Units (Auto)</label><div className={`rounded-xl border px-3 py-3 font-black ${calculated.net < 0 ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>{fmt(calculated.net)} KWH</div></div>
      </div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5"><Card title="Consumed" value={calculated.consumed} tone="orange"/><Card title="Day" value={draft.dayUnits}/><Card title="Night" value={draft.nightUnits}/><Card title="Pre Depart" value={calculated.pre} tone="yellow"/><Card title="Net Units" value={calculated.net} tone="green"/></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5"><div><label className={label}>Recorded By</label><input readOnly value={user?.name||user?.email||"Admin"} className={light}/></div><div><label className={label}>Notes</label><input value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} className={light}/></div></div>
      <div className="flex justify-end mt-5"><button disabled={saving} className="px-7 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black">{saving?"SAVING...":"SAVE WAPDA READING"}</button></div></section>
    </form>}

    {view === "report" && <div className="space-y-5">
      <div className="no-print rounded-[2rem] bg-[#020617] border border-white/5 p-5"><div className="flex flex-wrap items-end gap-2"><select value={mode} onChange={e=>setMode(e.target.value)} className={input+" w-auto"}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>{mode==="custom"?<><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={input+" w-auto"}/><input type="date" value={to} onChange={e=>setTo(e.target.value)} className={input+" w-auto"}/></>:<input type="date" value={anchor} onChange={e=>setAnchor(e.target.value)} className={input+" w-auto"}/>}<button onClick={exportExcel} className="px-4 py-3 rounded-xl bg-green-500 text-black text-xs font-black"><FileSpreadsheet size={15} className="inline mr-1"/>EXCEL</button><button onClick={exportCsv} className="px-4 py-3 rounded-xl bg-yellow-500 text-black text-xs font-black"><Download size={15} className="inline mr-1"/>CSV</button><button onClick={()=>window.print()} className="px-4 py-3 rounded-xl bg-white/5 text-xs font-black"><Printer size={15} className="inline mr-1"/>PRINT / PDF</button></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5"><Card title="Consumed" value={totals.consumed} tone="orange"/><Card title="Day Units" value={totals.day}/><Card title="Night Units" value={totals.night}/><Card title="Pre Depart" value={totals.pre} tone="yellow"/><Card title="Net Units" value={totals.net} tone="green"/></div><p className="text-[10px] text-slate-500 mt-4">WAPDA report: {filtered.length} readings</p></div>
      <div className="print-title">Daily KWH WAPDA Reading</div>
      <section className="rounded-[2rem] border border-white/5 bg-[#020617] overflow-hidden"><div className="overflow-x-auto"><table className="wapda-print-table w-full min-w-[1000px]"><thead><tr className="border-b border-white/5"><th rowSpan="2" className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Date</th><th rowSpan="2" className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Time</th><th colSpan="5" className="px-4 py-3 text-center text-[9px] uppercase tracking-widest text-red-500">KWh</th><th colSpan="2" className="px-4 py-3 text-center text-[9px] uppercase tracking-widest text-red-500">Pre Depart</th><th rowSpan="2" className="no-print px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Action</th></tr><tr className="border-b border-white/5"><th className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Previous</th><th className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Current</th><th className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Consumed</th><th className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Day</th><th className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Night</th><th className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Units</th><th className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-500">Net Units</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id} className="border-b border-white/[.04]"><td className="px-4 py-3 text-xs font-bold">{x.date}</td><td className="px-4 py-3 text-xs text-slate-400">{x.time||"—"}</td><td className="px-4 py-3 text-xs">{fmt(x.previousReading)}</td><td className="px-4 py-3 text-xs">{fmt(x.currentReading)}</td><td className="px-4 py-3 text-xs text-orange-400 font-black">{fmt(x.consumedKwh)}</td><td className="px-4 py-3 text-xs">{fmt(x.dayUnits)}</td><td className="px-4 py-3 text-xs">{fmt(x.nightUnits)}</td><td className="px-4 py-3 text-xs">{fmt(x.preDepartUnits)}</td><td className="px-4 py-3 text-xs text-green-400 font-black">{fmt(x.netUnits)}</td><td className="no-print px-4 py-3"><button onClick={()=>remove(x.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400"><Trash2 size={14}/></button></td></tr>)}</tbody></table>{!filtered.length&&<div className="p-16 text-center text-xs uppercase tracking-widest text-slate-600">No WAPDA readings for this period.</div>}</div></section>
    </div>}
  </div>;
}
