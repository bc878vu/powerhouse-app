import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "./api";
import { getUser } from "./utils/auth";
import { useNavigate } from "react-router-dom";
import { socket } from "./utils/socket";
import { onMessageListener } from "./firebaseConfig";
import { createNotification, sendPushNotification } from "./services/notificationService";
import { getUserDuty } from "./services/dutyService";
import {
  ArrowRight, Bell, Calendar, CheckCircle, Clock, ExternalLink,
  Layers, LayoutGrid, ListTodo, MapPin, RefreshCw, XCircle, Zap,
  CalendarDays, Timer, Sunrise, UserCheck, X
} from "lucide-react";

const CACHE_PREFIX = "powerhouse_tasks_cache_v3_";
const DUTY_SHIFT_CACHE_PREFIX = "powerhouse_last_duty_shift_v1_";
const text = (v) => String(v ?? "").trim();

const readTaskCache = (userId) => {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  } catch { return []; }
};
const writeTaskCache = (userId, tasks) => { try { localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify({ at: Date.now(), tasks: Array.isArray(tasks) ? tasks : [] })); } catch {} };
const readLastDutyShift = (userId) => { try { return localStorage.getItem(`${DUTY_SHIFT_CACHE_PREFIX}${userId}`) || ""; } catch { return ""; } };
const writeLastDutyShift = (userId, id) => { try { localStorage.setItem(`${DUTY_SHIFT_CACHE_PREFIX}${userId}`, String(id || "")); } catch {} };
const formatDate = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); };
const formatDateTime = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const formatTime = (value) => text(value).slice(0, 5) || "—";

export default function UserDashboard() {
  const user = getUser();
  const navigate = useNavigate();
  const userId = user?.id ?? user?.numericId ?? user?.uid ?? user?.firebaseUid;
  const cachedTasks = useMemo(() => userId ? readTaskCache(userId) : [], [userId]);
  const [tasks, setTasks] = useState(cachedTasks);
  const [refreshing, setRefreshing] = useState(false);
  const [popup, setPopup] = useState(null);
  const [acceptingTaskId, setAcceptingTaskId] = useState(null);
  const [duty, setDuty] = useState(null);
  const [dutyLoading, setDutyLoading] = useState(true);
  const [dutyRefreshing, setDutyRefreshing] = useState(false);

  const showPopup = useCallback((title, msg, type = "info") => { setPopup({ title, msg, type }); window.clearTimeout(showPopup.timer); showPopup.timer = window.setTimeout(() => setPopup(null), 4500); }, []);
  const playNotificationSound = useCallback(() => { try { const audio = new Audio("/notification.mp3"); audio.volume = 1; audio.play().catch(() => {}); } catch {} }, []);

  const fetchTasks = useCallback(async (manual = false) => {
    if (!userId) return;
    if (manual) setRefreshing(true);
    try {
      const res = await API.get(`/task/my-tasks/${userId}`, { timeout: 12000 });
      const fresh = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.tasks) ? res.data.tasks : [];
      setTasks(fresh); writeTaskCache(userId, fresh);
    } catch (error) { console.warn("Dashboard task refresh skipped:", error?.message || error); }
    finally { if (manual) setRefreshing(false); }
  }, [userId]);

  const fetchDuty = useCallback(async (manual = false) => {
    if (!userId) return;
    if (manual) setDutyRefreshing(true);
    try {
      const result = await getUserDuty(userId);
      setDuty(result);
      const shift = result?.currentShift;
      if (shift?.id) {
        const key = `${shift.id}:${shift.effective_from || ""}:${shift.effective_to || ""}:${shift.start_time || ""}:${shift.end_time || ""}`;
        const previous = readLastDutyShift(userId);
        if (previous && previous !== key) {
          const body = `${shift.shift_name || "Assigned Shift"} assigned: ${formatTime(shift.start_time)}–${formatTime(shift.end_time)}, ${formatDate(shift.effective_from)} to ${shift.effective_to ? formatDate(shift.effective_to) : "ongoing"}.`;
          try {
            const notificationId = await createNotification(userId, { title: "Duty Assigned", body, type: "duty_assigned", route: "/profile", sourceId: String(shift.id) });
            await sendPushNotification({ title: "Duty Assigned", body, route: "/profile", userIds: [userId], notificationId });
          } catch (error) { console.warn("Duty notification persistence skipped:", error?.message || error); }
          showPopup("Duty Assigned", body, "new"); playNotificationSound();
        }
        writeLastDutyShift(userId, key);
      }
    } catch (error) { console.warn("Duty dashboard refresh skipped:", error?.message || error); }
    finally { setDutyLoading(false); if (manual) setDutyRefreshing(false); }
  }, [userId, playNotificationSound, showPopup]);

  useEffect(() => { if (!userId) return; void fetchTasks(false); const interval = window.setInterval(() => void fetchTasks(false), 10000); return () => window.clearInterval(interval); }, [userId, fetchTasks]);
  useEffect(() => { if (!userId) return; void fetchDuty(false); const interval = window.setInterval(() => void fetchDuty(false), 10000); return () => window.clearInterval(interval); }, [userId, fetchDuty]);

  useEffect(() => {
    if (!userId) return;
    const joinedIds = [user?.id, user?.numericId, user?.uid, user?.firebaseUid].filter((v) => v !== undefined && v !== null && text(v)).map(String).filter((v, i, a) => a.indexOf(v) === i);
    const joinRooms = () => joinedIds.forEach((id) => socket.emit("joinUser", id));
    const refreshFromSocket = async (data) => {
      const incoming = data?.task || (data?.title && (data?.id || data?.taskId) ? data : null);
      if (incoming?.id || incoming?.taskId) {
        const incomingId = String(incoming.id ?? incoming.taskId);
        setTasks((prev) => { const exists = prev.some((item) => String(item.id) === incomingId); const next = exists ? prev.map((item) => String(item.id) === incomingId ? { ...item, ...incoming } : item) : [incoming, ...prev]; writeTaskCache(userId, next); return next; });
      }
      void fetchTasks(false);
    };
    const handleAssigned = async (data = {}) => { await refreshFromSocket(data); showPopup("New Task Assigned", data?.title || "You received a new task", "new"); playNotificationSound(); };
    const handleTaskEvent = async (data = {}) => { await refreshFromSocket(data); const status = String(data?.status || "").trim(); if (status || data?.taskId || data?.id) showPopup(data?.title || "Task Update", status ? `Task #${data.taskId || data.id} → ${status}` : "Your task list was updated.", status === "Completed" ? "success" : status === "Rejected" ? "error" : "info"); };
    if (socket.connected) joinRooms(); socket.on("connect", joinRooms);
    const events = ["taskAssigned", "taskReassigned", "taskUpdate", "taskUpdated", "taskEdited", "taskDeleted", "taskDelete", "taskAccepted", "taskRejected", "taskCompleted", "taskStatusChanged", "updateData"];
    events.forEach((event) => socket.on(event, event === "taskAssigned" ? handleAssigned : handleTaskEvent));
    return () => { socket.off("connect", joinRooms); events.forEach((event) => socket.off(event, event === "taskAssigned" ? handleAssigned : handleTaskEvent)); };
  }, [userId, user?.id, user?.numericId, user?.uid, user?.firebaseUid, fetchTasks, showPopup, playNotificationSound]);

  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(() => { onMessageListener().then((payload) => { if (!mounted || !payload) return; const title = payload?.notification?.title || payload?.data?.title || "PowerHouse Notification"; const message = payload?.notification?.body || payload?.data?.body || payload?.data?.message || "You have a new PowerHouse update."; showPopup(title, message, "new"); playNotificationSound(); void fetchTasks(false); void fetchDuty(false); }).catch(() => {}); }, 300);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [fetchTasks, fetchDuty, playNotificationSound, showPopup]);

  const handleAccept = async (task) => {
    if (!task?.id || acceptingTaskId) return;
    setAcceptingTaskId(task.id);
    const now = new Date().toISOString();
    setTasks((prev) => { const next = prev.map((item) => String(item.id) === String(task.id) ? { ...item, status: "In Progress", accepted_at: item.accepted_at || now } : item); writeTaskCache(userId, next); return next; });
    try { await API.put(`/task/update-status/${task.id}`, { status: "In Progress" }); showPopup("Task Accepted", `Task #${task.id} is now In Progress`, "success"); void fetchTasks(false); }
    catch (error) { showPopup("Accept Failed", error?.response?.data?.message || "Could not accept this task", "error"); void fetchTasks(false); }
    finally { setAcceptingTaskId(null); }
  };

  const counts = useMemo(() => ({ pending: tasks.filter((t) => String(t.status) === "Pending").length, running: tasks.filter((t) => String(t.status) === "In Progress").length, completed: tasks.filter((t) => String(t.status) === "Completed").length, rejected: tasks.filter((t) => String(t.status) === "Rejected").length }), [tasks]);
  const allTasks = useMemo(() => [...tasks].sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0)), [tasks]);
  const dutyShift = duty?.currentShift;
  const daysRemaining = duty?.dutyDaysRemaining;
  const dutyStatus = duty?.todayDuty?.status || (dutyShift ? "on_duty" : "not_marked");
  const attendance = duty?.summary?.recordedDays ? (Number(duty.summary.dutyDays || 0) / Number(duty.summary.recordedDays || 1)) * 100 : 0;
  const statusStyle = (status) => status === "Completed" ? { bg: "bg-emerald-500/10", text: "text-emerald-300", icon: <CheckCircle size={14} /> } : status === "In Progress" ? { bg: "bg-blue-500/10", text: "text-blue-300", icon: <Layers size={14} /> } : status === "Rejected" ? { bg: "bg-red-500/10", text: "text-red-300", icon: <XCircle size={14} /> } : { bg: "bg-yellow-500/10", text: "text-yellow-300", icon: <Clock size={14} /> };
  const stats = [
    { label: "To Do", value: counts.pending, icon: <Clock size={21} />, tone: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "Running", value: counts.running, icon: <Layers size={21} />, tone: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Completed", value: counts.completed, icon: <ListTodo size={21} />, tone: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Rejected", value: counts.rejected, icon: <XCircle size={21} />, tone: "text-red-400", bg: "bg-red-500/10" },
    { label: "Total Tasks", value: tasks.length, icon: <LayoutGrid size={21} />, tone: "text-yellow-400", bg: "bg-yellow-500/10" },
  ];

  return <div className="min-h-full animate-in fade-in duration-300 px-4 pb-12 md:px-8"><div className="mx-auto max-w-[1650px]">
    <section className="relative mb-6 overflow-hidden rounded-[2.5rem] bg-yellow-500 p-6 shadow-2xl md:mb-8 md:rounded-[3.5rem] md:p-10 lg:p-12"><div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10"/><div className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-slate-900/5"/><div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><p className="mb-3 text-[10px] font-black uppercase tracking-[0.42em] text-slate-900">User Terminal</p><h1 className="text-3xl font-black uppercase italic leading-none text-slate-900 sm:text-4xl lg:text-5xl">Hello, {user?.name || "User"}</h1><div className="mt-5 flex flex-wrap gap-2.5"><span className="rounded-xl bg-slate-900 px-4 py-2 text-[9px] font-black uppercase italic text-white shadow-lg">ID: #{user?.id || "N/A"}</span><span className="rounded-xl bg-white/25 px-4 py-2 text-[9px] font-black uppercase italic text-slate-900">Tasks Assigned: {tasks.length}</span>{counts.pending > 0 && <span className="animate-pulse rounded-xl bg-red-500 px-4 py-2 text-[9px] font-black uppercase text-white shadow-lg">{counts.pending} Pending</span>}</div></div><div className="flex shrink-0 flex-col gap-2.5 sm:flex-row"><button onClick={() => { void fetchTasks(true); void fetchDuty(true); }} disabled={refreshing || dutyRefreshing} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/25 px-5 py-4 text-[10px] font-black uppercase text-slate-900 transition hover:bg-white/35 disabled:opacity-60"><RefreshCw size={17} className={(refreshing || dutyRefreshing) ? "animate-spin" : ""}/> Refresh</button><button onClick={() => navigate("/my-tasks")} className="inline-flex items-center justify-center gap-3 rounded-2xl bg-slate-900 px-7 py-4 text-[10px] font-black uppercase text-white shadow-2xl transition hover:-translate-y-0.5">My Tasks <ArrowRight size={18}/></button></div></div></section>

    <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 md:mb-8">{stats.map((item) => <div key={item.label} className="min-h-[145px] rounded-[2rem] border border-white/5 bg-slate-900/70 p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${item.bg} ${item.tone}`}>{item.icon}</span><LayoutGrid className="text-white/[0.035]" size={38}/></div><p className="mt-5 text-3xl font-black italic text-white md:text-4xl">{item.value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</p></div>)}</section>

    <section className="mb-6 rounded-[2.5rem] border border-yellow-500/10 bg-slate-900/55 p-5 shadow-2xl md:mb-8 md:rounded-[3rem] md:p-8"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-400">Workforce Status</p><h2 className="mt-1 text-xl font-black uppercase italic text-white md:text-2xl">My Duty</h2><p className="mt-1 text-xs text-slate-500">Your assigned shift, working hours and duty duration.</p></div><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[9px] font-black uppercase ${dutyStatus === "on_duty" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : dutyStatus === "leave" ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-300" : dutyStatus === "off_duty" ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-white/10 bg-white/5 text-slate-400"}`}><UserCheck size={13}/>{dutyStatus === "on_duty" ? "On Duty" : dutyStatus === "leave" ? "On Leave" : dutyStatus === "off_duty" ? "Off Duty" : "Not Marked"}</span><button onClick={() => void fetchDuty(true)} disabled={dutyRefreshing} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-slate-300"><RefreshCw size={14} className={dutyRefreshing ? "animate-spin" : ""}/></button></div></div>{dutyLoading ? <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.025] p-7 text-sm text-slate-500">Loading duty assignment…</div> : <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-yellow-400"><Sunrise size={18}/><span className="text-[9px] font-black uppercase tracking-widest">Shift</span></div><p className="mt-3 text-base font-black text-white">{dutyShift?.shift_name || "No duty assigned"}</p><p className="mt-1 text-xs text-slate-500">{dutyShift ? `${formatTime(dutyShift.start_time)} – ${formatTime(dutyShift.end_time)}` : "Waiting for assignment"}</p></div><div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-blue-400"><Clock size={18}/><span className="text-[9px] font-black uppercase tracking-widest">Duty Time</span></div><p className="mt-3 text-base font-black text-white">{dutyShift ? `${formatTime(dutyShift.start_time)} – ${formatTime(dutyShift.end_time)}` : "—"}</p><p className="mt-1 text-xs text-slate-500">Effective {dutyShift?.effective_from ? formatDate(dutyShift.effective_from) : "—"}</p></div><div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-emerald-400"><CalendarDays size={18}/><span className="text-[9px] font-black uppercase tracking-widest">Duty Duration</span></div><p className="mt-3 text-base font-black text-white">{daysRemaining === null || daysRemaining === undefined ? (dutyShift ? "Ongoing" : "—") : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`}</p><p className="mt-1 text-xs text-slate-500">{duty?.shiftEnd ? `Ends ${formatDate(duty.shiftEnd)}` : "No end date set"}</p></div><div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-yellow-400"><Timer size={18}/><span className="text-[9px] font-black uppercase tracking-widest">Monthly Attendance</span></div><p className="mt-3 text-base font-black text-white">{attendance.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-500">{Number(duty?.summary?.dutyDays || 0)} duty · {Number(duty?.summary?.leaveDays || 0)} leave · {Number(duty?.summary?.offDays || 0)} off</p></div></div>}</section>

    <section className="rounded-[2.5rem] border border-white/5 bg-slate-900/45 p-5 shadow-2xl md:rounded-[3rem] md:p-8"><div className="flex flex-col gap-3 border-b border-white/5 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-400">Task Register</p><h2 className="mt-1 text-xl font-black uppercase italic text-white md:text-2xl">All Assigned Tasks</h2><p className="mt-1 text-xs text-slate-500">Complete task list synced automatically. New assignments appear here without refreshing the page.</p></div><button onClick={() => navigate("/my-tasks")} className="inline-flex items-center gap-2 self-start text-[10px] font-black uppercase text-yellow-400">Open My Tasks <ArrowRight size={15}/></button></div><div className="mt-5 overflow-x-auto rounded-2xl border border-white/5"><table className="w-full min-w-[1050px] text-left"><thead className="bg-white/[0.025] text-[9px] font-black uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-4">Task</th><th className="px-4 py-4">Panel / Location</th><th className="px-4 py-4">Assigned</th><th className="px-4 py-4">Status</th><th className="px-4 py-4 text-right">Action</th></tr></thead><tbody>{allTasks.length ? allTasks.map((task) => { const style = statusStyle(task.status); return <tr key={task.id} className="border-t border-white/5 transition hover:bg-white/[0.025]"><td className="px-4 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-[10px] font-black italic text-yellow-400">#{task.id}</span><div className="min-w-0"><p className="max-w-[330px] truncate text-sm font-bold text-white">{task.title || "Untitled Task"}</p><p className="mt-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-slate-600"><Calendar size={11}/>{formatDateTime(task.created_at || task.createdAt)}</p></div></div></td><td className="px-4 py-4"><div className="flex min-w-[210px] flex-col gap-1.5">{task.panel_id ? <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-yellow-500/10 px-2.5 py-1.5 text-[9px] font-black uppercase text-yellow-400"><Zap size={11}/>{task.panel_code || `Panel #${task.panel_id}`}</span> : <span className="text-xs text-slate-600">No panel linked</span>}{(task.panel_area || task.panel_location || task.location) && <span className="flex items-center gap-1 text-[9px] text-slate-500"><MapPin size={11}/>{[task.panel_area, task.panel_location, task.location].filter(Boolean).join(" • ")}</span>}</div></td><td className="px-4 py-4"><span className="whitespace-nowrap text-xs font-semibold text-slate-400">{formatDate(task.assigned_at || task.created_at || task.createdAt)}</span></td><td className="px-4 py-4"><span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[9px] font-black uppercase ${style.bg} ${style.text}`}>{style.icon}{task.status || "Pending"}</span></td><td className="px-4 py-4"><div className="flex justify-end gap-2"><button onClick={() => navigate(`/task-view/${task.id}`)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase text-slate-300 hover:bg-white/[0.08]"><ExternalLink size={13}/> View</button>{task.status === "Pending" && <button onClick={() => void handleAccept(task)} disabled={acceptingTaskId === task.id} className="rounded-xl bg-blue-500 px-3 py-2 text-[9px] font-black uppercase text-white disabled:opacity-50">{acceptingTaskId === task.id ? "Accepting…" : "Accept"}</button>}</div></td></tr>; }) : <tr><td colSpan="5" className="px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.03] text-slate-600"><ListTodo size={21}/></div><p className="mt-3 text-sm font-bold text-slate-500">No tasks assigned yet.</p><p className="mt-1 text-xs text-slate-700">New assignments will appear automatically.</p></td></tr>}</tbody></table></div><div className="mt-4 flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-600"><span>{allTasks.length} total task{allTasks.length === 1 ? "" : "s"}</span><span>•</span><span>{counts.pending} pending</span><span>•</span><span>{counts.running} running</span><span>•</span><span>{counts.completed} completed</span></div></section>
  </div>{popup && <div className="fixed bottom-5 right-5 z-[100] w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-yellow-500/20 bg-[#0b1326] p-4 shadow-2xl"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10 text-yellow-400"><Bell size={17}/></span><div className="min-w-0"><p className="text-sm font-black text-white">{popup.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{popup.msg}</p></div><button onClick={() => setPopup(null)} className="ml-auto text-slate-600 hover:text-white" aria-label="Close notification"><X size={15}/></button></div></div>}</div>;
}
