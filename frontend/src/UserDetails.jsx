import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock3, Loader2, Mail, MapPin, Phone, RefreshCw, Search, ShieldAlert, Wrench } from "lucide-react";
import API from "./api";

const statusStyle = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "bg-emerald-500/15 text-emerald-300";
  if (s === "in progress") return "bg-blue-500/15 text-blue-300";
  if (s === "rejected") return "bg-red-500/15 text-red-300";
  return "bg-yellow-500/15 text-yellow-300";
};

export default function UserDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await API.get(`/user/full/${id}`, { timeout: 20000 });
      setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "User could not be loaded.");
    } finally { setLoading(false); }
  };
  useEffect(() => { if (id) load(); }, [id]);

  const user = data?.user || {};
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const tools = Array.isArray(data?.tools) ? data.tools : [];
  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tasks.filter((task) => !q || [task.id, task.title, task.description, task.category, task.priority, task.status].map((v) => String(v ?? "")).join(" ").toLowerCase().includes(q));
  }, [tasks, search]);

  if (loading) return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="animate-spin text-yellow-500" size={34}/></div>;
  if (error) return <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-7 text-center text-red-300"><ShieldAlert className="mx-auto mb-3" size={32}/><h2 className="text-xl font-black">Unable to load user</h2><p className="mt-2 text-sm">{error}</p><button onClick={load} className="mt-5 rounded-xl bg-yellow-500 px-5 py-2.5 font-black text-black">Retry</button></div>;

  const profile = normalizeImage(user.profile_pic);
  return <div className="min-h-screen bg-[#080d1d] px-4 py-7 text-white md:px-8"><div className="mx-auto max-w-[1500px]">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black"><ArrowLeft size={16}/>Back</button><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black"><RefreshCw size={16}/>Refresh</button></div>
    <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0f172a] to-[#121d35] p-6 shadow-2xl md:p-8"><div className="flex flex-col gap-5 md:flex-row md:items-center"><Avatar user={user} src={profile}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black break-words">{user.name || "Unknown User"}</h1><span className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-black text-yellow-300">{user.role || "staff"}</span><span className={`rounded-full px-3 py-1 text-xs font-black ${String(user.status).toLowerCase()==="active"?"bg-emerald-500/15 text-emerald-300":String(user.status).toLowerCase()==="blocked"?"bg-red-500/15 text-red-300":"bg-orange-500/15 text-orange-300"}`}>{user.status || "active"}</span></div><p className="mt-2 text-slate-400">#{user.id} • {user.employeeID || "No employee ID"}</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300"><span className="inline-flex items-center gap-2"><Mail size={15}/>{user.email || "—"}</span><span className="inline-flex items-center gap-2"><Phone size={15}/>{user.phone || "—"}</span><span className="inline-flex items-center gap-2"><MapPin size={15}/>{user.address || "No address"}</span></div></div></div></section>
    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5"><Metric label="Total Tasks" value={data?.summary?.totalTasks ?? tasks.length}/><Metric label="Pending" value={data?.summary?.pendingTasks ?? 0}/><Metric label="Running" value={data?.summary?.inProgressTasks ?? 0}/><Metric label="Completed" value={data?.summary?.completedTasks ?? 0}/><Metric label="Tools" value={data?.summary?.totalTools ?? tools.length}/></div>
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#0e1528] p-5 md:p-7"><div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-2xl font-black">Assigned Tasks</h2><p className="text-sm text-slate-500">Real tasks assigned to this staff account.</p></div><label className="flex items-center gap-2 rounded-xl bg-[#18233a] px-3"><Search size={16} className="text-slate-500"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search tasks..." className="bg-transparent px-2 py-2.5 text-sm outline-none"/></label></div>{filteredTasks.length===0?<div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500">No assigned tasks found.</div>:<div className="space-y-3">{filteredTasks.map((task)=><div key={task.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-yellow-500/10 px-2.5 py-1 text-xs font-black text-yellow-300">#{task.id}</span><h3 className="text-base font-black">{task.title || "Untitled task"}</h3></div><p className="mt-2 text-sm text-slate-400">{task.description || "No description"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle(task.status)}`}>{task.status || "Pending"}</span></div><div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Wrench size={13}/>{task.category || "General"}</span><span className="inline-flex items-center gap-1.5"><Clock3 size={13}/>{task.priority || "Medium"}</span>{task.created_at && <span>{new Date(task.created_at).toLocaleString()}</span>}</div></div>)}</div>}</section>
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#0e1528] p-5 md:p-7"><h2 className="mb-5 text-2xl font-black">Assigned Tools</h2>{tools.length===0?<p className="text-sm text-slate-500">No tools assigned.</p>:<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{tools.map((tool,index)=><div key={tool.id||index} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="font-black">{tool.toolName||tool.tool_name||"Tool"}</p><p className="mt-1 text-xs text-slate-500">{tool.category||"General"} • Qty {tool.quantity||0}</p></div>)}</div>}</section>
  </div></div>;
}
function Metric({ label, value }) { return <div className="rounded-2xl border border-white/10 bg-[#11182c] p-4 text-center"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div></div>; }
function normalizeImage(value) { const v=String(value||"").trim(); if(!v)return ""; if(/^https?:\/\//i.test(v)||v.startsWith("data:"))return v; const base=String(import.meta.env.VITE_API_URL||"").replace(/\/api\/?$/i,"").replace(/\/+$/i,""); return `${base}${v.startsWith("/")?v:`/${v}`}`; }
function Avatar({ user, src }) { const initials=String(user?.name||"U").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase(); return src?<img src={src} alt="" className="h-24 w-24 shrink-0 rounded-3xl object-cover ring-2 ring-yellow-500/60" onError={(e)=>{e.currentTarget.style.display="none"}}/>:<div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-yellow-500 text-2xl font-black text-black">{initials||"U"}</div>; }
