import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Calculator, Download, FileSpreadsheet, FileText, Plus, Printer, RefreshCw, Trash2, X } from "lucide-react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { getUser } from "./utils/auth";

const PF_DEFAULT = 2000;
const n = value => Number(value) || 0;
const fmt = value => n(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const monthStart = value => {
  const d = new Date(`${value}T00:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const monthEnd = value => {
  const d = new Date(`${value}T00:00:00`);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
};

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/15";
const darkFieldClass = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/15";
const labelClass = "mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500";

function StatCard({ title, value, tone = "blue" }) {
  const toneClass = {
    blue: "text-blue-500",
    yellow: "text-yellow-500",
    orange: "text-orange-500",
    green: "text-green-500"
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">{title}</div>
      <div className={`mt-1 text-lg font-black ${toneClass}`}>{fmt(value)} <span className="text-[9px] text-slate-400">KWH</span></div>
    </div>
  );
}

const emptyDraft = previous => ({
  date: localToday(),
  time: "08:00",
  pf: PF_DEFAULT,
  previousReading: previous ?? "",
  currentReading: "",
  dayUnits: "",
  nightUnits: "",
  preDepartUnits: ""
});

function MiniCalculator() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [op, setOp] = useState("+");

  const result = useMemo(() => {
    if (a === "" || b === "") return "";
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
    if (op === "+") return x + y;
    if (op === "-") return x - y;
    if (op === "×") return x * y;
    if (op === "÷") return y === 0 ? "—" : x / y;
    return "";
  }, [a, b, op]);

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:sticky md:top-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white"><Calculator size={15} /></span>
          <div><div className="text-sm font-black text-slate-900">Calculator</div><div className="text-[9px] font-semibold text-slate-500">Basic DMAS</div></div>
        </div>
        <button type="button" onClick={() => { setA(""); setB(""); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Clear"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input aria-label="Calculator first number" type="number" step="any" value={a} onChange={e => setA(e.target.value)} className={darkFieldClass} placeholder="0" />
        <select aria-label="Calculator operation" value={op} onChange={e => setOp(e.target.value)} className="h-[46px] w-12 rounded-xl border border-slate-700 bg-slate-950 text-center text-sm font-black text-yellow-400">
          <option>+</option><option>-</option><option>×</option><option>÷</option>
        </select>
        <input aria-label="Calculator second number" type="number" step="any" value={b} onChange={e => setB(e.target.value)} className={darkFieldClass} placeholder="0" />
      </div>
      <div className="mt-3 rounded-xl bg-slate-950 px-4 py-3">
        <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Result</div>
        <div className="mt-1 text-xl font-black text-yellow-400">{result === "" ? "—" : fmt(result)}</div>
      </div>
    </aside>
  );
}

export default function WapdaManagement() {
  const user = getUser();
  const [rows, setRows] = useState([]);
  const [view, setView] = useState("report");
  const [mode, setMode] = useState("monthly");
  const [anchor, setAnchor] = useState(localToday());
  const [from, setFrom] = useState(localToday());
  const [to, setTo] = useState(localToday());
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onSnapshot(
    collection(db, "wapdaReadings"),
    snapshot => setRows(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => setMessage(error.message || "WAPDA data load failed.")
  ), []);

  const sorted = useMemo(() => [...rows].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || ""))
  ), [rows]);

  const latestCurrent = sorted.length ? sorted[sorted.length - 1].currentReading : "";

  const filtered = useMemo(() => {
    let start = anchor;
    let end = anchor;
    const date = new Date(`${anchor}T00:00:00`);
    if (mode === "monthly") { start = monthStart(anchor); end = monthEnd(anchor); }
    if (mode === "weekly") {
      const startDate = new Date(date);
      startDate.setDate(date.getDate() - date.getDay());
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      start = startDate.toISOString().slice(0, 10);
      end = endDate.toISOString().slice(0, 10);
    }
    if (mode === "custom") { start = from; end = to; }
    return sorted.filter(row => String(row.date || "") >= start && String(row.date || "") <= end);
  }, [sorted, mode, anchor, from, to]);

  const totals = useMemo(() => ({
    consumed: filtered.reduce((sum, row) => sum + n(row.consumedKwh), 0),
    day: filtered.reduce((sum, row) => sum + n(row.dayUnits), 0),
    night: filtered.reduce((sum, row) => sum + n(row.nightUnits), 0),
    pre: filtered.reduce((sum, row) => sum + n(row.preDepartUnits), 0),
    net: filtered.reduce((sum, row) => sum + n(row.netUnits), 0)
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
    setDraft(emptyDraft(latestCurrent));
    setView("entry");
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    if (!draft.date) { setMessage("Date is required."); setSaving(false); return; }
    if (calculated.current < calculated.previous) { setMessage("Current meter reading cannot be lower than previous reading."); setSaving(false); return; }
    if (calculated.pf <= 0) { setMessage("PF must be greater than 0."); setSaving(false); return; }
    if (calculated.current === calculated.previous && calculated.pre === 0) { setMessage("Enter a new current reading or Pre Depart Units."); setSaving(false); return; }

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
        recordedBy: user?.name || user?.email || "Admin",
        userId: user?.uid || user?.id || "",
        calculationVersion: "PF2000_EXCEL_STYLE_V2",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setMessage("WAPDA reading saved successfully.");
      setDraft(emptyDraft(calculated.current));
      setView("report");
    } catch (error) {
      setMessage(error.message || "Could not save WAPDA reading.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async id => {
    if (!window.confirm("Delete this WAPDA reading permanently?")) return;
    try {
      await deleteDoc(doc(db, "wapdaReadings", id));
      setMessage("WAPDA reading deleted.");
    } catch (error) {
      setMessage(error.message || "Delete failed.");
    }
  };

  const exportCsv = () => {
    const data = filtered.map(row => [
      row.date, row.time || "", row.previousReading, row.currentReading, row.consumedKwh,
      row.dayUnits, row.nightUnits, row.preDepartUnits, row.netUnits
    ]);
    const csv = [["Date", "Time", "Previous", "Current", "Consumed", "Day", "Night", "Pre-Depart Units", "Net Units"], ...data]
      .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `WAPDA-Report-${anchor}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const data = [
      ["Daily KWH WAPDA Reading"],
      ["Date", "Time", "KWh", "", "", "", "", "Pre Depart", ""],
      ["", "", "Previous", "Current", "Consumed", "Day", "Night", "Units", "Net Units"],
      ...filtered.map(row => [row.date, row.time || "", n(row.previousReading), n(row.currentReading), n(row.consumedKwh), n(row.dayUnits), n(row.nightUnits), n(row.preDepartUnits), n(row.netUnits)])
    ];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 2 }, e: { r: 1, c: 6 } },
      { s: { r: 1, c: 7 }, e: { r: 1, c: 8 } }
    ];
    sheet["!cols"] = [
      { wch: 14 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 17 }, { wch: 15 }
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "WAPDA Reading");
    XLSX.writeFile(book, `WAPDA-Reading-${anchor}.xlsx`);
  };

  return (
    <div className="wapda-module min-w-0 space-y-4">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: #fff !important; color: #000 !important; }
          .no-print { display: none !important; }
          .wapda-print-area { display: block !important; width: 100% !important; }
          .wapda-print-title { display: block !important; text-align: center !important; color: #000 !important; font-size: 18px !important; font-weight: 800 !important; margin: 0 0 8px !important; }
          .wapda-print-meta { display: block !important; text-align: center !important; color: #333 !important; font-size: 10px !important; margin-bottom: 8px !important; }
          .wapda-print-table { display: table !important; width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; }
          .wapda-print-table th, .wapda-print-table td { border: 1px solid #222 !important; color: #000 !important; background: #fff !important; padding: 5px 4px !important; font-size: 9px !important; text-align: center !important; white-space: nowrap !important; }
          .wapda-print-table th { font-weight: 800 !important; }
          .wapda-print-summary { display: grid !important; grid-template-columns: repeat(5, 1fr) !important; gap: 5px !important; margin-bottom: 8px !important; }
          .wapda-print-summary > div { border: 1px solid #222 !important; padding: 5px !important; color: #000 !important; background: #fff !important; }
          .wapda-print-summary span { color: #000 !important; }
          .wapda-print-summary .value { font-size: 11px !important; font-weight: 800 !important; }
        }
        .wapda-print-title, .wapda-print-meta, .wapda-print-summary { display: none; }
        @media (max-width: 640px) {
          .wapda-module { font-size: 14px; }
        }
      `}</style>

      <div className="no-print flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">WAPDA Management</h2>
          <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">Meter readings, consumption and utility report.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" onClick={openEntry} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 py-2.5 text-xs font-black text-black sm:flex-none"><Plus size={15} /> WAPDA ENTRY</button>
          <button type="button" onClick={() => setView("report")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-xs font-black text-white sm:flex-none"><FileText size={15} /> REPORT</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-white/5 p-2.5 text-white" title="Refresh"><RefreshCw size={15} /></button>
        </div>
      </div>

      {message && <div className="no-print rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-xs font-bold text-yellow-300">{message}</div>}

      {view === "entry" && (
        <form onSubmit={save} className="no-print">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0 space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div><label className={labelClass}>Date *</label><input required type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} className={fieldClass} /></div>
                  <div><label className={labelClass}>Time</label><input type="time" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} className={fieldClass} /></div>
                  <div><label className={labelClass}>PF</label><input type="number" step="0.0001" min="0.0001" value={draft.pf} onChange={e => setDraft({ ...draft, pf: e.target.value })} className={fieldClass} /></div>
                  <div><label className={labelClass}>Previous Reading</label><input type="number" step=".01" min="0" value={draft.previousReading} onChange={e => setDraft({ ...draft, previousReading: e.target.value })} className={fieldClass} /></div>
                  <div><label className={labelClass}>Current Reading *</label><input required type="number" step=".01" min="0" value={draft.currentReading} onChange={e => setDraft({ ...draft, currentReading: e.target.value })} className={fieldClass} /></div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Consumed KWH</div>
                    <div className="mt-2 text-2xl font-black text-blue-700 sm:text-3xl">{fmt(calculated.consumed)}</div>
                  </div>
                  <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pre Depart Units</div>
                    <div className="mt-2 text-2xl font-black text-yellow-700 sm:text-3xl">{fmt(calculated.pre)}</div>
                  </div>
                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Net Units</div>
                    <div className="mt-2 text-2xl font-black text-green-700 sm:text-3xl">{fmt(calculated.net)}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><label className={labelClass}>Day Units</label><input type="number" step=".01" min="0" value={draft.dayUnits} onChange={e => setDraft({ ...draft, dayUnits: e.target.value })} className={fieldClass} /></div>
                  <div><label className={labelClass}>Night Units</label><input type="number" step=".01" min="0" value={draft.nightUnits} onChange={e => setDraft({ ...draft, nightUnits: e.target.value })} className={fieldClass} /></div>
                  <div><label className={labelClass}>Pre Depart Units</label><input type="number" step=".01" min="0" value={draft.preDepartUnits} onChange={e => setDraft({ ...draft, preDepartUnits: e.target.value })} className={fieldClass} /></div>
                </div>
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[10px] text-slate-400">PF: {fmt(calculated.pf)}</div>
                  <button disabled={saving} type="submit" className="w-full rounded-xl bg-yellow-500 px-6 py-3 text-xs font-black text-black shadow-sm transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{saving ? "SAVING..." : "SAVE WAPDA READING"}</button>
                </div>
              </section>
            </div>
            <MiniCalculator />
          </div>
        </form>
      )}

      {view === "report" && (
        <div className="wapda-print-area min-w-0 space-y-4">
          <div className="wapda-print-title">Daily KWH WAPDA Reading</div>
          <div className="wapda-print-meta">{mode === "custom" ? `${from} to ${to}` : `${mode.toUpperCase()} REPORT — ${anchor}`}</div>

          <section className="no-print rounded-2xl border border-white/5 bg-[#020617] p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[130px] flex-1 sm:flex-none"><label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-slate-500">Period</label><select value={mode} onChange={e => setMode(e.target.value)} className={darkFieldClass}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select></div>
              {mode === "custom" ? <><div className="min-w-[145px] flex-1 sm:flex-none"><label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-slate-500">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={darkFieldClass} /></div><div className="min-w-[145px] flex-1 sm:flex-none"><label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-slate-500">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={darkFieldClass} /></div></> : <div className="min-w-[145px] flex-1 sm:flex-none"><label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-slate-500">Date</label><input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className={darkFieldClass} /></div>}
              <div className="ml-auto flex w-full gap-2 sm:w-auto"><button type="button" onClick={exportExcel} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-yellow-500 px-3 py-3 text-xs font-black text-black sm:flex-none"><FileSpreadsheet size={14} /> XLSX</button><button type="button" onClick={exportCsv} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/5 px-3 py-3 text-xs font-black text-white sm:flex-none"><Download size={14} /> CSV</button><button type="button" onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/5 px-3 py-3 text-xs font-black text-white sm:flex-none"><Printer size={14} /> PRINT</button></div>
            </div>
          </section>

          <div className="wapda-print-summary grid grid-cols-2 gap-2 md:grid-cols-5">
            <StatCard title="Consumed KWH" value={totals.consumed} tone="orange" />
            <StatCard title="Day Units" value={totals.day} />
            <StatCard title="Night Units" value={totals.night} />
            <StatCard title="Pre-Depart Units" value={totals.pre} tone="yellow" />
            <StatCard title="Net Units" value={totals.net} tone="green" />
          </div>

          <section className="overflow-hidden rounded-2xl border border-white/5 bg-[#020617]">
            <div className="overflow-x-auto">
              <table className="wapda-print-table w-full min-w-[980px] border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[.03]">
                    {['Date', 'Time', 'Previous', 'Current', 'Consumed KWH', 'Day', 'Night', 'Pre-Depart Units', 'Net Units', 'Action'].map(header => <th key={header} className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.id} className="border-b border-white/[.04]">
                      <td className="px-3 py-2.5 text-xs font-bold text-white">{row.date}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{row.time || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-white">{fmt(row.previousReading)}</td>
                      <td className="px-3 py-2.5 text-xs text-white">{fmt(row.currentReading)}</td>
                      <td className="px-3 py-2.5 text-xs font-black text-orange-400">{fmt(row.consumedKwh)}</td>
                      <td className="px-3 py-2.5 text-xs text-white">{fmt(row.dayUnits)}</td>
                      <td className="px-3 py-2.5 text-xs text-white">{fmt(row.nightUnits)}</td>
                      <td className="px-3 py-2.5 text-xs text-white">{fmt(row.preDepartUnits)}</td>
                      <td className="px-3 py-2.5 text-xs font-black text-green-400">{fmt(row.netUnits)}</td>
                      <td className="no-print px-3 py-2.5"><button type="button" onClick={() => remove(row.id)} className="rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20" title="Delete"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && <div className="p-14 text-center text-xs font-bold uppercase tracking-wider text-slate-600">No WAPDA readings for this period.</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
