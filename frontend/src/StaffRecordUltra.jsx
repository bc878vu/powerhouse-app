import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ban, CheckCircle2, Edit3, Eye, Loader2, Mail, MapPin, Phone, Plus, RefreshCw, Search, Trash2, UserCog, Users, X } from "lucide-react";
import API from "./api";

const EMPTY = { name: "", email: "", phone: "", role: "electrician", status: "active", maritalStatus: "Single", address: "", backgroundInfo: "" };
const normalize = (value) => String(value ?? "").trim();
const photoOf = (user) => normalize(user?.profile_pic || user?.profilePic || user?.photoURL || "");
const initials = (name) => normalize(name || "User").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "U";

function Avatar({ user, large = false }) {
  const photo = photoOf(user);
  const size = large ? "h-24 w-24 rounded-3xl text-2xl" : "h-11 w-11 rounded-xl text-sm";
  return photo ? <img src={photo} alt="" className={`${size} shrink-0 object-cover ring-1 ring-white/10`} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <span className={`flex ${size} shrink-0 items-center justify-center bg-yellow-500 text-black font-black`}>{initials(user?.name || user?.email)}</span>;
}

export default function StaffRecordUltra() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await API.get("/user/all");
      setUsers(Array.isArray(response?.data) ? response.data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Users could not be loaded.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      const text = [u.id, u.name, u.email, u.phone, u.employeeID, u.role, u.address].map((v) => normalize(v).toLowerCase()).join(" ");
      const r = normalize(u.role || u.category || "staff").toLowerCase();
      const s = normalize(u.status || "active").toLowerCase();
      return (!q || text.includes(q)) && (role === "all" || r === role) && (status === "all" || s === status);
    });
  }, [users, search, role, status]);

  const openEdit = (user) => {
    setEditing(user);
    setPhoto(null);
    setForm({ ...EMPTY, ...user, name: user.name || "", email: user.email || "", role: user.role || user.category || "electrician", status: user.status || "active" });
  };

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    if (!editing?.id) return;
    setBusy(true); setToast(""); setError("");
    try {
      const payload = new FormData();
      ["name", "phone", "role", "status", "maritalStatus", "address", "backgroundInfo"].forEach((key) => payload.append(key, String(form[key] || "")));
      if (photo) payload.append("profile_pic", photo, photo.name);
      const response = await API.put(`/user/${editing.id}`, payload, { timeout: 120000 });
      const updated = response?.data?.user || response?.user || { ...editing, ...form };
      setUsers((items) => items.map((item) => String(item.id) === String(editing.id) ? { ...item, ...updated, ...form } : item));
      setEditing(null); setToast("User profile updated successfully.");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "User update failed.");
    } finally { setBusy(false); }
  };

  const toggleStatus = async (user) => {
    if (!user?.id) return;
    setBusy(true); setError("");
    try {
      const next = normalize(user.status).toLowerCase() === "active" ? "inactive" : "active";
      await API.put(`/user/${user.id}`, { status: next });
      setUsers((items) => items.map((item) => String(item.id) === String(user.id) ? { ...item, status: next } : item));
      setToast(next === "active" ? "User activated." : "User deactivated.");
    } catch (err) { setError(err?.response?.data?.message || err?.message || "Status update failed."); }
    finally { setBusy(false); }
  };

  const remove = async (user) => {
    if (!user?.id || !window.confirm(`Delete ${user.name || user.email || "this user"}? This action cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      await API.delete(`/user/${user.id}`);
      setUsers((items) => items.filter((item) => String(item.id) !== String(user.id)));
      setToast("User deleted successfully.");
    } catch (err) { setError(err?.response?.data?.message || err?.message || "User deletion failed."); }
    finally { setBusy(false); }
  };

  const roles = [...new Set(users.map((u) => normalize(u.role || u.category).toLowerCase()).filter(Boolean))];
  const active = users.filter((u) => normalize(u.status || "active").toLowerCase() === "active").length;

  return <div className="min-h-screen bg-[#080d1d] px-4 py-7 text-white md:px-8">
    <div className="mx-auto max-w-[1650px]">
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-yellow-400">User Management</p><h1 className="text-3xl font-black md:text-4xl">Staff / Users</h1><p className="mt-2 text-sm text-slate-400">Admin CRUD, profile photo, account status and complete staff directory.</p></div>
        <div className="flex gap-2"><button onClick={load} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-black"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Refresh</button><Link to="/add-staff" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-yellow-500 px-4 text-sm font-black text-black"><Plus size={17}/>Add User</Link></div>
      </div>

      {(error || toast) && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{error || toast}<button onClick={() => { setError(""); setToast(""); }} className="float-right"><X size={16}/></button></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat icon={<Users size={19}/>} value={users.length} label="Total Users"/><Stat icon={<CheckCircle2 size={19}/>} value={active} label="Active"/><Stat icon={<Ban size={19}/>} value={users.length-active} label="Inactive"/><Stat icon={<UserCog size={19}/>} value={filtered.length} label="Filtered"/></div>

      <div className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-[#11182c] p-4 lg:grid-cols-[1fr_190px_190px]"><label className="flex items-center gap-3 rounded-xl bg-[#1c2740] px-4"><Search size={18} className="text-slate-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search numeric ID, name, email, phone..." className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-500"/></label><select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl bg-[#1c2740] px-4 py-3 text-sm outline-none"><option value="all">All Roles</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl bg-[#1c2740] px-4 py-3 text-sm outline-none"><option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1528] shadow-2xl">
        {loading ? <div className="flex min-h-[360px] items-center justify-center"><Loader2 size={30} className="animate-spin text-yellow-500"/></div> : filtered.length === 0 ? <div className="flex min-h-[300px] items-center justify-center text-slate-500">No users found.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-[#151f35] text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">User ID</th><th className="px-5 py-4">User</th><th className="px-5 py-4">Contact</th><th className="px-5 py-4">Role / Status</th><th className="px-5 py-4">Address</th><th className="px-5 py-4">CRUD</th></tr></thead><tbody className="divide-y divide-white/5">{filtered.map((u, index) => { const numeric = Number(u.id); const shownId = Number.isInteger(numeric) && numeric > 0 ? numeric : index + 1; const s = normalize(u.status || "active").toLowerCase(); return <tr key={u.id || u.uid || index} className="hover:bg-white/[0.025]"><td className="px-5 py-5"><span className="rounded-lg bg-yellow-500/10 px-3 py-2 font-black text-yellow-400">#{shownId}</span></td><td className="px-5 py-5"><div className="flex items-center gap-3"><Avatar user={u}/><div><div className="font-bold">{u.name || "Unnamed User"}</div><div className="mt-1 text-xs text-slate-500">{u.email || "No email"}</div></div></div></td><td className="px-5 py-5"><div className="space-y-2 text-xs text-slate-300"><div className="flex items-center gap-2"><Mail size={14} className="text-slate-500"/>{u.email || "—"}</div><div className="flex items-center gap-2"><Phone size={14} className="text-slate-500"/>{u.phone || "—"}</div></div></td><td className="px-5 py-5"><div className="mb-2 inline-flex rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-300">{u.role || u.category || "staff"}</div><div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${s === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{u.status || "active"}</span></div></td><td className="px-5 py-5 text-xs text-slate-300"><div className="flex max-w-[260px] items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-slate-500"/><span>{u.address || "No address"}</span></div></td><td className="px-5 py-5"><div className="flex flex-wrap gap-2"><button onClick={() => navigate(`/user/${u.id}`)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-2 text-xs font-black text-blue-300"><Eye size={14}/>View</button><button onClick={() => openEdit(u)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-black"><Edit3 size={14}/>Edit</button><button onClick={() => toggleStatus(u)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-500/10 px-3 py-2 text-xs font-black text-yellow-300">{s === "active" ? <Ban size={14}/> : <CheckCircle2 size={14}/>} {s === "active" ? "Disable" : "Activate"}</button><button onClick={() => remove(u)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-black text-red-300"><Trash2 size={14}/>Delete</button></div></td></tr>; })}</tbody></table></div>}
      </div>
    </div>

    {editing && <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"><form onSubmit={save} className="mx-auto mt-6 max-w-3xl rounded-3xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl md:p-7"><div className="mb-6 flex items-center justify-between"><div className="flex items-center gap-4"><Avatar user={form} large/><div><h2 className="text-2xl font-black">Edit User</h2><p className="text-xs text-slate-500">Numeric ID: #{editing.id}</p></div></div><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-white/10 p-2"><X size={18}/></button></div><div className="grid gap-4 md:grid-cols-2"><Field label="Name" value={form.name} onChange={(v) => updateForm("name", v)}/><Field label="Email (read only)" value={form.email} onChange={() => {}} disabled/><Field label="Phone" value={form.phone} onChange={(v) => updateForm("phone", v)}/><Select label="Role" value={form.role} onChange={(v) => updateForm("role", v)} options={["electrician","cro","admin","superadmin"]}/><Select label="Status" value={form.status} onChange={(v) => updateForm("status", v)} options={["active","inactive","on_leave"]}/><Select label="Marital status" value={form.maritalStatus} onChange={(v) => updateForm("maritalStatus", v)} options={["Single","Married","Engaged","Divorced","Widowed","Prefer not to say"]}/><Field label="Address" value={form.address} onChange={(v) => updateForm("address", v)}/><Field label="Background / Bio" value={form.backgroundInfo} onChange={(v) => updateForm("backgroundInfo", v)}/><label className="md:col-span-2 block text-sm font-bold text-slate-300">Profile photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="mt-2 block w-full rounded-xl border border-white/10 bg-white/5 p-3 text-xs"/></label></div><div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-5"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-black">Cancel</button><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-5 py-2.5 text-sm font-black text-black disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}Save User</button></div></form></div>}
  </div>;
}

function Field({ label, value, onChange, disabled = false }) { return <label className="block text-sm font-bold text-slate-300">{label}<input value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none focus:border-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"/></label>; }
function Select({ label, value, onChange, options }) { return <label className="block text-sm font-bold text-slate-300">{label}<select value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none focus:border-yellow-500">{options.map((item) => <option key={item}>{item}</option>)}</select></label>; }
function Stat({ icon, value, label }) { return <div className="rounded-2xl border border-white/10 bg-[#10182c] p-5"><div className="mb-4 inline-flex rounded-xl bg-yellow-500/10 p-3 text-yellow-400">{icon}</div><div className="text-3xl font-black">{value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div></div>; }
