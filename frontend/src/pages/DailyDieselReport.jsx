import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

const ENGINES = ["1400kva", "1020kva", "650kva"];
const LABELS = { "1400kva": "1400 kva", "1020kva": "1020 kva", "650kva": "650 KVA" };
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const iso = d => new Date(d).toISOString().slice(0, 10);
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const hhmm = v => { const m = Math.max(0, Math.round(n(v) * 60)); return `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`; };
const minutes = v => { if (!v || !String(v).includes(":")) return null; const [h,m] = String(v).split(":").map(Number); return Number.isFinite(h)&&Number.isFinite(m) ? h*60+m : null; };
const timeAfter = (start, duration) => { const base = minutes(start); if (base == null || n(duration) <= 0) return "NILL"; const total = (base + Math.round(n(duration)*60)) % 1440; return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; };
const fmtDate = s => { const d = new Date(`${s}T00:00:00`); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric" }); };
const monthStart = s => { const d = new Date(`${s}T00:00:00`); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const monthEnd = s => { const d = new Date(`${s}T00:00:00`); return iso(new Date(d.getFullYear(), d.getMonth()+1, 0)); };
const period = (anchor, mode, from, to) => {
  if (mode === "custom") return [from, to];
  if (mode === "daily") return [anchor, anchor];
  if (mode === "monthly") return [monthStart(anchor), monthEnd(anchor)];
  const d = new Date(`${anchor}T00:00:00`); const s = new Date(d); s.setDate(d.getDate()-d.getDay()); const e = new Date(s); e.setDate(s.getDate()+6); return [iso(s), iso(e)];
};
const blank = date => ({ id:`blank-${date}`, date, engines:[], other:[], totalConsumption:0, incoming:0, currentStock:"" });
const engineOf = (row,key) => (row.engines || []).find(x => x.name === key) || {};
const otherFuel = row => (row.other || []).filter(x => ["Lifter","Machine"].includes(x.name)).reduce((s,x)=>s+n(x.amount),0);

function aggregateByDate(rows, days) {
  const source = new Map(rows.map(r => [String(r.date||""), r]));
  return days.map(date => {
    const matches = rows.filter(r => String(r.date||"") === date);
    if (!matches.length) return blank(date);
    const result = { ...matches[matches.length-1], id:`daily-${date}`, date, engines:[] };
    ENGINES.forEach(key => {
      const xs = matches.map(r=>engineOf(r,key)).filter(x=>Object.keys(x).length);
      if (!xs.length) { result.engines.push({name:key}); return; }
      const firstStart = xs.map(x=>x.startTime).filter(Boolean).sort()[0] || "";
      const runtime = xs.reduce((s,x)=>s+n(x.duration),0);
      const fuel = xs.reduce((s,x)=>s+n(x.fuel),0);
      const kwh = xs.reduce((s,x)=>s+n(x.kwh),0);
      const currentHours = xs.reduce((m,x)=>Math.max(m,n(x.currentHours)),0);
      const previousHours = xs.reduce((m,x)=>m ? Math.min(m,n(x.previousHours)) : n(x.previousHours),0);
      result.engines.push({ name:key, startTime:firstStart, offTime:timeAfter(firstStart,runtime), duration:runtime, durationDisplay:hhmm(runtime), fuel, kwh, currentHours, previousHours });
    });
    result.totalConsumption = matches.reduce((s,r)=>s+n(r.totalConsumption),0);
    result.incoming = matches.reduce((s,r)=>s+n(r.incoming),0);
    result.otherTotal = matches.reduce((s,r)=>s+n(r.otherTotal),0);
    result.currentStock = [...matches].reverse().find(r=>r.currentStock!==""&&r.currentStock!=null)?.currentStock ?? "";
    return result;
  });
}

function buildDetailedSheet(rows) {
  const head = [
    ["Daily Diesel Consuption & Generator Running  Report"],
    ["Future fashion (pvt.) ltd LHR"],
    ["Date ","Generator Run Time","","","","","","KWh","","","Fuel Consuptions","","","Duration","","","Fuel Stock In Liter","","",""] ,
    ["","1400 kva","","1020 kva","","650 KVA","","","","","","","","","","","Lif & MC","Consumed"," Stock","Incoming"],
    ["","ON","OFF","ON","OFF","ON","OFF","1400 kva","1020 kva","650 kva","1400 kva","1020 kva","650 kva","1400 kva","1020 kva","650 kva","","","",""]
  ];
  const data = rows.map(r => [
    r.date,
    ...ENGINES.flatMap(k=>{ const x=engineOf(r,k); return [x.startTime||"NILL",x.offTime||timeAfter(x.startTime,x.duration)||"NILL"]; }),
    ...ENGINES.map(k=>{ const v=n(engineOf(r,k).kwh); return v ? String(v) : "NILL"; }),
    ...ENGINES.map(k=>{ const v=n(engineOf(r,k).fuel); return v ? `${v.toFixed(2)} L` : "0 LTR"; }),
    ...ENGINES.map(k=>{ const x=engineOf(r,k); return x.durationDisplay||hhmm(x.duration)||"NILL"; }),
    `${otherFuel(r).toFixed(0)} LTR`, `${n(r.totalConsumption).toFixed(0)} LTR`, r.currentStock===""?"":`${n(r.currentStock).toFixed(0)} LTR`, `${n(r.incoming).toFixed(0)} LTR`
  ]);
  const totals = ["Total",...Array(16).fill(""),`${rows.reduce((s,r)=>s+otherFuel(r),0).toFixed(0)} LTR`,`${rows.reduce((s,r)=>s+n(r.totalConsumption),0).toFixed(0)} LTR`,`${n([...rows].reverse().find(r=>r.currentStock!=="")?.currentStock).toFixed(0)} LTR`,`${rows.reduce((s,r)=>s+n(r.incoming),0).toFixed(0)} LTR`];
  const sheet = XLSX.utils.aoa_to_sheet([...head,...data,totals]);
  sheet["!merges"]=[
    {s:{r:0,c:0},e:{r:0,c:19}},{s:{r:1,c:0},e:{r:1,c:19}},{s:{r:2,c:1},e:{r:2,c:6}},{s:{r:2,c:7},e:{r:2,c:9}},{s:{r:2,c:10},e:{r:2,c:12}},{s:{r:2,c:13},e:{r:2,c:15}},{s:{r:2,c:16},e:{r:2,c:19}},{s:{r:3,c:1},e:{r:3,c:2}},{s:{r:3,c:3},e:{r:3,c:4}},{s:{r:3,c:5},e:{r:3,c:6}},{s:{r:3,c:16},e:{r:4,c:16}},{s:{r:3,c:17},e:{r:4,c:17}},{s:{r:3,c:18},e:{r:4,c:18}},{s:{r:3,c:19},e:{r:4,c:19}},{s:{r:2,c:13},e:{r:3,c:15}}
  ];
  sheet["!cols"]=[{wch:12},...Array(15).fill({wch:11}),{wch:11},{wch:12},{wch:11},{wch:12}];
  return sheet;
}

function buildClassicSheet(rows) {
  const data=[
    ["Daily Diesel Consuption & Generator Running  Report"],
    ["Future fashion (pvt.) ltd LHR"],
    ["Date ","Generator Run Time","","","","","","Diesel Detail","","",""] ,
    ["","1400 kva","","1020 kva","","650 KVA","","Lifter & MC","Consumed","Current Stock","Incoming"],
    ["","ON","OFF","ON","OFF","ON","OFF","","","",""]
  ];
  rows.forEach(r=>data.push([r.date,...ENGINES.flatMap(k=>{const x=engineOf(r,k);return[x.startTime||"NILL",x.offTime||timeAfter(x.startTime,x.duration)||"NILL"]}),`${otherFuel(r).toFixed(0)} LTR`,`${n(r.totalConsumption).toFixed(0)} LTR`,r.currentStock===""?"":`${n(r.currentStock).toFixed(0)} LTR`,`${n(r.incoming).toFixed(0)} LTR`]));
  const sheet=XLSX.utils.aoa_to_sheet(data);
  sheet["!merges"]=[{s:{r:0,c:0},e:{r:0,c:10}},{s:{r:1,c:0},e:{r:1,c:10}},{s:{r:2,c:1},e:{r:2,c:6}},{s:{r:2,c:7},e:{r:2,c:10}},{s:{r:3,c:1},e:{r:3,c:2}},{s:{r:3,c:3},e:{r:3,c:4}},{s:{r:3,c:5},e:{r:3,c:6}},{s:{r:3,c:7},e:{r:4,c:7}},{s:{r:3,c:8},e:{r:4,c:8}},{s:{r:3,c:9},e:{r:4,c:9}},{s:{r:3,c:10},e:{r:4,c:10}}];
  return sheet;
}

export default function DailyDieselReport() {
  const [rows,setRows]=useState([]),[mode,setMode]=useState("monthly"),[anchor,setAnchor]=useState(localToday()),[from,setFrom]=useState(localToday()),[to,setTo]=useState(localToday()),[format,setFormat]=useState("detailed"),[loading,setLoading]=useState(true);
  useEffect(()=>onSnapshot(query(collection(db,"entries"),orderBy("createdAt","asc")),s=>{setRows(s.docs.map(d=>({id:d.id,...d.data()})));setLoading(false)},()=>setLoading(false)),[]);
  const [start,end]=period(anchor,mode,from,to);
  const days=useMemo(()=>{const out=[];let d=new Date(`${start}T00:00:00`),e=new Date(`${end}T00:00:00`);if(Number.isNaN(d.getTime())||Number.isNaN(e.getTime())||d>e)return out;while(d<=e){out.push(iso(d));d.setDate(d.getDate()+1);}return out},[start,end]);
  const reportRows=useMemo(()=>aggregateByDate(rows,days),[rows,days]);
  const totals=useMemo(()=>({fuel:reportRows.reduce((s,r)=>s+(r.engines||[]).reduce((a,x)=>a+n(x.fuel),0),0),consumed:reportRows.reduce((s,r)=>s+n(r.totalConsumption),0),incoming:reportRows.reduce((s,r)=>s+n(r.incoming),0),runtime:reportRows.reduce((s,r)=>s+(r.engines||[]).reduce((a,x)=>a+n(x.duration),0),0),lifter:reportRows.reduce((s,r)=>s+otherFuel(r),0)}),[reportRows]);
  const download=()=>{const wb=XLSX.utils.book_new();const sheet=format==="detailed"?buildDetailedSheet(reportRows):buildClassicSheet(reportRows);XLSX.utils.book_append_sheet(wb,sheet,format==="detailed"?"Diesel Report":"Classic Diesel Report");XLSX.writeFile(wb,`Daily-Diesel-Report-${start}-${end}.xlsx`)};
  return <div className="space-y-4">
    <section className="rounded-[2rem] border border-white/10 bg-[#020617] p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[.18em] text-yellow-300"><FileSpreadsheet size={13}/> Official diesel report format</div><h1 className="mt-2 text-2xl font-black md:text-3xl">Daily Diesel Consumption & Generator Running Report</h1><p className="mt-1 text-xs text-slate-500">Matches the supplied Excel structure: Future fashion (pvt.) ltd LHR, generator ON/OFF, kWh, fuel, duration, Lifter & MC, stock and incoming.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setFormat("detailed")} className={`rounded-xl px-4 py-2.5 text-xs font-black ${format==="detailed"?"bg-yellow-500 text-black":"bg-white/5 text-slate-300"}`}>20-COLUMN DETAILED</button><button type="button" onClick={()=>setFormat("classic")} className={`rounded-xl px-4 py-2.5 text-xs font-black ${format==="classic"?"bg-yellow-500 text-black":"bg-white/5 text-slate-300"}`}>11-COLUMN CLASSIC</button><button type="button" onClick={download} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black"><FileSpreadsheet size={14} className="mr-1 inline"/>EXCEL</button><button type="button" onClick={()=>window.print()} className="rounded-xl bg-white/5 px-4 py-2.5 text-xs font-black text-white"><Printer size={14} className="mr-1 inline"/>PRINT</button></div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label><span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Period</span><select value={mode} onChange={e=>setMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-xs font-bold text-white"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Date</span><input type="date" value={anchor} onChange={e=>{setAnchor(e.target.value);setFrom(e.target.value);setTo(e.target.value)}} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-xs font-bold text-white"/></label>
        {mode==="custom"&&<><label><span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">From</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-xs font-bold text-white"/></label><label><span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">To</span><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-xs font-bold text-white"/></label></>}
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Range</p><p className="mt-1 text-xs font-black text-yellow-300">{fmtDate(start)} — {fmtDate(end)}</p></div>
      </div>
    </section>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5"><Metric label="Generator Fuel" value={`${totals.fuel.toFixed(2)} L`} /><Metric label="Total Consumption" value={`${totals.consumed.toFixed(2)} L`} /><Metric label="Incoming" value={`${totals.incoming.toFixed(2)} L`} /><Metric label="Runtime" value={hhmm(totals.runtime)} /><Metric label="Lifter & MC" value={`${totals.lifter.toFixed(0)} L`} /></section>
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-500 bg-white text-slate-900 shadow-2xl">
      <div className="p-3 text-center"><h2 className="text-sm font-black">Daily Diesel Consuption & Generator Running Report</h2><p className="text-[10px] font-semibold">Future fashion (pvt.) ltd LHR</p></div>
      <div className="report-scroll overflow-x-auto">
        {format==="detailed" ? <DetailedTable rows={reportRows} /> : <ClassicTable rows={reportRows} />}
      </div>
    </section>
    {loading&&<div className="text-center text-xs text-yellow-400"><RefreshCw className="mr-2 inline animate-spin" size={14}/>Syncing Firestore records…</div>}
    <style>{`.report-table{border-collapse:collapse;width:100%;min-width:1450px;font-family:Calibri,Arial,sans-serif;font-size:10px}.report-table th,.report-table td{border:1px solid #555;padding:5px 4px;text-align:center;vertical-align:middle;white-space:nowrap;height:26px}.report-table thead tr:nth-child(1) th,.report-table thead tr:nth-child(2) th{background:#d9eaf7;font-weight:800}.report-table thead tr:nth-child(3) th{background:#eef6fb;font-weight:800}.report-table .total{background:#e2f0d9!important;font-weight:900}.classic-table{min-width:920px}@media(max-width:700px){.report-table{font-size:9px}.report-table th,.report-table td{padding:4px 3px}}@media print{html,body{background:#fff!important}.report-scroll{overflow:visible!important}.report-table{min-width:0!important;width:100%!important;font-size:7px!important}.report-table th,.report-table td{padding:2px!important;height:19px!important;color:#000!important}.no-print{display:none!important}@page{size:A3 landscape;margin:7mm}}`}</style>
  </div>;
}

function Metric({label,value}){return <div className="rounded-2xl border border-white/10 bg-[#020617] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p><p className="mt-2 text-lg font-black text-yellow-400">{value}</p></div>}
function DetailedTable({rows}){return <table className="report-table"><thead><tr><th rowSpan="3">Date</th><th colSpan="6">Generator Run Time</th><th colSpan="3">KWh</th><th colSpan="3">Fuel Consuptions</th><th colSpan="3">Duration</th><th colSpan="4">Fuel Stock In Liter</th></tr><tr><th colSpan="2">1400 kva</th><th colSpan="2">1020 kva</th><th colSpan="2">650 KVA</th><th rowSpan="2">1400 kva</th><th rowSpan="2">1020 kva</th><th rowSpan="2">650 kva</th><th rowSpan="2">1400 kva</th><th rowSpan="2">1020 kva</th><th rowSpan="2">650 kva</th><th rowSpan="2">1400 kva</th><th rowSpan="2">1020 kva</th><th rowSpan="2">650 kva</th><th rowSpan="2">Lif & MC</th><th rowSpan="2">Consumed</th><th rowSpan="2">Stock</th><th rowSpan="2">Incoming</th></tr><tr><th>ON</th><th>OFF</th><th>ON</th><th>OFF</th><th>ON</th><th>OFF</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{fmtDate(r.date)}</td>{ENGINES.flatMap(k=>{const x=engineOf(r,k);return[<td key={`${k}-on`}>{x.startTime||"NILL"}</td>,<td key={`${k}-off`}>{x.offTime||timeAfter(x.startTime,x.duration)||"NILL"}</td>]} )}{ENGINES.map(k=><td key={`${k}-kwh`}>{n(engineOf(r,k).kwh)?n(engineOf(r,k).kwh):"NILL"}</td>)}{ENGINES.map(k=><td key={`${k}-fuel`}>{n(engineOf(r,k).fuel)?`${n(engineOf(r,k).fuel).toFixed(2)} L`:"0 LTR"}</td>)}{ENGINES.map(k=><td key={`${k}-dur`}>{engineOf(r,k).durationDisplay||hhmm(engineOf(r,k).duration)||"NILL"}</td>)}<td>{otherFuel(r).toFixed(0)} LTR</td><td>{n(r.totalConsumption).toFixed(0)} LTR</td><td>{r.currentStock===""?"":`${n(r.currentStock).toFixed(0)} LTR`}</td><td>{n(r.incoming).toFixed(0)} LTR</td></tr>)}<tr className="total"><td colSpan="17">Total</td><td>{rows.reduce((s,r)=>s+otherFuel(r),0).toFixed(0)} LTR</td><td>{rows.reduce((s,r)=>s+n(r.totalConsumption),0).toFixed(0)} LTR</td><td>{n([...rows].reverse().find(r=>r.currentStock!=="")?.currentStock).toFixed(0)} LTR</td><td>{rows.reduce((s,r)=>s+n(r.incoming),0).toFixed(0)} LTR</td></tr></tbody></table>}
function ClassicTable({rows}){return <table className="report-table classic-table"><thead><tr><th rowSpan="3">Date</th><th colSpan="6">Generator Run Time</th><th colSpan="4">Diesel Detail</th></tr><tr><th colSpan="2">1400 kva</th><th colSpan="2">1020 kva</th><th colSpan="2">650 KVA</th><th rowSpan="2">Lifter & MC</th><th rowSpan="2">Consumed</th><th rowSpan="2">Current Stock</th><th rowSpan="2">Incoming</th></tr><tr><th>ON</th><th>OFF</th><th>ON</th><th>OFF</th><th>ON</th><th>OFF</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{fmtDate(r.date)}</td>{ENGINES.flatMap(k=>{const x=engineOf(r,k);return[<td key={`${k}-on`}>{x.startTime||"NILL"}</td>,<td key={`${k}-off`}>{x.offTime||timeAfter(x.startTime,x.duration)||"NILL"}</td>]})}<td>{otherFuel(r).toFixed(0)} LTR</td><td>{n(r.totalConsumption).toFixed(0)} LTR</td><td>{r.currentStock===""?"":`${n(r.currentStock).toFixed(0)} LTR`}</td><td>{n(r.incoming).toFixed(0)} LTR</td></tr>)}</tbody></table>}
