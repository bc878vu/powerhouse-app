import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "./api";

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.users)) return value.users;
  if (Array.isArray(value?.staff)) return value.staff;
  return [];
};

export default function StaffRecordFast2() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [duty, setDuty] = useState([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dutyLoading, setDutyLoading] = useState(false);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await API.get("/user/all");
      setUsers(asArray(response?.data));
    } catch (e) {
      console.error("Staff users:", e);
      setError(e?.message || "Unable to load staff data.");
    } finally {
      setLoading(false);
    }
  };

  const loadDuty = async () => {
    setDutyLoading(true);
    try {
      const response = await Promise.race([
        API.get("/duty/staff", { params: { year, month } }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2000))
      ]);
      if (response) setDuty(asArray(response.data));
    } catch (e) {
      console.warn("Duty data:", e);
    } finally {
      setDutyLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { if (users.length) loadDuty(); }, [month, year, users.length]);

  const dutyMap = useMemo(() => {
    const map = new Map();
    duty.forEach((row) => map.set(String(row.id ?? row.uid ?? row.user_id), row));
    return map;
  }, [duty]);

  const rows = useMemo(() => users.map((u, index) => {
    const row = dutyMap.get(String(u.id ?? u.uid ?? u.user_id)) || {};
    const employeeId = u.employeeID || u.employee_id || u.staffId || u.staff_id;
    return {
      ...u,
      displayId: employeeId || (/^\d+$/.test(String(u.id || "")) ? u.id : `#${String(index + 1).padStart(3, "0")}`),
      currentShift: row.currentShift,
      todayDuty: row.todayDuty,
      monthlySummary: row.monthlySummary || { dutyDays: 0, leaveDays: 0, offDays: 0 }
    };
  }), [users, dutyMap]);

  const roles = useMemo(() => Array.from(new Set(rows.map((u) => String(u.role || "staff").toLowerCase()))), [rows]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows.filter((u) => {
      const text = `${u.displayId} ${u.name || ""} ${u.email || ""} ${u.phone || ""} ${u.role || ""}`.toLowerCase();
      return (!q || text.includes(q)) && (role === "all" || String(u.role || "staff").toLowerCase() === role);
    });
  }, [rows, query, role]);

  const total = rows.length;
  const onDuty = rows.filter((u) => u.todayDuty?.status === "on_duty").length;
  const onLeave = rows.filter((u) => u.todayDuty?.status === "leave").length;
  const off = rows.filter((u) => u.todayDuty?.status === "off_duty").length;

  return <div className="min-h-screen bg-[#080d1d] p-5 text-white md:p-8">
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 text-xs font-bold uppercase tracking-[.25em] text-yellow-400">Workforce Management</div><h1 className="text-3xl font-black">Staff Records</h1><p className="mt-2 text-sm text-slate-400">Staff directory and duty information</p></div>
        <button onClick={loadUsers} className="rounded-xl bg-yellow-500 px-5 py-3 font-bold text-slate-950">Refresh Data</button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[total,"Total Staff"],[onDuty,"On Duty Today"],[onLeave,"On Leave Today"],[off,"Off Today"]].map(([n,label]) => <div key={label} className="rounded-2xl border border-white/10 bg-[#11182c] p-5"><div className="text-3xl font-black">{n}</div><div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{label}</div></div>)}
      </div>

      <div className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-[#11182c] p-4 lg:grid-cols-[1fr_190px_170px_110px]">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by ID, name, email or phone..." className="rounded-xl bg-[#1c2740] px-4 py-3 outline-none placeholder:text-slate-500" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl bg-[#1c2740] px-4 py-3 outline-none"><option value="all">All Roles</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-xl bg-[#1c2740] px-4 py-3 outline-none">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(2000,i,1).toLocaleString("en-US",{month:"long"})}</option>)}</select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl bg-[#1c2740] px-4 py-3 outline-none">{[year-1,year,year+1].map((y)=><option key={y} value={y}>{y}</option>)}</select>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1528]">
        <div className="flex justify-between border-b border-white/10 p-5"><div><div className="font-bold">Staff Directory</div><div className="text-xs text-slate-500">{filtered.length} member(s)</div></div>{dutyLoading && <div className="text-xs text-yellow-400">Updating duty data...</div>}</div>
        {loading ? <div className="flex h-64 items-center justify-center text-slate-400">Loading staff...</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#151f35] text-xs uppercase text-slate-400"><tr><th className="p-4">ID</th><th className="p-4">Staff</th><th className="p-4">Role / Status</th><th className="p-4">Current Shift</th><th className="p-4">Today Duty</th><th className="p-4">Monthly Record</th><th className="p-4">Actions</th></tr></thead><tbody className="divide-y divide-white/5">{filtered.map((u,i)=><tr key={u.id||u.uid||i} className="hover:bg-white/[.02]"><td className="p-4 font-bold text-yellow-400">{u.displayId}</td><td className="p-4"><div className="font-bold">{u.name||"Unnamed Staff"}</div><div className="text-xs text-slate-500">{u.email||"No email"}</div>{u.phone&&<div className="text-xs text-slate-500">{u.phone}</div>}</td><td className="p-4"><div className="mb-2 inline-block rounded-full bg-yellow-500/15 px-3 py-1 text-xs text-yellow-300">{u.role||"staff"}</div><div className="text-xs text-emerald-300">{u.status||"active"}</div></td><td className="p-4 text-slate-300">{u.currentShift?.shift_name||"No shift assigned"}{u.currentShift?.start_time&&<div className="text-xs text-slate-500">{u.currentShift.start_time} - {u.currentShift.end_time||""}</div>}</td><td className="p-4"><span className="rounded-lg bg-slate-700 px-3 py-2 text-xs">{u.todayDuty?.status||"Not Marked"}</span></td><td className="p-4"><span className="mr-2 text-emerald-300">Duty {u.monthlySummary.dutyDays||0}</span><span className="mr-2 text-orange-300">Leave {u.monthlySummary.leaveDays||0}</span><span className="text-red-300">Off {u.monthlySummary.offDays||0}</span></td><td className="p-4"><button onClick={()=>navigate(`/user/${u.id}`)} className="rounded-lg bg-blue-500/15 px-3 py-2 text-blue-300">View</button></td></tr>)}</tbody></table>{filtered.length===0&&!loading&&<div className="p-10 text-center text-slate-500">No staff members found.</div>}</div>}
      </div>
    </div>
  </div>;
}
