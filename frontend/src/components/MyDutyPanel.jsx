import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, RefreshCw, UserCheck, UserX, Palmtree, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { getUser } from "../utils/auth";

const t = (v) => String(v ?? "").trim();
const idOf = (u) => u?.id ?? u?.user_id ?? u?.userId ?? null;
const label = (s) => s === "on_duty" ? "On Duty" : s === "leave" ? "On Leave" : s === "off_duty" ? "Off Duty" : "Not Marked";
const cls = (s) => s === "on_duty" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : s === "leave" ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-300" : s === "off_duty" ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[0.04] text-slate-400";
const monthName = (m) => new Date(2000, m - 1, 1).toLocaleString(undefined, { month: "long" });

export default function MyDutyPanel({ compact = false }) {
  const user = getUser();
  const navigate = useNavigate();
  const userId = idOf(user);
  const now = new Date();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const load = async (silent = false) => {
    if (!userId) { setError("Your staff account ID is unavailable."); setLoading(false); return; }
    silent ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [current, monthly] = await Promise.all([
        API.get(`/duty/user/${userId}`),
        API.get(`/duty/user/${userId}/monthly`, { params: { year, month } })
      ]);
      setData({ ...(current?.data || {}), ...(monthly?.data || {}) });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Duty information could not be loaded.");
    } finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(false); }, [userId, year, month]);

  const summary = data?.summary || data?.monthlySummary || {};
  const records = Array.isArray(data?.records) ? data.records : Array.isArray(data?.recentHistory) ? data.recentHistory : [];
  const recorded = Number(summary.recordedDays || 0);
  const duty = Number(summary.dutyDays || 0);
  const leave = Number(summary.leaveDays || 0);
  const off = Number(summary.offDays || 0);
  const attendance = recorded ? (duty / recorded) * 100 : 0;
  const today = data?.todayDuty;
  const shift = data?.currentShift;
  const upcoming = useMemo(() => records.filter(x => t(x.duty_date) >= new Date().toISOString().slice(0, 10)).slice(0, 5), [records]);

  if (loading) return <section className="rounded-[2rem] border border-white/10 bg-[#080f20] p-6"><div className="animate-pulse text-sm text-slate-500">Loading your duty report…</div></section>;
  return <section className="rounded-[2rem] border border-yellow-500/10 bg-[#080f20] p-5 md:p-6 shadow-xl">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-yellow-400">My Workforce Status</p><h2 className="mt-1 text-xl md:text-2xl font-black">My Duty & Attendance</h2><p className="mt-1 text-xs text-slate-500">Your assigned duty, shift and attendance are synced with Staff Duty Management.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""}/> Refresh</button><button onClick={() => navigate("/staff-duty")} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-3 py-2 text-xs font-black text-black"><CalendarDays size={14}/> Duty Center <ArrowRight size={14}/></button></div>
    </div>
    {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Today</p><div className="mt-2 flex items-center justify-between gap-2"><span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${cls(today?.status)}`}>{label(today?.status)}</span><UserCheck size={18} className="text-emerald-400"/></div>{today?.notes && <p className="mt-2 text-xs text-slate-500">{today.notes}</p>}</div>
      <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Current Shift</p><p className="mt-2 text-sm font-black">{shift?.shift_name || today?.shift_name || "No shift assigned"}</p><p className="mt-1 text-xs text-slate-500">{t(shift?.start_time || today?.start_time).slice(0,5) || "--:--"} - {t(shift?.end_time || today?.end_time).slice(0,5) || "--:--"}</p></div>
      <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{monthName(month)} {year} Attendance</p><p className="mt-2 text-2xl font-black text-yellow-400">{attendance.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-500">{duty} duty · {leave} leave · {off} off</p></div>
    </div>
    {!compact && <><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button onClick={() => month === 1 ? (setMonth(12), setYear(y => y - 1)) : setMonth(m => m - 1)} className="h-9 w-9 rounded-lg bg-white/5">‹</button><b className="min-w-32 text-center text-sm">{monthName(month)} {year}</b><button onClick={() => month === 12 ? (setMonth(1), setYear(y => y + 1)) : setMonth(m => m + 1)} className="h-9 w-9 rounded-lg bg-white/5">›</button></div><div className="flex gap-2 text-[10px] font-black"><span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-300">{duty} DUTY</span><span className="rounded-lg bg-yellow-500/10 px-2 py-1 text-yellow-300">{leave} LEAVE</span><span className="rounded-lg bg-red-500/10 px-2 py-1 text-red-300">{off} OFF</span></div></div>
    <div className="mt-4 overflow-x-auto rounded-2xl border border-white/5"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[0.025] text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Notes</th></tr></thead><tbody>{(records.length ? records.slice(0, 12) : upcoming).map((r, i) => <tr key={r.id || i} className="border-t border-white/5"><td className="px-4 py-3 font-bold">{r.duty_date || "—"}</td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${cls(r.status)}`}>{label(r.status)}</span></td><td className="px-4 py-3">{r.shift_name || "—"}</td><td className="px-4 py-3 text-slate-400">{t(r.start_time).slice(0,5)} - {t(r.end_time).slice(0,5)}</td><td className="max-w-xs px-4 py-3 text-slate-500">{r.notes || "—"}</td></tr>)}</tbody></table>{!records.length && <div className="p-8 text-center text-xs text-slate-600">No duty records for this month.</div>}</div></>}
  </section>;
}