import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged, sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import { Camera, CheckCircle2, Loader2, LogOut, Mail, MapPin, Save, ShieldCheck, User, X } from "lucide-react";
import { auth, db, storage } from "./firebase";
import { getUser, setToken } from "./utils/auth";
import API from "./api";

const EMPTY = { phone: "", gender: "", dateOfBirth: "", maritalStatus: "", city: "", country: "Pakistan", address: "", education: "", profession: "", occupation: "", bio: "" };
const ageOf = (dob) => { if (!dob) return ""; const d = new Date(dob); if (Number.isNaN(d.getTime())) return ""; const now = new Date(); let age = now.getFullYear() - d.getFullYear(); if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--; return age >= 0 && age <= 120 ? age : ""; };
const initials = (name) => String(name || "User").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "U";

function Field({ label, value, onChange, type = "text", placeholder = "" }) { return <label className="block text-sm font-bold text-slate-700"><span>{label}</span><input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"/></label>; }
function SelectField({ label, value, onChange, options }) { return <label className="block text-sm font-bold text-slate-700"><span>{label}</span><select value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500"><option value="">Select...</option>{options.map((x) => <option key={x}>{x}</option>)}</select></label>; }
function Section({ title, children }) { return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h2 className="text-lg font-black text-slate-950">{title}</h2><div className="mt-5">{children}</div></section>; }

export default function ProfileStable() {
  const navigate = useNavigate();
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [backendUser, setBackendUser] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (current) => {
      if (!current) { navigate("/login", { replace: true }); return; }
      const stored = getUser() || {};
      setFirebaseUser(current);
      setName(current.displayName || stored.name || current.email?.split("@")[0] || "User");
      setPhoto(current.photoURL || stored.profile_pic || stored.profilePic || "");
      try {
        const localSnap = await getDoc(doc(db, "powerhouse_users", current.uid));
        const local = localSnap.exists() ? localSnap.data() || {} : {};
        let canonical = null;
        try {
          if (stored.id) canonical = (await API.get(`/user/full/${stored.id}`, { timeout: 10000 })).data?.user || null;
          if (!canonical) {
            const all = await API.get("/user/all", { timeout: 10000 });
            const rows = Array.isArray(all.data) ? all.data : all.data?.users || [];
            canonical = rows.find((x) => String(x.email || "").toLowerCase() === String(current.email || "").toLowerCase()) || null;
          }
        } catch (backendError) { console.warn("PROFILE CANONICAL READ:", backendError.message); }
        setBackendUser(canonical);
        setForm({ ...EMPTY, ...local, phone: canonical?.phone ?? local.phone ?? "", maritalStatus: canonical?.maritalStatus ?? local.maritalStatus ?? "", address: canonical?.address ?? local.address ?? "" });
        if (canonical?.name) setName(canonical.name);
        if (canonical?.profile_pic) setPhoto(canonical.profile_pic);
      } catch (e) { console.error(e); setError("Could not load the saved profile. Please try again."); }
      finally { setLoading(false); }
    });
    return unsub;
  }, [navigate]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const age = ageOf(form.dateOfBirth);
  const completion = useMemo(() => { const fields = [name, photo, form.phone, form.gender, form.dateOfBirth, form.maritalStatus, form.city, form.country, form.education, form.profession, form.bio]; return Math.round(fields.filter(Boolean).length / fields.length * 100); }, [form, name, photo]);

  const uploadPhoto = async (file) => {
    if (!file || !firebaseUser) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Profile image must be 5 MB or smaller."); return; }
    try {
      setUploading(true); setError("");
      const storageRef = ref(storage, `profilePictures/${firebaseUser.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      setPhoto(await getDownloadURL(storageRef));
    } catch (e) { console.error(e); setError("Unable to upload the profile picture. Please try again."); }
    finally { setUploading(false); }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!firebaseUser) return;
    const cleanName = name.trim();
    if (cleanName.length < 2) { setError("Please enter your full name."); return; }
    try {
      setSaving(true); setMessage(""); setError("");
      await updateProfile(firebaseUser, { displayName: cleanName, photoURL: photo.trim() || null });
      const clean = { ...form, phone: String(form.phone || "").trim().slice(0, 40), address: String(form.address || "").trim().slice(0, 240), bio: String(form.bio || "").trim().slice(0, 1200), displayName: cleanName, email: firebaseUser.email || "", photoUrl: photo || "", photoURL: photo || "", profile_pic: photo || "", profilePic: photo || "", emailVerified: firebaseUser.emailVerified, uid: firebaseUser.uid, firebaseUid: firebaseUser.uid, updatedAt: serverTimestamp() };
      const existing = await getDoc(doc(db, "powerhouse_users", firebaseUser.uid));
      if (!existing.exists()) clean.createdAt = serverTimestamp();
      await setDoc(doc(db, "powerhouse_users", firebaseUser.uid), clean, { merge: true });

      let canonical = backendUser;
      if (!canonical) {
        try {
          const all = await API.get("/user/all", { timeout: 10000 });
          const rows = Array.isArray(all.data) ? all.data : all.data?.users || [];
          canonical = rows.find((x) => String(x.email || "").toLowerCase() === String(firebaseUser.email || "").toLowerCase()) || null;
        } catch {}
      }
      if (canonical?.id) {
        try {
          const response = await API.put(`/user/${canonical.id}`, { name: cleanName, phone: clean.phone, maritalStatus: clean.maritalStatus || "", address: clean.address || "", backgroundInfo: clean.bio || "", role: canonical.role || "electrician", status: canonical.status || "active" }, { timeout: 15000 });
          if (response.data?.user) setBackendUser(response.data.user);
        } catch (backendError) { console.warn("PROFILE CANONICAL SAVE:", backendError.message); }
      }
      const stored = getUser() || {};
      setToken({ ...stored, id: canonical?.id || stored.id, name: cleanName, profile_pic: photo || "", profilePic: photo || "", photoURL: photo || "", email: firebaseUser.email || stored.email, uid: firebaseUser.uid, firebaseUid: firebaseUser.uid });
      setForm((current) => ({ ...current, ...clean }));
      setMessage("Profile saved successfully and synced with the PowerHouse account.");
    } catch (e) { console.error(e); setError(e?.message || "Unable to save your profile right now."); }
    finally { setSaving(false); }
  };

  const resetPassword = async () => { if (!firebaseUser?.email) return; try { await sendPasswordResetEmail(auth, firebaseUser.email); setMessage("Password reset email sent."); } catch { setError("Unable to send the password reset email."); } };
  const logout = async () => { try { await signOut(auth); localStorage.removeItem("user"); navigate("/login", { replace: true }); } catch { setError("Unable to sign out right now."); } };

  if (loading) return <main className="flex min-h-[calc(100vh-76px)] items-center justify-center bg-slate-50"><div className="text-center"><Loader2 className="mx-auto animate-spin text-blue-600" size={34}/><p className="mt-3 text-sm font-bold text-slate-500">Loading your profile...</p></div></main>;
  if (!firebaseUser) return null;

  return <main className="min-h-[calc(100vh-76px)] bg-slate-50 px-4 py-7 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-blue-700"><ShieldCheck size={13}/>PowerHouse profile</span><h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">My Profile</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Your profile is synchronized with your PowerHouse account.</p></div><div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Profile completion</p><p className="mt-1 text-xl font-black text-blue-700">{completion}%</p></div></div>
    {message && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 size={18}/>{message}<button onClick={() => setMessage("")} className="ml-auto"><X size={16}/></button></div>}
    {error && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><X size={18}/>{error}<button onClick={() => setError("")} className="ml-auto"><X size={16}/></button></div>}
    <form onSubmit={save} className="space-y-5"><section className="relative overflow-hidden rounded-[30px] bg-slate-950 p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col gap-6 sm:flex-row sm:items-center"><div className="relative shrink-0"><div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] border-4 border-white/15 bg-blue-600 text-3xl font-black">{photo ? <img src={photo} alt="Profile" className="h-full w-full object-cover"/> : initials(name)}</div><label className="absolute -bottom-2 -right-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-4 border-slate-950 bg-white text-blue-700 shadow-lg"><Camera size={17}/><input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files?.[0])}/></label></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">Staff identity</p><h2 className="mt-1 text-2xl font-black">{name || "User"}</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-300"><Mail size={15}/>{firebaseUser.email}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">{firebaseUser.emailVerified ? "Email verified" : "Email not verified"}</span>{age && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{age} years</span>}{backendUser?.employeeID && <span className="rounded-full bg-yellow-400/15 px-3 py-1 text-xs font-bold text-yellow-200">{backendUser.employeeID}</span>}{uploading && <span className="rounded-full bg-blue-400/15 px-3 py-1 text-xs font-bold text-blue-200">Uploading...</span>}</div></div></div></section>
      <Section title="Basic Information"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Full name" value={name} onChange={setName}/><Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} placeholder="03xx-xxxxxxx"/><SelectField label="Gender" value={form.gender} onChange={(v) => update("gender", v)} options={["Male","Female","Other","Prefer not to say"]}/><Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(v) => update("dateOfBirth", v)}/><SelectField label="Marital status" value={form.maritalStatus} onChange={(v) => update("maritalStatus", v)} options={["Single","Married","Engaged","Divorced","Widowed","Prefer not to say"]}/></div></Section>
      <Section title="Location"><div className="grid gap-4 md:grid-cols-2"><Field label="City" value={form.city} onChange={(v) => update("city", v)} placeholder="Lahore"/><Field label="Country" value={form.country} onChange={(v) => update("country", v)} placeholder="Pakistan"/><div className="md:col-span-2"><Field label="Address" value={form.address} onChange={(v) => update("address", v)} placeholder="Optional address"/></div></div></Section>
      <Section title="Education & Work"><div className="grid gap-4 md:grid-cols-2"><Field label="Highest education" value={form.education} onChange={(v) => update("education", v)} placeholder="DAE, Bachelor's, Master's..."/><Field label="Profession" value={form.profession} onChange={(v) => update("profession", v)}/><Field label="Occupation" value={form.occupation} onChange={(v) => update("occupation", v)}/></div></Section>
      <Section title="About Me"><label className="block text-sm font-bold text-slate-700">Professional bio<textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} maxLength={1200} rows={5} className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"/></label></Section>
      <div className="flex flex-wrap justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex gap-2"><button type="button" onClick={resetPassword} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Reset Password</button><button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-xl border border-red-100 px-4 py-2.5 text-sm font-black text-red-600"><LogOut size={16}/>Sign out</button></div><button disabled={saving || uploading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-black text-white disabled:opacity-60">{saving ? <Loader2 size={17} className="animate-spin"/> : <Save size={17}/>}Save Profile</button></div>
    </form>
  </div></main>;
}
