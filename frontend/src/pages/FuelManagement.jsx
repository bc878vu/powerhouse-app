import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { BarChart, Bar, CartesianGrid, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Fuel, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";

const ENGINE_TABLES = {
  "1400kva": [[1,22],[5,34],[10,52],[15,68],[20,84],[25,98],[30,114],[35,130],[40,146],[45,162],[50,178],[55,194],[60,210],[65,226],[70,242],[75,258],[80,275],[85,292],[90,310],[100,345]],
  "1020kva": [[1,19],[5,28],[10,40],[15,52],[20,64],[25,75],[30,87],[35,99],[40,112],[45,124],[50,136],[55,148],[60,160],[65,173],[70,185],[75,198],[80,212],[85,225],[90,240],[100,265]],
  "650kva": [[1,13],[5,20],[10,27],[15,34],[20,42],[25,48],[30,56],[35,64],[40,72],[45,80],[50,88],[55,96],[60,105],[65,114],[70,123],[75,132],[80,141],[85,150],[90,160],[100,178]]
};
const ENGINE_KW = { "1400kva": 1120, "1020kva": 816, "650kva": 520 };

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const hours = (v) => {
  if (!v) return 0;
  const p = String(v).replace(".", ":").split(":");
  return num(p[0]) + num(p[1]) / 60;
};
const interpolate = (table, load) => {
  if (load <= table[0][0]) return table[0][1];
  if (load >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i += 1) {
    const [aLoad, aFuel] = table[i]; const [bLoad, bFuel] = table[i + 1];
    if (load >= aLoad && load <= bLoad) return aFuel + ((load - aLoad) / (bLoad - aLoad)) * (bFuel - aFuel);
  }
  return table[table.length - 1][1];
};
const engineFuel = (engine, runHours, kwh) => {
  const h = hours(runHours); if (!h) return 0;
  const expected = ENGINE_KW[engine] * h;
  const load = Math.max(1, Math.min(100, num(kwh) > 0 && expected > 0 ? (num(kwh) / expected) * 100 : 50));
  return Number((interpolate(ENGINE_TABLES[engine], load) * h).toFixed(2));
};
const totalOf = (engineFuelValue, other) => Number((num(engineFuelValue) + other.reduce((s, x) => s + num(x.amount), 0)).toFixed(2));
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({ date: today(), userName: "", engine: "1400kva", startTime: "", runHours: "", kwh: "", incoming: "", previousStock: "", other: [{ name: "", amount: "" }] });

export default function FuelManagement() {
  const [view, setView] = useState("dashboard");
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState(7);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "entries"), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setEntries(rows);
    }, (error) => setMessage(`Firebase error: ${error.message}`));
    return () => unsub();
  }, []);

  const currentStock = useMemo(() => {
    if (!entries.length) return 0;
    const latest = [...entries].reverse().find((x) => x.stock !== undefined);
    if (latest) return num(latest.stock);
    return entries.reduce((stock, x) => stock + num(x.incoming) - num(x.totalConsumption), num(x.previousStock));
  }, [entries]);

  const stats = useMemo(() => {
    const source = filter === "all" ? entries : entries.filter((e) => {
      const d = new Date(e.date || e.createdAt?.seconds * 1000 || Date.now()); const n = new Date();
      if (filter === "today") return d.toDateString() === n.toDateString();
      if (filter === "yesterday") { const y = new Date(n); y.setDate(y.getDate() - 1); return d.toDateString() === y.toDateString(); }
      if (filter === "weekly") { const w = new Date(n); w.setDate(w.getDate() - 7); return d >= w; }
      if (filter === "monthly") return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      if (filter === "yearly") return d.getFullYear() === n.getFullYear();
      return true;
    });
    const totalFuel = source.reduce((s, e) => s + num(e.engines?.reduce((a, x) => a + num(x.fuel), 0)), 0);
    const consumption = source.reduce((s, e) => s + num(e.totalConsumption), 0);
    const incoming = source.reduce((s, e) => s + num(e.incoming), 0);
    const engineHours = { "1400kva": 0, "1020kva": 0, "650kva": 0 };
    source.forEach((e) => (e.engines || []).forEach((x) => { engineHours[x.name] = (engineHours[x.name] || 0) + num(x.duration); }));
    return { totalFuel, consumption, incoming, avgFuel: source.length ? totalFuel / source.length : 0, engineHours };
  }, [entries, filter]);

  const chart = useMemo(() => entries.slice(-range).map((e, i) => ({ index: i, date: e.date || "", fuel: num(e.engines?.reduce((a, x) => a + num(x.fuel), 0)), consumption: num(e.totalConsumption) })), [entries, range]);
  const engineFuelValue = engineFuel(form.engine, form.runHours, form.kwh);
  const otherTotal = form.other.reduce((s, x) => s + num(x.amount), 0);
  const totalConsumption = totalOf(engineFuelValue, form.other);
  const calculatedStock = num(form.previousStock) + num(form.incoming) - totalConsumption;
  const stopTime = useMemo(() => {
    if (!form.startTime || !form.runHours) return "";
    const [h, m] = form.startTime.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); d.setMinutes(d.getMinutes() + hours(form.runHours) * 60);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, [form.startTime, form.runHours]);

  useEffect(() => {
    const saved = localStorage.getItem("powerhouse_fuel_draft");
    if (saved) try { setForm({ ...emptyForm(), ...JSON.parse(saved) }); } catch { /* ignore invalid draft */ }
  }, []);
  useEffect(() => { localStorage.setItem("powerhouse_fuel_draft", JSON.stringify(form)); }, [form]);

  const saveEntry = async () => {
    if (saving) return;
    if (!form.userName.trim() || !form.date) return setMessage("User name and date are required.");
    if (new Date(form.date) > new Date(today())) return setMessage("Future date is not allowed.");
    setSaving(true); setMessage("");
    try {
      await addDoc(collection(db, "entries"), {
        ...form,
        previousStock: num(form.previousStock), incoming: num(form.incoming), kwh: num(form.kwh),
        engineFuel: engineFuelValue, otherTotal, totalConsumption,
        engines: [{ name: form.engine, fuel: engineFuelValue, duration: hours(form.runHours) }],
        stock: Number(calculatedStock.toFixed(2)), stopTime, createdAt: serverTimestamp()
      });
      localStorage.removeItem("powerhouse_fuel_draft");
      setForm({ ...emptyForm(), previousStock: String(calculatedStock.toFixed(2)), userName: form.userName });
      setMessage("Fuel entry saved successfully."); setView("dashboard");
    } catch (e) { setMessage(`Save failed: ${e.message}`); }
    finally { setSaving(false); }
  };

  const addOther = () => setForm((f) => ({ ...f, other: [...f.other, { name: "", amount: "" }] }));
  const removeOther = (i) => setForm((f) => ({ ...f, other: f.other.filter((_, n) => n !== i) }));
  const updateOther = (i, key, value) => setForm((f) => ({ ...f, other: f.other.map((x, n) => n === i ? { ...x, [key]: value } : x) }));
  const exportCsv = () => {
    const header = ["Date","User","Engine","Running Hours","kWh","Engine Fuel","Other Usage","Consumption","Incoming","Stock"];
    const lines = entries.map((e) => [e.date,e.userName,e.engine,e.runHours,e.kwh,e.engineFuel,e.otherTotal,e.totalConsumption,e.incoming,e.stock].map((x) => `"${String(x ?? "").replaceAll('"','""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "powerhouse-fuel-report.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="min-h-full rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 md:p-8 text-white">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
      <div><h1 className="text-2xl md:text-3xl font-black flex items-center gap-2"><Fuel className="text-yellow-400"/> Fuel Management</h1><p className="text-slate-400 text-sm mt-1">Generator fuel, stock and reporting — powered by Firebase.</p></div>
      <div className="flex flex-wrap gap-2">
        {[['dashboard','Dashboard'],['entry','New Entry'],['report','Reports']].map(([key,label]) => <button key={key} onClick={() => setView(key)} className={`px-4 py-2 rounded-xl font-bold text-sm ${view === key ? 'bg-yellow-500 text-black' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{label}</button>)}
        <button onClick={() => window.location.reload()} className="p-2 rounded-xl bg-white/5" title="Refresh"><RefreshCw size={18}/></button>
      </div>
    </div>
    {message && <div className="mb-5 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">{message}</div>}

    {view === 'dashboard' && <>
      <div className="flex flex-wrap gap-2 mb-5">{['all','today','yesterday','weekly','monthly','yearly'].map((x) => <button key={x} onClick={() => setFilter(x)} className={`px-3 py-2 rounded-lg text-xs capitalize ${filter === x ? 'bg-blue-600' : 'bg-white/5 text-slate-300'}`}>{x}</button>)}</div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card title="Total Fuel" value={stats.totalFuel}/><Card title="Consumption" value={stats.consumption}/><Card title="Incoming" value={stats.incoming}/><Card title="Avg Fuel" value={stats.avgFuel}/><Card title="Stock" value={currentStock} danger={currentStock < 3000}/>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5"><Card title="1400 KVA Hours" value={stats.engineHours['1400kva']}/><Card title="1020 KVA Hours" value={stats.engineHours['1020kva']}/><Card title="650 KVA Hours" value={stats.engineHours['650kva']}/></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <ChartBox title="Fuel Trend"><ResponsiveContainer width="100%" height={260}><LineChart data={chart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line type="monotone" dataKey="fuel" stroke="#2563eb" strokeWidth={3}/><Line type="monotone" dataKey="consumption" stroke="#f59e0b" strokeWidth={2}/></LineChart></ResponsiveContainer></ChartBox>
        <ChartBox title="Consumption"><ResponsiveContainer width="100%" height={260}><BarChart data={chart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Bar dataKey="consumption" fill="#10b981" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer><input type="range" min="1" max={Math.max(1, entries.length)} value={range} onChange={(e) => setRange(num(e.target.value))} className="w-full mt-3"/></ChartBox>
      </div>
    </>}

    {view === 'entry' && <div className="max-w-5xl mx-auto rounded-3xl bg-white text-slate-900 p-5 md:p-8 shadow-2xl">
      <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-black">Daily Fuel Entry</h2><button onClick={() => setForm(emptyForm())} className="px-3 py-2 rounded-lg bg-slate-100">Reset</button></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="User Name *"><input value={form.userName} onChange={(e)=>setForm({...form,userName:e.target.value})}/></Field>
        <Field label="Date *"><input type="date" value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/></Field>
        <Field label="Engine"><select value={form.engine} onChange={(e)=>setForm({...form,engine:e.target.value})}><option>1400kva</option><option>1020kva</option><option>650kva</option></select></Field>
        <Field label="Previous Stock"><input type="number" value={form.previousStock} onChange={(e)=>setForm({...form,previousStock:e.target.value})}/></Field>
        <Field label="Start Time"><input type="time" value={form.startTime} onChange={(e)=>setForm({...form,startTime:e.target.value})}/></Field>
        <Field label="Running Hours"><input placeholder="1:30 or 1.30" value={form.runHours} onChange={(e)=>setForm({...form,runHours:e.target.value})}/></Field>
        <Field label="Stop Time"><div className="p-3 rounded-lg bg-slate-100 font-bold">{stopTime || '-'}</div></Field>
        <Field label="kWh"><input type="number" value={form.kwh} onChange={(e)=>setForm({...form,kwh:e.target.value})}/></Field>
        <Field label="Engine Fuel"><div className="p-3 rounded-lg bg-green-50 font-bold text-green-700">{engineFuelValue.toFixed(2)} L</div></Field>
        <Field label="Incoming Fuel"><input type="number" value={form.incoming} onChange={(e)=>setForm({...form,incoming:e.target.value})}/></Field>
        <Field label="Total Consumption"><div className="p-3 rounded-lg bg-blue-50 font-bold text-blue-700">{totalConsumption.toFixed(2)} L</div></Field>
        <Field label="Current Stock"><div className="p-3 rounded-lg bg-amber-50 font-bold text-amber-700">{calculatedStock.toFixed(2)} L</div></Field>
      </div>
      <h3 className="font-black text-lg mt-7 mb-3">Other Usage</h3>
      <div className="space-y-2">{form.other.map((o,i)=><div key={i} className="flex gap-2"><input className="flex-1 border rounded-lg p-3" placeholder="Boiler / CEO Home / Lifter / Machine / Custom" value={o.name} onChange={(e)=>updateOther(i,'name',e.target.value)}/><input className="w-32 border rounded-lg p-3" type="number" placeholder="Liters" value={o.amount} onChange={(e)=>updateOther(i,'amount',e.target.value)}/><button onClick={()=>removeOther(i)} className="p-3 rounded-lg bg-red-50 text-red-600"><Trash2 size={18}/></button></div>)}</div>
      <button onClick={addOther} className="mt-3 px-4 py-2 rounded-lg bg-slate-100 font-bold flex items-center gap-2"><Plus size={17}/> Add Usage</button>
      <button disabled={saving} onClick={saveEntry} className="mt-7 w-full py-4 rounded-xl bg-yellow-500 text-black font-black flex items-center justify-center gap-2 disabled:opacity-50"><Save size={18}/>{saving ? 'Saving...' : 'SAVE FUEL ENTRY'}</button>
    </div>}

    {view === 'report' && <div className="rounded-3xl bg-white text-slate-900 p-5 md:p-8"><div className="flex flex-wrap gap-2 justify-between items-center mb-5"><h2 className="text-2xl font-black">Fuel Reports</h2><div className="flex gap-2"><button onClick={exportCsv} className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold flex items-center gap-2"><Download size={17}/> CSV</button><button onClick={()=>window.print()} className="px-4 py-2 rounded-lg bg-slate-900 text-white font-bold flex items-center gap-2"><Printer size={17}/> Print</button></div></div><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Date</th><th className="p-3">User</th><th className="p-3">Engine</th><th className="p-3">Hours</th><th className="p-3">Fuel</th><th className="p-3">Other</th><th className="p-3">Consumption</th><th className="p-3">Incoming</th><th className="p-3">Stock</th></tr></thead><tbody>{entries.map(e=><tr key={e.id} className="border-b"><td className="p-3">{e.date}</td><td className="p-3">{e.userName}</td><td className="p-3">{e.engine}</td><td className="p-3">{e.runHours}</td><td className="p-3">{num(e.engineFuel).toFixed(2)}</td><td className="p-3">{num(e.otherTotal).toFixed(2)}</td><td className="p-3">{num(e.totalConsumption).toFixed(2)}</td><td className="p-3">{num(e.incoming).toFixed(2)}</td><td className="p-3">{num(e.stock).toFixed(2)}</td></tr>)}</tbody></table>{!entries.length && <div className="py-12 text-center text-slate-400">No fuel entries yet.</div>}</div></div>}
  </div>;
}

const Card = ({ title, value, danger }) => <div className={`rounded-2xl p-4 ${danger ? 'bg-red-600 text-white animate-pulse' : 'bg-gradient-to-br from-blue-700 to-slate-800 text-white'}`}><p className="text-xs opacity-70">{title}</p><p className="text-2xl font-black mt-1">{num(value).toFixed(2)}</p>{danger && <p className="text-xs font-bold mt-1">LOW FUEL STOCK</p>}</div>;
const ChartBox = ({ title, children }) => <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><h3 className="font-black mb-3">{title}</h3>{children}</div>;
const Field = ({ label, children }) => <label className="block text-sm font-bold"><span className="block mb-1">{label}</span>{React.cloneElement(children, { className: `w-full border border-slate-300 rounded-lg p-3 bg-white text-slate-900 outline-none focus:ring-2 focus:ring-yellow-400 ${children.props.className || ''}` })}</label>;
