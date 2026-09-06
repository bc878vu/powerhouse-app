import React, { useEffect, useMemo, useState } from "react";
import API from "../api";
import { getUser } from "../utils/auth";
import { useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, ArrowUpDown, RotateCcw, ExternalLink, Calendar, Tag, Flag, CheckCircle2, Clock3, XCircle, Layers, ChevronDown } from "lucide-react";

const text = (v) => String(v ?? "").trim();
const statusIcon = (status) => status === "Completed" ? <CheckCircle2 size={14}/> : status === "Rejected" ? <XCircle size={14}/> : status === "In Progress" ? <Layers size={14}/> : <Clock3 size={14}/>;
const statusClass = (status) => status === "Completed" ? "bg-emerald-500/10 text-emerald-300" : status === "Rejected" ? "bg-red-500/10 text-red-300" : status === "In Progress" ? "bg-blue-500/10 text-blue-300" : "bg-yellow-500/10 text-yellow-300";
const priorityClass = (priority) => priority === "High" ? "bg-red-500/10 text-red-300" : priority === "Medium" ? "bg-yellow-500/10 text-yellow-300" : "bg-slate-500/10 text-slate-300";
const dateValue = (v) => { if (!v) return 0; const d = new Date(v); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); };
const dateLabel = (v) => { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); };

export default function DashboardTaskResearch() {
  const user = getUser();
  const navigate = useNavigate();
  const userId = user?.id ?? user?.numericId ?? user?.uid ?? user?.firebaseUid;
  const [tasks, setTasks] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
  const [priority, setPriority] = useState("All");
  const [sort, setSort] = useState("newest");
  const [dateFilter, setDateFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const res = await API.get(`/task/my-tasks/${userId}`, { timeout: 12000 });
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.tasks) ? res.data.tasks : [];
        if (alive) { setTasks(list); setError(""); }
      } catch (e) { if (alive) setError(e?.response?.data?.message || "Task research data could not be loaded."); }
      finally { if (alive) setLoading(false); }
    };
    void load();
    const interval = window.setInterval(load, 15000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [userId]);

  const categories = useMemo(() => [...new Set(tasks.map((t) => text(t.category)).filter(Boolean))].sort((a,b) => a.localeCompare(b)), [tasks]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const day = 86400000;
    return [...tasks].filter((task) => {
      const haystack = [task.title, task.description, task.category, task.priority, task.panel_code, task.panel_area, task.panel_location, task.location, task.staff_name].map(text).join(" ").toLowerCase();
      const matchesQuery = !q || haystack.includes(q) || String(task.id).includes(q);
      const matchesStatus = status === "All" || text(task.status || task.assignment_status) === status;
      const matchesCategory = category === "All" || text(task.category) === category;
      const matchesPriority = priority === "All" || text(task.priority) === priority;
      const created = dateValue(task.assigned_at || task.created_at || task.createdAt);
      const due = dateValue(task.due_date || task.deadline || task.dueDate);
      const reference = due || created;
      const matchesDate = dateFilter === "all" || (dateFilter === "today" && reference >= new Date(new Date().setHours(0,0,0,0)).getTime()) || (dateFilter === "7d" && reference >= now - 7 * day) || (dateFilter === "30d" && reference >= now - 30 * day) || (dateFilter === "overdue" && due > 0 && due < now && text(task.status) !== "Completed");
      return matchesQuery && matchesStatus && matchesCategory && matchesPriority && matchesDate;
    }).sort((a,b) => {
      if (sort === "oldest") return dateValue(a.assigned_at || a.created_at || a.createdAt) - dateValue(b.assigned_at || b.created_at || b.createdAt);
      if (sort === "priority") { const rank = { High: 3, Medium: 2, Low: 1 }; return (rank[text(b.priority)] || 0) - (rank[text(a.priority)] || 0); }
      if (sort === "due") return (dateValue(a.due_date || a.deadline || a.dueDate) || Infinity) - (dateValue(b.due_date || b.deadline || b.dueDate) || Infinity);
      if (sort === "title") return text(a.title).localeCompare(text(b.title));
      return dateValue(b.assigned_at || b.created_at || b.createdAt) - dateValue(a.assigned_at || a.created_at || a.createdAt);
    });
  }, [tasks, query, status, category, priority, sort, dateFilter]);

  const reset = () => { setQuery(""); setStatus("All"); setCategory("All"); setPriority("All"); setSort("newest"); setDateFilter("all"); };
  const activeFilters = [status !== "All", category !== "All", priority !== "All", dateFilter !== "all", Boolean(query)].filter(Boolean).length;

  return <section className="mt-6 rounded-[2.5rem] border border-white/5 bg-slate-900/45 p-5 shadow-2xl md:mt-8 md:rounded-[3rem] md:p-8">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-400">Task Research</p><h2 className="mt-1 text-xl font-black uppercase italic text-white md:text-2xl">Find, Filter & Analyze Tasks</h2><p className="mt-1 text-xs text-slate-500">Search every assigned task by title, ID, description, category, priority, panel or location.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setShowFilters((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[9px] font-black uppercase text-slate-300"><SlidersHorizontal size={14}/> Filters {activeFilters > 0 && <span className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-black">{activeFilters}</span>}<ChevronDown size={13} className={showFilters ? "rotate-180" : ""}/></button><button onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[9px] font-black uppercase text-slate-300"><RotateCcw size={13}/> Reset</button></div>
    </div>

    <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1.8fr)_repeat(2,minmax(150px,1fr))]">
      <label className="relative block"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Research tasks… title, ID, panel, location" className="h-12 w-full rounded-xl border border-white/10 bg-[#0b1326] pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-yellow-500/40"/></label>
      <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-12 rounded-xl border border-white/10 bg-[#0b1326] px-4 text-xs font-bold text-slate-300 outline-none"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority</option><option value="due">Due date</option><option value="title">Title A–Z</option></select>
      <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-12 rounded-xl border border-white/10 bg-[#0b1326] px-4 text-xs font-bold text-slate-300 outline-none"><option value="all">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="overdue">Overdue</option></select>
    </div>

    {showFilters && <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/5 pt-3 sm:grid-cols-3"><select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-xl border border-white/10 bg-[#0b1326] px-3 text-xs font-bold text-slate-300 outline-none"><option>All</option><option>Pending</option><option>In Progress</option><option>Completed</option><option>Rejected</option></select><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 rounded-xl border border-white/10 bg-[#0b1326] px-3 text-xs font-bold text-slate-300 outline-none"><option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-11 rounded-xl border border-white/10 bg-[#0b1326] px-3 text-xs font-bold text-slate-300 outline-none"><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></div>}

    <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-lg bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Showing {filtered.length} / {tasks.length}</span>{status !== "All" && <span className="rounded-lg bg-blue-500/10 px-3 py-2 text-[9px] font-black uppercase text-blue-300">Status: {status}</span>}{category !== "All" && <span className="rounded-lg bg-yellow-500/10 px-3 py-2 text-[9px] font-black uppercase text-yellow-300">Category: {category}</span>}{priority !== "All" && <span className="rounded-lg bg-red-500/10 px-3 py-2 text-[9px] font-black uppercase text-red-300">Priority: {priority}</span>}</div>

    <div className="mt-4 overflow-x-auto rounded-2xl border border-white/5"><table className="w-full min-w-[1120px] text-left"><thead className="bg-white/[0.025] text-[9px] font-black uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-4">Task</th><th className="px-4 py-4"><span className="inline-flex items-center gap-1"><Tag size={11}/> Category</span></th><th className="px-4 py-4"><span className="inline-flex items-center gap-1"><Flag size={11}/> Priority</span></th><th className="px-4 py-4">Due</th><th className="px-4 py-4">Status</th><th className="px-4 py-4 text-right">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="px-5 py-14 text-center text-xs text-slate-600">Loading task research…</td></tr> : error ? <tr><td colSpan="6" className="px-5 py-14 text-center text-xs text-red-300">{error}</td></tr> : filtered.length ? filtered.map((task) => { const st = text(task.status || task.assignment_status) || "Pending"; const due = task.due_date || task.deadline || task.dueDate; const overdue = dateValue(due) > 0 && dateValue(due) < Date.now() && st !== "Completed"; return <tr key={task.id} className="border-t border-white/5 transition hover:bg-white/[0.025]"><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[9px] font-black text-yellow-400">#{task.id}</span><div className="min-w-0"><p className="max-w-[360px] truncate text-sm font-bold text-white">{task.title || "Untitled Task"}</p><p className="mt-1 text-[9px] text-slate-600">{text(task.panel_code || task.panel_location || task.location) || "No panel/location"}</p></div></div></td><td className="px-4 py-4"><span className="text-xs font-semibold text-slate-400">{text(task.category) || "Uncategorized"}</span></td><td className="px-4 py-4"><span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${priorityClass(text(task.priority))}`}>{text(task.priority) || "—"}</span></td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${overdue ? "text-red-300" : "text-slate-400"}`}><Calendar size={12}/>{dateLabel(due)}{overdue && <b className="text-[8px] uppercase">Overdue</b>}</span></td><td className="px-4 py-4"><span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${statusClass(st)}`}>{statusIcon(st)}{st}</span></td><td className="px-4 py-4 text-right"><button onClick={() => navigate(`/task-view/${task.id}`)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase text-slate-300 hover:bg-white/[0.08]"><ExternalLink size={13}/> View</button></td></tr>; }) : <tr><td colSpan="6" className="px-5 py-14 text-center"><p className="text-sm font-bold text-slate-500">No matching tasks.</p><p className="mt-1 text-xs text-slate-700">Try another search or clear the filters.</p></td></tr>}</tbody></table></div>
    <div className="mt-4 flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-widest text-slate-600"><span className="inline-flex items-center gap-2"><ArrowUpDown size={12}/> Dynamic results</span><span>{categories.length} categor{categories.length === 1 ? "y" : "ies"} detected</span></div>
  </section>;
}
