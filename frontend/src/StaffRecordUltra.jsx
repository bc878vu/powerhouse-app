import React, { useEffect, useMemo, useState } from "react";
import { Eye, Search, Users, UserCheck, UserX, Palmtree, Phone, Mail, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import API from "./api";

const normalize = (value) => String(value ?? "").trim();
const displayId = (user, index) => {
  const employee = normalize(user.employeeID || user.employee_id || user.staffId || user.staff_id);
  if (employee) return employee;
  const numeric = normalize(user.id);
  if (/^\d+$/.test(numeric)) return numeric;
  return String(index + 1);
};

export default function StaffRecordUltra() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await API.get("/user/all");
        if (!cancelled) setUsers(Array.isArray(response?.data) ? response.data : []);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Staff records could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const roles = useMemo(() => [...new Set(users.map((u) => normalize(u.role || u.category).toLowerCase()).filter(Boolean))], [users]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      const text = [u.name, u.email, u.phone, u.employeeID, u.id, u.role, u.category, u.address].map((v) => normalize(v).toLowerCase()).join(" ");
      const r = normalize(u.role || u.category || "staff").toLowerCase();
      const s = normalize(u.status || "active").toLowerCase();
      return (!q || text.includes(q)) && (role === "all" || r === role) && (status === "all" || s === status);
    });
  }, [users, search, role, status]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => normalize(u.status || "active").toLowerCase() === "active").length,
    leave: users.filter((u) => normalize(u.status).toLowerCase() === "on_leave").length,
    off: users.filter((u) => ["inactive", "off"].includes(normalize(u.status).toLowerCase())).length
  }), [users]);

  return (
    <div className="min-h-screen bg-[#080d1d] px-4 py-7 text-white md:px-8">
      <div className="mx-auto max-w-[1650px]">
        <div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-yellow-400">Workforce Management</p><h1 className="text-3xl font-black md:text-4xl">Staff Records</h1><p className="mt-2 text-sm text-slate-400">Fast employee directory with complete available staff information.</p></div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Users size={20} />} value={counts.total} label="Total Staff" />
          <Stat icon={<UserCheck size={20} />} value={counts.active} label="Active" />
          <Stat icon={<Palmtree size={20} />} value={counts.leave} label="On Leave" />
          <Stat icon={<UserX size={20} />} value={counts.off} label="Inactive / Off" />
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-[#11182c] p-4 lg:grid-cols-[1fr_190px_190px]">
          <label className="flex items-center gap-3 rounded-xl bg-[#1c2740] px-4"><Search size={18} className="text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, name, email, phone, address..." className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-500" /></label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl bg-[#1c2740] px-4 py-3 text-sm outline-none"><option value="all">All Roles</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl bg-[#1c2740] px-4 py-3 text-sm outline-none"><option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option></select>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1528] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-4"><h2 className="font-bold">Employee Directory</h2><p className="mt-1 text-xs text-slate-500">{filtered.length} of {users.length} staff members shown</p></div>
          {loading ? <div className="flex min-h-[360px] items-center justify-center text-slate-400"><div className="text-center"><div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-yellow-500/30 border-t-yellow-500" /><p>Loading staff records…</p></div></div> : filtered.length === 0 ? <div className="flex min-h-[300px] items-center justify-center text-slate-500">No staff members found.</div> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm"><thead className="bg-[#151f35] text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">ID</th><th className="px-5 py-4">Staff</th><th className="px-5 py-4">Contact</th><th className="px-5 py-4">Role / Status</th><th className="px-5 py-4">Personal Information</th><th className="px-5 py-4">Address</th><th className="px-5 py-4">Actions</th></tr></thead>
              <tbody className="divide-y divide-white/5">{filtered.map((u, index) => { const s = normalize(u.status || "active").toLowerCase(); return <tr key={u.id || u.uid || `${u.email}-${index}`} className="hover:bg-white/[0.025]">
                <td className="px-5 py-5"><span className="rounded-lg bg-yellow-500/10 px-3 py-2 font-bold text-yellow-400">{displayId(u, index)}</span></td>
                <td className="px-5 py-5"><div className="flex items-center gap-3"><Avatar user={u} /><div><div className="font-bold text-white">{u.name || "Unnamed Staff"}</div><div className="mt-1 text-xs text-slate-500">{u.email || "No email"}</div></div></div></td>
                <td className="px-5 py-5"><div className="space-y-2 text-xs text-slate-300"><div className="flex items-center gap-2"><Mail size={14} className="text-slate-500" />{u.email || "—"}</div><div className="flex items-center gap-2"><Phone size={14} className="text-slate-500" />{u.phone || "—"}</div></div></td>
                <td className="px-5 py-5"><div className="mb-2 inline-flex rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-300">{u.role || u.category || "staff"}</div><div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${s === "active" ? "bg-emerald-500/15 text-emerald-300" : s === "on_leave" ? "bg-orange-500/15 text-orange-300" : "bg-red-500/15 text-red-300"}`}>{u.status || "Active"}</span></div></td>
                <td className="px-5 py-5 text-xs text-slate-300"><div>Marital: <span className="text-white">{u.maritalStatus || "—"}</span></div><div className="mt-2 max-w-[280px] truncate" title={u.backgroundInfo || ""}>Info: <span className="text-white">{u.backgroundInfo || "—"}</span></div></td>
                <td className="px-5 py-5 text-xs text-slate-300"><div className="flex max-w-[260px] items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" /><span>{u.address || "No address"}</span></div></td>
                <td className="px-5 py-5"><button onClick={() => navigate(`/user/${u.id || u.uid}`)} className="inline-flex items-center gap-2 rounded-xl bg-blue-500/15 px-4 py-2.5 font-semibold text-blue-300 hover:bg-blue-500/25"><Eye size={16} /> View Details</button></td>
              </tr>; })}</tbody></table></div>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ user }) { const name = normalize(user.name || user.email || "U"); const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "U"; return <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-yellow-500/50 bg-yellow-500/10 font-bold text-yellow-400">{user.profile_pic ? <img src={user.profile_pic} alt="" className="h-full w-full object-cover" /> : initials}</div>; }
function Stat({ icon, value, label }) { return <div className="rounded-2xl border border-white/10 bg-[#10182c] p-5"><div className="mb-4 inline-flex rounded-xl bg-yellow-500/10 p-3 text-yellow-400">{icon}</div><div className="text-3xl font-black">{value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div></div>; }
