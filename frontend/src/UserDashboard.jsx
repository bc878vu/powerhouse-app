import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "./api";
import { getUser } from "./utils/auth";
import { useNavigate } from "react-router-dom";
import { socket } from "./utils/socket";
import { onMessageListener } from "./firebaseConfig";
import { ArrowRight, Bell, Calendar, CheckCircle, Clock, ExternalLink, Layers, LayoutGrid, ListTodo, MapPin, RefreshCw, XCircle, Zap, AlertCircle } from "lucide-react";

const CACHE_PREFIX = "powerhouse_tasks_cache_v4_";
const statusRank = { "pending": 0, "new": 0, "in progress": 1, "running": 1, "rejected": 2, "completed": 3 };
const priorityRank = { "critical": 0, "urgent": 0, "high": 1, "medium": 2, "low": 3 };
const normalizeStatus = (value) => String(value || "Pending").trim().toLowerCase().replace(/_/g, " ");
const normalizePriority = (value) => String(value || "Medium").trim().toLowerCase();
const taskTime = (task) => new Date(task?.assigned_at || task?.created_at || task?.updated_at || 0).getTime() || 0;
const sortTasks = (list) => [...(Array.isArray(list) ? list : [])].sort((a, b) => {
  const statusDiff = (statusRank[normalizeStatus(a?.status)] ?? 1) - (statusRank[normalizeStatus(b?.status)] ?? 1);
  if (statusDiff) return statusDiff;
  if ((statusRank[normalizeStatus(a?.status)] ?? 1) === 0) {
    const priorityDiff = (priorityRank[normalizePriority(a?.priority)] ?? 2) - (priorityRank[normalizePriority(b?.priority)] ?? 2);
    if (priorityDiff) return priorityDiff;
  }
  return taskTime(b) - taskTime(a) || Number(b?.id || 0) - Number(a?.id || 0);
});

const readTaskCache = (userId) => {
  try { const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`); const parsed = raw ? JSON.parse(raw) : null; return sortTasks(Array.isArray(parsed?.tasks) ? parsed.tasks : []); } catch { return []; }
};
const writeTaskCache = (userId, tasks) => { try { localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify({ at: Date.now(), tasks: sortTasks(tasks) })); } catch {} };

export default function UserDashboard() {
  const user = getUser();
  const navigate = useNavigate();
  const userId = user?.id;
  const cachedTasks = useMemo(() => userId ? readTaskCache(userId) : [], [userId]);
  const [tasks, setTasks] = useState(cachedTasks);
  const [refreshing, setRefreshing] = useState(false);
  const [popup, setPopup] = useState(null);
  const [acceptingTaskId, setAcceptingTaskId] = useState(null);

  const setSortedTasks = useCallback((updater) => setTasks((prev) => {
    const next = typeof updater === "function" ? updater(prev) : updater;
    const sorted = sortTasks(next);
    if (userId) writeTaskCache(userId, sorted);
    return sorted;
  }), [userId]);

  const showPopup = useCallback((title, msg, type = "info") => {
    setPopup({ title, msg, type });
    window.clearTimeout(showPopup.timer);
    showPopup.timer = window.setTimeout(() => setPopup(null), 3000);
  }, []);
  const playNotificationSound = useCallback(() => { try { const audio = new Audio("/notification.mp3"); audio.volume = 1; audio.play().catch(() => {}); } catch {} }, []);

  const fetchTasks = useCallback(async (manual = false) => {
    if (!userId) return;
    if (manual) setRefreshing(true);
    try {
      const res = await API.get(`/task/my-tasks/${userId}`, { timeout: 12000 });
      const fresh = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.tasks) ? res.data.tasks : [];
      setSortedTasks(fresh);
    } catch (error) { console.warn("Dashboard background task refresh skipped:", error?.message || error); }
    finally { if (manual) setRefreshing(false); }
  }, [userId, setSortedTasks]);

  useEffect(() => {
    if (!userId) return;
    void fetchTasks(false);
    const interval = window.setInterval(() => void fetchTasks(false), 10000);
    return () => window.clearInterval(interval);
  }, [userId, fetchTasks]);

  useEffect(() => {
    if (!userId) return;
    const joinedIds = [user?.id, user?.numericId, user?.uid, user?.firebaseUid].filter((value) => value !== undefined && value !== null && String(value).trim()).map(String).filter((value, index, list) => list.indexOf(value) === index);
    const joinRooms = () => joinedIds.forEach((id) => socket.emit("joinUser", id));
    const refreshFromSocket = (data = {}) => {
      const incoming = data?.task || (data?.title && (data?.id || data?.taskId) ? data : null);
      if (incoming?.id || incoming?.taskId) {
        const incomingId = String(incoming.id ?? incoming.taskId);
        setSortedTasks((prev) => {
          const exists = prev.some((item) => String(item.id) === incomingId);
          return exists ? prev.map((item) => String(item.id) === incomingId ? { ...item, ...incoming } : item) : [{ ...incoming, id: incoming.id ?? incoming.taskId }, ...prev];
        });
      }
      void fetchTasks(false);
    };
    const handleAssigned = (data = {}) => { refreshFromSocket(data); showPopup("New Task Assigned", data?.title || "You received a new task", "new"); playNotificationSound(); };
    const handleTaskEvent = (data = {}) => { refreshFromSocket(data); const status = String(data?.status || "").trim(); if (status || data?.taskId || data?.id) showPopup(data?.title || "Task Update", status ? `Task ${data?.taskId || data?.id ? `#${data.taskId || data.id}` : ""} → ${status}` : "Your task list was updated.", status === "Completed" ? "success" : status === "Rejected" ? "error" : "info"); };
    if (socket.connected) joinRooms();
    socket.on("connect", joinRooms);
    const events = ["taskAssigned", "taskReassigned", "taskUpdate", "taskUpdated", "taskEdited", "taskDeleted", "taskDelete", "taskAccepted", "taskRejected", "taskCompleted", "taskStatusChanged", "updateData"];
    events.forEach((event) => socket.on(event, event === "taskAssigned" ? handleAssigned : handleTaskEvent));
    return () => { socket.off("connect", joinRooms); events.forEach((event) => socket.off(event, event === "taskAssigned" ? handleAssigned : handleTaskEvent)); };
  }, [userId, user?.id, user?.numericId, user?.uid, user?.firebaseUid, fetchTasks, setSortedTasks, showPopup, playNotificationSound]);

  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(() => {
      onMessageListener().then((payload) => {
        if (!mounted || !payload) return;
        const title = payload?.notification?.title || payload?.data?.title || "Task Notification";
        const message = payload?.notification?.body || payload?.data?.body || payload?.data?.message || "You have a task update";
        showPopup(title, message, "new"); playNotificationSound(); void fetchTasks(false);
      }).catch(() => {});
    }, 300);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [fetchTasks, playNotificationSound, showPopup]);

  const handleAccept = async (task) => {
    if (!task?.id || acceptingTaskId) return;
    setAcceptingTaskId(task.id);
    const now = new Date().toISOString();
    setSortedTasks((prev) => prev.map((item) => Number(item.id) === Number(task.id) ? { ...item, status: "In Progress", accepted_at: item.accepted_at || now, updated_at: now } : item));
    try { await API.put(`/task/update-status/${task.id}`, { status: "In Progress", user_id: userId }); showPopup("Task Accepted", `Task #${task.id} is now In Progress`, "success"); void fetchTasks(false); }
    catch (error) { showPopup("Accept Failed", error?.response?.data?.message || "Could not accept this task", "error"); void fetchTasks(false); }
    finally { setAcceptingTaskId(null); }
  };

  const counts = useMemo(() => ({ pending: tasks.filter((t) => normalizeStatus(t.status) === "pending").length, running: tasks.filter((t) => ["in progress", "running"].includes(normalizeStatus(t.status))).length, completed: tasks.filter((t) => normalizeStatus(t.status) === "completed").length, rejected: tasks.filter((t) => normalizeStatus(t.status) === "rejected").length }), [tasks]);
  const recentTasks = useMemo(() => sortTasks(tasks).slice(0, 5), [tasks]);
  const statusStyle = (status) => { const s = normalizeStatus(status); if (s === "completed") return { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/20", icon: <CheckCircle size={13} /> }; if (["in progress", "running"].includes(s)) return { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", icon: <Layers size={13} /> }; if (s === "rejected") return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", icon: <XCircle size={13} /> }; return { bg: "bg-yellow-500/10", text: "text-yellow-500", border: "border-yellow-500/20", icon: <Clock size={13} /> }; };
  const statCards = [["To Do", counts.pending, "text-yellow-500", "bg-yellow-500/10", <Clock />], ["Running", counts.running, "text-blue-400", "bg-blue-500/10", <Layers />], ["Completed", counts.completed, "text-green-400", "bg-green-500/10", <ListTodo />], ["Rejected", counts.rejected, "text-red-400", "bg-red-500/10", <XCircle />], ["Total", tasks.length, "text-yellow-400", "bg-yellow-500/10", <LayoutGrid />]];

  return <div className="animate-in fade-in duration-300">
    <div className="bg-yellow-500 p-6 md:p-12 rounded-[2.5rem] md:rounded-[3.5rem] mb-8 md:mb-12 flex flex-col md:flex-row justify-between items-center shadow-2xl relative overflow-hidden"><div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full" /><div className="absolute -left-20 -bottom-24 w-64 h-64 bg-slate-900/5 rounded-full" /><div className="relative z-10 w-full md:w-auto"><p className="text-slate-900 font-black text-[10px] uppercase tracking-[0.4em] mb-3">User Terminal</p><h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 italic uppercase leading-none">Hello, {user?.name || "User"}</h1><div className="flex flex-wrap gap-3 md:gap-4 mt-4"><span className="bg-slate-900 text-white px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg italic">ID: #{user?.id || "N/A"}</span><span className="bg-white/20 px-4 py-1.5 rounded-xl text-[9px] font-black text-slate-900 uppercase italic">Tasks Assigned: {tasks.length}</span>{counts.pending > 0 && <span className="bg-red-500 text-white px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg animate-pulse">{counts.pending} Pending</span>}</div></div><div className="relative z-10 flex flex-col sm:flex-row gap-3 mt-8 md:mt-0"><button onClick={() => fetchTasks(true)} disabled={refreshing} className="bg-white/20 text-slate-900 p-5 rounded-[2rem] font-black hover:bg-white/30 transition-all disabled:opacity-50" title="Refresh Tasks"><RefreshCw size={20} className={refreshing ? "animate-spin" : ""} /></button><button onClick={() => navigate("/my-tasks")} className="bg-slate-900 text-white px-8 md:px-10 py-5 rounded-[2rem] font-black text-[11px] uppercase flex items-center justify-center gap-4 hover:scale-105 transition-all shadow-2xl">Go To My Tasks <ArrowRight size={20} /></button></div></div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8 md:mb-12">{statCards.map(([label, count, color, bg, icon]) => <div key={label} className="bg-slate-900/60 border border-white/5 p-5 rounded-[2rem] flex items-center justify-between shadow-xl"><div><div className={`${bg} ${color} p-2 rounded-xl mb-3 inline-block`}>{icon}</div><h3 className="text-3xl md:text-4xl font-black text-white italic">{count}</h3><p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">{label}</p></div><LayoutGrid className="text-white/[0.03]" size={50} /></div>)}</div>
    <div className="bg-slate-900/40 border border-white/5 p-5 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"><div><h3 className="text-white font-black text-xl uppercase italic">Recent Task Timeline</h3><p className="text-slate-500 text-[9px] uppercase tracking-widest mt-2">New and highest-priority tasks first</p></div><button onClick={() => navigate("/my-tasks")} className="text-yellow-500 text-[10px] font-black uppercase flex items-center gap-2">View All Tasks <ArrowRight size={15} /></button></div><div className="grid gap-4">{recentTasks.length ? recentTasks.map((task) => { const style = statusStyle(task.status); return <div key={task.id} onClick={() => window.open(`/task-view/${task.id}`, "_blank")} className={`p-5 md:p-6 bg-white/[0.03] border ${style.border} rounded-[2rem] hover:bg-white/[0.08] transition-all cursor-pointer`}><div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5"><div className="flex items-start gap-4 min-w-0"><div className="w-12 h-12 shrink-0 bg-slate-800 rounded-2xl flex items-center justify-center text-yellow-500 font-black italic shadow-lg">#{task.id}</div><div className="min-w-0"><div className="flex flex-wrap gap-2 items-center"><h4 className="text-white font-bold text-base tracking-tight">{task.title || "No Title"}</h4>{task.priority && <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20">{task.priority}</span>}</div><p className="text-slate-500 text-[10px] font-black uppercase mt-2 flex items-center gap-2 italic"><Calendar size={12} />{task.created_at ? new Date(task.created_at).toLocaleString() : "N/A"}</p>{task.panel_id && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase"><Zap size={12} />{task.panel_code || `Panel #${task.panel_id}`}</span>{task.panel_name && <span className="text-slate-300 text-[10px] font-bold">{task.panel_name}</span>}</div>}{(task.panel_area || task.panel_location) && <p className="text-slate-500 text-[9px] mt-2 flex items-center gap-1"><MapPin size={11} />{[task.panel_area, task.panel_location].filter(Boolean).join(" • ")}</p>}</div></div><div className="flex flex-wrap items-center gap-3 lg:justify-end"><span className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-[9px] font-black uppercase ${style.bg} ${style.text}`}>{style.icon}{task.status || "Pending"}</span>{normalizeStatus(task.status) === "pending" && <button onClick={(e) => { e.stopPropagation(); void handleAccept(task); }} disabled={acceptingTaskId === task.id} className="bg-blue-500 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase disabled:opacity-50">{acceptingTaskId === task.id ? "Accepting..." : "Accept"}</button>}<button onClick={(e) => { e.stopPropagation(); window.open(`/task-view/${task.id}`, "_blank"); }} className="p-2.5 bg-white/5 text-slate-400 hover:text-yellow-500 rounded-xl" title="Open Task"><ExternalLink size={16} /></button></div></div>{normalizeStatus(task.status) === "rejected" && task.rejection_reason && <div className="mt-4 bg-red-500/5 border border-red-500/10 rounded-2xl p-4 flex gap-2"><AlertCircle size={15} className="text-red-400 shrink-0" /><div><p className="text-red-400 text-[9px] font-black uppercase tracking-widest mb-1">Rejection Reason</p><p className="text-slate-300 text-xs">{task.rejection_reason}</p></div></div>}</div>; }) : <div className="text-center py-16"><ListTodo size={40} className="mx-auto text-slate-700 mb-4" /><p className="text-slate-600 font-bold uppercase tracking-widest italic">No tasks assigned yet</p></div>}</div></div>
    {popup && <div className={`fixed top-5 right-5 left-5 sm:left-auto max-w-sm px-6 py-4 rounded-2xl shadow-2xl z-[99999] border ${popup.type === "success" ? "bg-green-500 text-white border-green-400" : popup.type === "error" ? "bg-red-500 text-white border-red-400" : popup.type === "new" ? "bg-yellow-500 text-black border-yellow-400" : "bg-blue-500 text-white border-blue-400"}`}><div className="flex items-start gap-3"><Bell size={19} /><div><h4 className="font-black text-sm">{popup.title}</h4><p className="text-sm mt-1 opacity-90">{popup.msg}</p></div></div></div>}
  </div>;
}
