import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged, sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import { Camera, CheckCircle2, GraduationCap, KeyRound, Loader2, LogOut, Mail, MapPin, Save, ShieldCheck, Sparkles, User, X } from "lucide-react";
import { auth, db, storage } from "./firebase";
import { getUser, setToken } from "./utils/auth";

const EMPTY = { username: "", phone: "", gender: "", dateOfBirth: "", maritalStatus: "", city: "", country: "Pakistan", address: "", education: "", currentStudy: "", institution: "", profession: "", occupation: "", bio: "", website: "", skills: [], languages: [], interests: [], socialLinks: { facebook: "", linkedin: "", instagram: "", youtube: "" } };
const splitTags = (value) => String(value || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30);
const joinTags = (value) => Array.isArray(value) ? value.join(", ") : "";
const ageOf = (dob) => { if (!dob) return ""; const d = new Date(dob); if (Number.isNaN(d.getTime())) return ""; const now = new Date(); let age = now.getFullYear() - d.getFullYear(); const m = now.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--; return age >= 0 && age <= 120 ? age : ""; };
const initials = (name) => String(name || "User").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "U";

function Field({ label, value, onChange, type = "text", placeholder = "" }) { return <label className="block text-sm font-bold text-slate-700"><span>{label}</span><input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"/></label>; }
function SelectField({ label, value, onChange, options }) { return <label className="block text-sm font-bold text-slate-700"><span>{label}</span><select value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"><option value="">Select...</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function Section({ icon: Icon, title, description, children }) { return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon size={19}/></span><div><h2 className="text-lg font-black text-slate-950">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div></div><div className="mt-6">{children}</div></section>; }

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
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
      setUser(current);
      setName(current.displayName || stored.name || current.email?.split("@")[0] || "User");
      setPhoto(current.photoURL || stored.profile_pic || stored.profilePic || "");
      try {
        const snap = await getDoc(doc(db, "powerhouse_users", current.uid));
        if (snap.exists()) {
          const data = snap.data() || {};
          setForm({ ...EMPTY, ...data, socialLinks: { ...EMPTY.socialLinks, ...(data.socialLinks || {}) } });
          if (!current.photoURL && data.photoURL) setPhoto(data.photoURL);
        }
      } catch (e) { console.error(e); setError("Could not load the saved profile. You can still complete it."); }
      setLoading(false);
    });
    return unsub;
  }, [navigate]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const age = ageOf(form.dateOfBirth);
  const completion = useMemo(() => { const fields = [name, photo, form.gender, form.dateOfBirth, form.maritalStatus, form.city, form.country, form.education, form.currentStudy, form.institution, form.profession, form.bio]; return Math.round(fields.filter(Boolean).length / fields.length * 100); }, [form, name, photo]);

  const uploadPhoto = async (file) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Profile image must be 5 MB or smaller."); return; }
    try {
      setUploading(true); setError("");
      const storageRef = ref(storage, `profilePictures/${user.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      setPhoto(await getDownloadURL(storageRef));
    } catch (e) { console.error(e); setError("Unable to upload the profile picture. Please try again."); }
    finally { setUploading(false); }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!user) return;
    const cleanName = name.trim();
    if (cleanName.length < 2) { setError("Please enter your full name."); return; }
    try {
      setSaving(true); setMessage(""); setError("");
      await updateProfile(user, { displayName: cleanName, photoURL: photo.trim() || null });
      const clean = { ...form, username: String(form.username || "").trim().slice(0, 60), phone: String(form.phone || "").trim().slice(0, 40), bio: String(form.bio || "").trim().slice(0, 1200), address: String(form.address || "").trim().slice(0, 240), website: String(form.website || "").trim().slice(0, 240), skills: Array.isArray(form.skills) ? form.skills.slice(0, 30) : splitTags(form.skills), languages: Array.isArray(form.languages) ? form.languages.slice(0, 20) : splitTags(form.languages), interests: Array.isArray(form.interests) ? form.interests.slice(0, 30) : splitTags(form.interests), socialLinks: form.socialLinks || {}, displayName: cleanName, email: user.email || "", photoUrl: photo || "", photoURL: photo || "", profile_pic: photo || "", profilePic: photo || "", emailVerified: user.emailVerified, uid: user.uid, firebaseUid: user.uid, updatedAt: serverTimestamp() };
      const existing = await getDoc(doc(db, "powerhouse_users", user.uid));
      if (!existing.exists()) clean.createdAt = serverTimestamp();
      await setDoc(doc(db, "powerhouse_users", user.uid), clean, { merge: true });
      const stored = getUser() || {};
      setToken({ ...stored, name: cleanName, profile_pic: photo || "", profilePic: photo || "", photoURL: photo || "", email: user.email || stored.email, uid: user.uid, firebaseUid: user.uid });
      setForm((current) => ({ ...current, ...clean }));
      setMessage("Professional profile saved successfully.");
    } catch (e) { console.error(e); setError(e?.message || "Unable to save your profile right now."); }
    finally { setSaving(false); }
  };

  const resetPassword = async () => { if (!user?.email) return; try { await sendPasswordResetEmail(auth, user.email); setMessage("Password reset email sent."); } catch { setError("Unable to send the password reset email."); } };
  const logout = async () => { try { await signOut(auth); localStorage.removeItem("user"); navigate("/login", { replace: true }); } catch { setError("Unable to sign out right now."); } };

  if (loading) return <main className="flex min-h-[calc(100vh-76px)] items-center justify-center bg-slate-50"><div className="text-center"><Loader2 className="mx-auto animate-spin text-blue-600" size={34}/><p className="mt-3 text-sm font-bold text-slate-500">Loading your profile...</p></div></main>;
  if (!user) return null;

  return <main className="min-h-[calc(100vh-76px)] bg-slate-50 px-4 py-7 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-blue-700"><Sparkles size={13}/>Professional profile</span><h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">My Profile & Bio</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Complete your information so PowerHouse can show the same profile throughout the system.</p></div><div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Profile completion</p><p className="mt-1 text-xl font-black text-blue-700">{completion}%</p></div></div>
    {message && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 size={18}/>{message}<button onClick={() => setMessage("")} className="ml-auto"><X size={16}/></button></div>}
    {error && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><X size={18}/>{error}<button onClick={() => setError("")} className="ml-auto"><X size={16}/></button></div>}
    <form onSubmit={save} className="space-y-5"><section className="relative overflow-hidden rounded-[30px] bg-slate-950 p-6 text-white shadow-xl sm:p-8"><div className="relative flex flex-col gap-6 sm:flex-row sm:items-center"><div className="relative shrink-0"><div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] border-4 border-white/15 bg-blue-600 text-3xl font-black">{photo ? <img src={photo} alt="Profile" className="h-full w-full object-cover"/> : initials(name)}</div><label className="absolute -bottom-2 -right-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-4 border-slate-950 bg-white text-blue-700 shadow-lg"><Camera size={17}/><input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files?.[0])}/></label></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">Learner / Staff identity</p><h2 className="mt-1 text-2xl font-black">{name || "User"}</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-300"><Mail size={15}/>{user.email}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">{user.emailVerified ? "Email verified" : "Email not verified"}</span>{age && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{age} years</span>}{uploading && <span className="rounded-full bg-blue-400/15 px-3 py-1 text-xs font-bold text-blue-200">Uploading photo...</span>}</div></div></div></section>
      <Section icon={User} title="Basic Information" description="Name, identity, contact and personal details."><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Full name" value={name} onChange={setName}/><Field label="Username" value={form.username} onChange={(v) => update("username", v)} placeholder="your username"/><Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} placeholder="03xx-xxxxxxx"/><SelectField label="Gender" value={form.gender} onChange={(v) => update("gender", v)} options={["Male","Female","Other","Prefer not to say"]}/><Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(v) => update("dateOfBirth", v)}/><SelectField label="Marital status" value={form.maritalStatus} onChange={(v) => update("maritalStatus", v)} options={["Single","Married","Engaged","Divorced","Widowed","Prefer not to say"]}/></div></Section>
      <Section icon={MapPin} title="Location" description="Where you currently live or work."><div className="grid gap-4 md:grid-cols-2"><Field label="City" value={form.city} onChange={(v) => update("city", v)} placeholder="Lahore"/><Field label="Country" value={form.country} onChange={(v) => update("country", v)} placeholder="Pakistan"/><div className="md:col-span-2"><Field label="Address" value={form.address} onChange={(v) => update("address", v)} placeholder="Optional address"/></div></div></Section>
      <Section icon={GraduationCap} title="Education & Work" description="Academic background and professional information."><div className="grid gap-4 md:grid-cols-2"><Field label="Highest education" value={form.education} onChange={(v) => update("education", v)} placeholder="DAE, Bachelor's, Master's..."/><Field label="Current study" value={form.currentStudy} onChange={(v) => update("currentStudy", v)} placeholder="Current degree / course"/><Field label="Institution / University" value={form.institution} onChange={(v) => update("institution", v)}/><Field label="Profession" value={form.profession} onChange={(v) => update("profession", v)}/><Field label="Occupation" value={form.occupation} onChange={(v) => update("occupation", v)}/></div></Section>
      <Section icon={Sparkles} title="About Me" description="Skills, languages, interests and a short professional bio."><label className="block text-sm font-bold text-slate-700">Bio<textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} maxLength={1200} rows={5} className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"/></label><div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Skills" value={joinTags(form.skills)} onChange={(v) => update("skills", splitTags(v))} placeholder="Electrical, Maintenance"/><Field label="Languages" value={joinTags(form.languages)} onChange={(v) => update("languages", splitTags(v))} placeholder="Urdu, English"/><Field label="Interests" value={joinTags(form.interests)} onChange={(v) => update("interests", splitTags(v))} placeholder="Technology, Reading"/></div></Section>
      <Section icon={Sparkles} title="Online Presence" description="Optional professional links."><div className="grid gap-4 md:grid-cols-2"><Field label="Website" value={form.website} onChange={(v) => update("website", v)}/>{["facebook","linkedin","instagram","youtube"].map((key) => <Field key={key} label={key[0].toUpperCase()+key.slice(1)} value={form.socialLinks?.[key] || ""} onChange={(v) => update("socialLinks", { ...(form.socialLinks || {}), [key]: v })}/>)}</div></Section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black text-slate-950">Account & Security</h2><p className="mt-1 text-xs text-slate-500">Your login remains protected by Firebase Authentication.</p></div><ShieldCheck className="text-emerald-600"/></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={resetPassword} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700"><KeyRound size={17}/>Reset password</button><button type="button" onClick={logout} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-600"><LogOut size={17}/>Sign out</button></div></section>
      <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p className="hidden text-xs font-semibold text-slate-500 sm:block">Your profile photo and profile information are reused across PowerHouse.</p><button type="submit" disabled={saving || uploading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-black text-white shadow-lg disabled:opacity-60"><Save size={18}/>{saving ? "Saving profile..." : "Save Complete Profile"}</button></div>
    </form></div></main>;
}
