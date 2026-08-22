import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Edit3, RefreshCw, Search, Users, UserCheck, UserX, Palmtree, Clock3 } from "lucide-react";
import API from "./api";

const safeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.users)) return value.users;
  if (Array.isArray(value?.staff)) return value.staff;
  return [];
};

const displayId = (user, index) => {
  const value = user?.employeeID || user?.employee_id || user?.staffId || user?.staff_id;
  if (value) return String(value);
  if (/^\d+$/.test(String(user?.id || ""))) return String(user.id);
  return `#${String(index + 1).padStart(3, "0")}`;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function StaffRecordFast() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [dutyRows, setDutyRows] = useState([]);
  const [summary, setSummary] = useState({ totalStaff: 0, onDutyToday: 0, onLeaveToday: 0, offToday: 0 });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [dutyLoading, setDutyLoading] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await API.get("/user/all");
      const data = safeArray(response?.data);
      setUsers(data);
      setSummary((old) => ({ ...old, totalStaff: data.filter((u) => String(u.role || "").toLowerCase() !== "superadmin").length }));
    } catch (err) {
      console.error("STAFF USERS LOAD ERROR", err);
      setError(err?.message || "Staff data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const loadDutyInBackground = async () => {
    setDutyLoading(true);
    try {
      const result = await Promise.race([
        API.get("/duty/staff", { params: { year, month } }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500))
      ]);
      if (result) {
        const rows = safeArray(result?.data);
        setDutyRows(rows);
      }
    } catch (err) {
      console.warn("Duty data temporarily unavailable:", err?.message || err);
    } finally {
      setDutyLoading(false);
    }

    try {
      const result = await Promise.race([
        API.get("/duty/summary"),
        new Promise((resolve) => setTimeout(() => resolve(null), 2000))
      ]);
      if (result?.data) {
        setSummary((old) => ({
          ...old,
          totalStaff: Number(result.data.totalStaff || old.totalStaff || 0),
          onDutyToday: Number(result.data.onDutyToday || 0),
          onLeaveToday: Number(result.data.onLeaveToday || 0),
          offToday: Number(result.data.offToday || 0)
        }));
      }
    } catch (err) {
      console.warn("Duty summary unavailable:", err?.message || err);
    }
  };

  useEffect(() => {
    let active = true;
    loadUsers();
    // Do not block the page on duty history. Staff list renders first.
    const timer = setTimeout(() => { if (active) loadDutyInBackground(); }, 50);
    return () => { active = false; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!users.length) return;
    loadDutyInBackground();
  }, [month, year]);

  const dutyMap = useMemo(() => {
    const map = new Map();
    dutyRows.forEach((row) => {
      const key = String(row.id ?? row.uid ?? row.user_id ?? "");
      if (key) map.set(key, row);
    });
    return map;
  }, [dutyRows]);

  const merged = useMemo(() => users.map((user, index) => {
    const key = String(user.id ?? user.uid ?? user.user_id ?? "");
    const duty = dutyMap.get(key) || {};
    return {
      ...user,
      _displayId: displayId(user, index),
      currentShift: duty.currentShift || null,
      todayDuty: duty.todayDuty || null,
      monthlySummary: duty.monthlySummary || { dutyDays: 0, leaveDays: 0, offDays: 0 }
    };
  }), [users, dutyMap]);

  const roles = useMemo(() => [...new Set(merged.map((u) => String(u.role || "staff").toLowerCase()).filter(Boolean))], [merged]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter((u) => {
      const text = [u.name, u.email, u.phone, u._displayId, u.employeeID, u.role].map((v) => String(v || "").toLowerCase()).join(" ");
      return (!q || text.includes(q)) && (role === "all" || String(u.role || "staff").toLowerCase() === role);
    });
  }, [merged, search, role]);

  const setStatus = async (user, status) => {
    try {
      const payload = new FormData();
      ["name", "email", "role", "phone", "maritalStatus", "address", "backgroundInfo"].forEach((key) => payload.append(key, user[key] || ""));
      payload.append("status", status);
      await API.put(`/user/${user.id}`, payload);
      setUsers((old) => old.map((u) => String(u.id) === String(user.id) ? { ...u, status } : u));
    } catch (err) {
      window.alert(err?.message || "Unable to update staff status.");
    }
  };

  const currentMonthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });

  return (
    <div className="min-h-screen bg-[#080d1d] px-4 py-6 md:px-8 text-white">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-yellow-400">Workforce Management</p>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Staff Records</h1>
            <p className="mt-2 text-sm text-slate-400">Fast staff directory, duty status and monthly attendance.</p>
          </div>
          <button onClick={() => { loadUsers(); loadDutyInBackground(); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 font-bold text-slate-950 hover:bg-yellow-400">
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Refresh Data
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Users size={20} />} value={summary.totalStaff} label="Total Staff" />
          <Stat icon={<UserCheck size={20} />} value={summary.onDutyToday} label="On Duty Today" />
          <Stat icon={<Palmtree size={20} />} value={summary.onLeaveToday} label="On Leave Today" />
          <Stat icon={<UserX size={20} />} value={summary.offToday} label="Off Today" />
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-[#11182c] p-4 lg:grid-cols-[1fr_190px_170px_110px]">
          <label className="flex items-center gap-3 rounded-xl bg-[#1c2740] px-4">
            <Search size={18} className="text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, name, email or phone..." className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-500" />
          </label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl bg-[#1c2740] px-4 py-3 text-sm outline-none">
            <option value="all">All Roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-xl bg-[#1c2740] px-4 py-3 text-sm outline-none">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString("en-US", { month: "long" })}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl bg-[#1c2740] px-4 py-3 text-sm outline-none">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1528] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="font-bold">Staff Directory</h2>
              <p className="text-xs text-slate-500">{filtered.length} staff member{filtered.length === 1 ? "" : "s"} shown</p>
            </div>
            {dutyLoading && <span className="inline-flex items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" /> Updating duty data…</span>}
          </div>

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center gap-3 text-slate-400"><span className="h-5 w-5 animate-spin rounded-full border-2 border-yellow-500/30 border-t-yellow-500" /> Loading staff…</div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-slate-500">No staff members found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-[#151f35] text-xs uppercase tracking-wider text-slate-400">
                  <tr><th className="px-5 py-4">ID</th><th className="px-5 py-4">Staff</th><th className="px-5 py-4">Role / Status</th><th className="px-5 py-4">Current Shift</th><th className="px-5 py-4">Today Duty</th><th className="px-5 py-4">{currentMonthName} Record</th><th className="px-5 py-4">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((u, i) => {
                    const status = String(u.status || "active").toLowerCase();
                    const dutyStatus = u.todayDuty?.status || "not_marked";
                    return <tr key={u.id || u.uid || i} className="hover:bg-white/[0.025]">
                      <td className="px-5 py-5 font-bold text-yellow-400">{u._displayId}</td>
                      <td className="px-5 py-5"><div className="font-bold text-white">{u.name || "Unnamed Staff"}</div><div className="mt-1 text-xs text-slate-500">{u.email || "No email"}</div>{u.phone && <div className="mt-1 text-xs text-slate-500">{u.phone}</div>}</td>
                      <td className="px-5 py-5"><div className="mb-2 inline-flex rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-300">{u.role || "staff"}</div><div><select value={status} onChange={(e) => setStatus(u, e.target.value)} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 outline-none"><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option></select></div></td>
                      <td className="px-5 py-5 text-slate-300">{u.currentShift ? <><div className="font-semibold">{u.currentShift.shift_name || "Assigned Shift"}</div><div className="text-xs text-slate-500">{u.currentShift.start_time || ""} - {u.currentShift.end_time || ""}</div></> : <span className="text-slate-600">No shift assigned</span>}</td>
                      <td className="px-5 py-5"><span className={`rounded-lg px-3 py-2 text-xs font-semibold ${dutyStatus === "on_duty" ? "bg-emerald-500/15 text-emerald-300" : dutyStatus === "leave" ? "bg-orange-500/15 text-orange-300" : dutyStatus === "off_duty" ? "bg-red-500/15 text-red-300" : "bg-slate-700 text-slate-300"}`}>{dutyStatus === "on_duty" ? "On Duty" : dutyStatus === "leave" ? "Leave" : dutyStatus === "off_duty" ? "Off" : "Not Marked"}</span></td>
                      <td className="px-5 py-5"><div className="flex gap-2"><Mini label="Duty" value={u.monthlySummary.dutyDays} /><Mini label="Leave" value={u.monthlySummary.leaveDays} /><Mini label="Off" value={u.monthlySummary.offDays} /></div></td>
                      <td className="px-5 py-5"><div className="flex gap-2"><button title="View details" onClick={() => navigate(`/user/${u.id}`)} className="rounded-lg bg-blue-500/15 p-2 text-blue-300 hover:bg-blue-500/25"><Eye size={17} /></button><button title="Edit staff" onClick={() => navigate(`/user/${u.id}`)} className="rounded-lg bg-white/5 p-2 text-slate-300 hover:bg-white/10"><Edit3 size={17} /></button></div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }) { return <div className="rounded-2xl border border-white/10 bg-[#10182c] p-5"><div className="mb-4 inline-flex rounded-xl bg-yellow-500/10 p-3 text-yellow-400">{icon}</div><div className="text-3xl font-black">{value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div></div>; }
function Mini({ label, value }) { return <div className="min-w-[54px] rounded-lg bg-[#172137] px-2 py-2 text-center"><div className="font-bold text-emerald-300">{value || 0}</div><div className="text-[9px] uppercase text-slate-500">{label}</div></div>; }
