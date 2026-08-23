import React, { useEffect, useMemo, useState } from "react";
import { getUser, setToken } from "./utils/auth";
import API from "./api";
import {
  User,
  Lock,
  Save,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Camera,
  Loader2,
} from "lucide-react";

const getProfileValue = (user) => {
  const raw = user?.profile_pic || user?.profilePic || user?.photoURL || user?.photo || "";
  if (!raw) return "";
  if (typeof raw === "object") return raw.url || raw.downloadURL || raw.path || "";
  return String(raw).trim();
};

const getProfileUrl = (user) => {
  const raw = getProfileValue(user);
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const origin = String(import.meta.env.VITE_API_ORIGIN || import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "").replace(/\/+$/, "");
  const base = origin || "http://localhost:5000";
  const clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return clean.toLowerCase().startsWith("uploads/") ? `${base}/${clean}` : `${base}/uploads/${clean}`;
};

const initials = (name = "User") => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts.length === 1 ? parts[0][0].toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export default function Profile() {
  const currentUser = getUser();
  const [formData, setFormData] = useState({
    name: currentUser?.name || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profileUser, setProfileUser] = useState(currentUser || {});
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPasswords, setShowPasswords] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });

  const isPasswordChangeRequested = useMemo(
    () => Boolean(formData.currentPassword || formData.newPassword || formData.confirmPassword),
    [formData.currentPassword, formData.newPassword, formData.confirmPassword]
  );

  const profileUrl = preview || getProfileUrl(profileUser);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
    setMessage({ type: "", text: "" });
  };

  const handleImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please select a valid image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "Profile photo must be smaller than 5 MB." });
      return;
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setMessage({ type: "", text: "" });
  };

  const validate = () => {
    if (!formData.name.trim() || formData.name.trim().length < 2) return "Name must contain at least 2 characters.";
    if (!isPasswordChangeRequested) return "";
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) return "Please complete all password fields.";
    if (formData.newPassword.length < 6) return "New password must be at least 6 characters long.";
    if (formData.newPassword !== formData.confirmPassword) return "New password and confirm password do not match.";
    if (formData.currentPassword === formData.newPassword) return "New password must be different from your current password.";
    return "";
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!currentUser?.id) {
      setMessage({ type: "error", text: "Unable to identify the logged-in user. Please log in again." });
      return;
    }

    const validationError = validate();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const profilePayload = new FormData();
      profilePayload.append("name", formData.name.trim());
      if (imageFile) profilePayload.append("profile_pic", imageFile, imageFile.name);

      const profileResponse = await API.put(`/user/${currentUser.id}`, profilePayload, { timeout: 120000 });
      const returnedUser = profileResponse?.data?.user || profileResponse?.user || {};

      let passwordResponse = null;
      if (isPasswordChangeRequested) {
        passwordResponse = await API.put(`/user/update-profile/${currentUser.id}`, {
          name: formData.name.trim(),
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
          confirmPassword: formData.confirmPassword,
        });
      }

      const updatedUser = {
        ...currentUser,
        ...returnedUser,
        name: returnedUser.name || formData.name.trim(),
        profile_pic: returnedUser.profile_pic || returnedUser.profilePic || currentUser.profile_pic || currentUser.profilePic || "",
        profilePic: returnedUser.profilePic || returnedUser.profile_pic || currentUser.profilePic || currentUser.profile_pic || "",
        photoURL: returnedUser.photoURL || currentUser.photoURL || "",
      };

      setProfileUser(updatedUser);
      setToken(JSON.stringify(updatedUser));
      setImageFile(null);
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview("");
      setFormData((previous) => ({ ...previous, name: updatedUser.name, currentPassword: "", newPassword: "", confirmPassword: "" }));
      setShowPasswords({ currentPassword: false, newPassword: false, confirmPassword: false });
      setMessage({ type: "success", text: passwordResponse?.data?.message || profileResponse?.data?.message || "Profile updated successfully!" });
    } catch (error) {
      console.error("PROFILE UPDATE ERROR:", error);
      setMessage({
        type: "error",
        text: error?.response?.data?.message || error?.response?.data?.error || error?.message || "Profile update failed. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-700 max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-yellow-500 rounded-2xl shadow-lg shadow-yellow-500/20"><ShieldCheck className="text-slate-900" size={28} /></div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Profile Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Update your profile information, profile photo and account password.</p>
        </div>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-6 md:p-10 rounded-[2.5rem] shadow-2xl">
        <form onSubmit={handleUpdate} className="space-y-8">
          {message.text && (
            <div className={`flex items-start gap-3 px-5 py-4 rounded-2xl border ${message.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
              {message.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <p className="text-sm font-semibold">{message.text}</p>
            </div>
          )}

          <section className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {profileUrl ? (
                  <img src={profileUrl} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-yellow-500 bg-slate-800" onError={() => setProfileUser((previous) => ({ ...previous, profile_pic: "", profilePic: "", photoURL: "" }))} />
                ) : (
                  <div className="w-24 h-24 rounded-full border-4 border-yellow-500 bg-slate-800 flex items-center justify-center text-yellow-400 text-2xl font-black">{initials(formData.name)}</div>
                )}
                <label htmlFor="profile-photo" className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-yellow-500 text-black flex items-center justify-center cursor-pointer shadow-lg"><Camera size={17} /><input id="profile-photo" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={(event) => handleImage(event.target.files?.[0])} disabled={loading} /></label>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Profile Information</h2>
                <p className="text-slate-500 text-xs mt-1">Your Google/Gmail photo is used automatically when available. You can replace it with your own photo.</p>
              </div>
            </div>

            <label className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500 ml-2">Name</label>
            <div className="relative">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input name="name" type="text" value={formData.name} onChange={handleChange} disabled={loading} required className="w-full pl-14 pr-6 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white outline-none focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/20" />
            </div>
          </section>

          <div className="h-px bg-white/5" />

          <section className="space-y-5">
            <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center"><KeyRound size={18} className="text-yellow-500" /></div><div><h2 className="text-white font-bold">Change Password</h2><p className="text-slate-500 text-xs mt-1">Leave these fields blank if you do not want to change your password.</p></div></div>
            {["currentPassword", "newPassword", "confirmPassword"].map((field) => {
              const labels = { currentPassword: "Current Password", newPassword: "New Password", confirmPassword: "Confirm New Password" };
              return (
                <div key={field} className="relative">
                  <label className="block text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500 ml-2 mb-2">{labels[field]}</label>
                  <Lock className="absolute left-5 top-[58%] -translate-y-1/2 text-slate-500" size={18} />
                  <input name={field} type={showPasswords[field] ? "text" : "password"} value={formData[field]} onChange={handleChange} disabled={loading} className="w-full pl-14 pr-14 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white outline-none focus:border-yellow-500/50" />
                  <button type="button" onClick={() => setShowPasswords((previous) => ({ ...previous, [field]: !previous[field] }))} className="absolute right-5 top-[58%] -translate-y-1/2 text-slate-500 hover:text-yellow-500">{showPasswords[field] ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              );
            })}
          </section>

          <button type="submit" disabled={loading} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-4 rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {loading ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
