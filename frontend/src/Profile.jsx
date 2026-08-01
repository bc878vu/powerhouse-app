import React, { useState } from "react";
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
  Loader2,
} from "lucide-react";

export default function Profile() {
  // ============================================================
  // CURRENT LOGGED-IN USER
  // ============================================================

  const currentUser = getUser();

  // ============================================================
  // FORM STATE
  // ============================================================

  const [formData, setFormData] = useState({
    name: currentUser?.name || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // ============================================================
  // PASSWORD VISIBILITY STATE
  // ============================================================

  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  // ============================================================
  // UI STATE
  // ============================================================

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState({
    type: "",
    text: "",
  });

  // ============================================================
  // HANDLE INPUT CHANGE
  // ============================================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));

    if (message.text) {
      setMessage({
        type: "",
        text: "",
      });
    }
  };

  // ============================================================
  // TOGGLE PASSWORD VISIBILITY
  // ============================================================

  const togglePasswordVisibility = (fieldName) => {
    setShowPasswords((previousState) => ({
      ...previousState,
      [fieldName]: !previousState[fieldName],
    }));
  };

  // ============================================================
  // PASSWORD CHANGE REQUEST CHECK
  // ============================================================

  const isPasswordChangeRequested =
    formData.currentPassword.trim() !== "" ||
    formData.newPassword.trim() !== "" ||
    formData.confirmPassword.trim() !== "";

  // ============================================================
  // CONFIRM PASSWORD BORDER CLASS
  // This avoids the previous JSX nested-template syntax error.
  // ============================================================

  let confirmPasswordBorderClass = "border-slate-700";

  if (formData.confirmPassword) {
    if (formData.newPassword === formData.confirmPassword) {
      confirmPasswordBorderClass = "border-green-500/60";
    } else {
      confirmPasswordBorderClass = "border-red-500/60";
    }
  }

  // ============================================================
  // VALIDATE FORM
  // ============================================================

  const validateForm = () => {
    const cleanName = formData.name.trim();

    if (!cleanName) {
      return "Name is required.";
    }

    if (cleanName.length < 2) {
      return "Name must contain at least 2 characters.";
    }

    // If all password fields are empty, only update the name.
    if (!isPasswordChangeRequested) {
      return "";
    }

    if (!formData.currentPassword) {
      return "Please enter your current password.";
    }

    if (!formData.newPassword) {
      return "Please enter your new password.";
    }

    if (!formData.confirmPassword) {
      return "Please confirm your new password.";
    }

    if (formData.newPassword.length < 6) {
      return "New password must be at least 6 characters long.";
    }

    if (formData.currentPassword === formData.newPassword) {
      return "New password must be different from your current password.";
    }

    if (formData.newPassword !== formData.confirmPassword) {
      return "New password and confirm password do not match.";
    }

    return "";
  };

  // ============================================================
  // HANDLE PROFILE UPDATE
  // ============================================================

  const handleUpdate = async (e) => {
    e.preventDefault();

    if (!currentUser?.id) {
      setMessage({
        type: "error",
        text: "Unable to identify the logged-in user. Please log in again.",
      });

      return;
    }

    const validationError = validateForm();

    if (validationError) {
      setMessage({
        type: "error",
        text: validationError,
      });

      return;
    }

    try {
      setLoading(true);

      setMessage({
        type: "",
        text: "",
      });

      // ========================================================
      // CREATE REQUEST BODY
      // ========================================================

      const requestData = {
        name: formData.name.trim(),
      };

      // Only send password fields when user wants
      // to change the password.
      if (isPasswordChangeRequested) {
        requestData.currentPassword = formData.currentPassword;
        requestData.newPassword = formData.newPassword;
        requestData.confirmPassword = formData.confirmPassword;
      }

      // ========================================================
      // SEND REQUEST TO BACKEND
      // ========================================================

      const response = await API.put(
        `/user/update-profile/${currentUser.id}`,
        requestData
      );

      // ========================================================
      // UPDATE LOCAL USER INFORMATION
      // ========================================================

      const updatedUser = {
        ...currentUser,
        name:
          response.data?.user?.name ||
          formData.name.trim(),
      };

      setToken(JSON.stringify(updatedUser));

      // ========================================================
      // CLEAR PASSWORD FIELDS AFTER SUCCESS
      // ========================================================

      setFormData({
        name: updatedUser.name,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setShowPasswords({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });

      setMessage({
        type: "success",
        text:
          response.data?.message ||
          response.data?.msg ||
          (isPasswordChangeRequested
            ? "Profile and password updated successfully!"
            : "Profile updated successfully!"),
      });
    } catch (err) {
      console.error("PROFILE UPDATE ERROR:", err);

      const backendMessage =
        err.response?.data?.message ||
        err.response?.data?.msg ||
        err.response?.data?.error ||
        "Profile update failed. Please try again.";

      setMessage({
        type: "error",
        text: backendMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="animate-in fade-in duration-700 max-w-3xl mx-auto">
      {/* ======================================================
          PAGE HEADING
          ====================================================== */}

      <div className="flex items-center gap-4 mb-10">
        <div className="p-3 bg-yellow-500 rounded-2xl shadow-lg shadow-yellow-500/20">
          <ShieldCheck
            className="text-slate-900"
            size={28}
          />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Profile Settings
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Update your profile information and account password.
          </p>
        </div>
      </div>

      {/* ======================================================
          MAIN CARD
          ====================================================== */}

      <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-8 md:p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        {/* Decorative background */}

        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-yellow-500/[0.03] pointer-events-none" />

        <form
          onSubmit={handleUpdate}
          className="space-y-8 relative z-10"
        >
          {/* ==================================================
              MESSAGE
              ================================================== */}

          {message.text && (
            <div
              className={`flex items-start gap-3 px-5 py-4 rounded-2xl border ${
                message.type === "success"
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2
                  size={20}
                  className="shrink-0 mt-0.5"
                />
              ) : (
                <AlertCircle
                  size={20}
                  className="shrink-0 mt-0.5"
                />
              )}

              <p className="text-sm font-semibold leading-relaxed">
                {message.text}
              </p>
            </div>
          )}

          {/* ==================================================
              PROFILE INFORMATION
              ================================================== */}

          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <User
                  size={18}
                  className="text-yellow-500"
                />
              </div>

              <div>
                <h2 className="text-white font-bold text-base">
                  Profile Information
                </h2>

                <p className="text-slate-500 text-xs mt-0.5">
                  Change your display name.
                </p>
              </div>
            </div>

            {/* NAME */}

            <div className="space-y-2">
              <label
                htmlFor="profile-name"
                className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500 ml-2"
              >
                Name
              </label>

              <div className="relative group">
                <User
                  className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors pointer-events-none"
                  size={20}
                />

                <input
                  id="profile-name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={loading}
                  required
                  autoComplete="name"
                  placeholder="Enter your name"
                  className="w-full pl-14 pr-6 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/20 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* DIVIDER */}

          <div className="h-px bg-white/5" />

          {/* ==================================================
              CHANGE PASSWORD
              ================================================== */}

          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <KeyRound
                  size={18}
                  className="text-yellow-500"
                />
              </div>

              <div>
                <h2 className="text-white font-bold text-base">
                  Change Password
                </h2>

                <p className="text-slate-500 text-xs mt-0.5">
                  Leave all three password fields blank if you do not want to
                  change your password.
                </p>
              </div>
            </div>

            {/* CURRENT PASSWORD */}

            <div className="space-y-2">
              <label
                htmlFor="current-password"
                className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500 ml-2"
              >
                Current Password
              </label>

              <div className="relative group">
                <Lock
                  className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors pointer-events-none"
                  size={20}
                />

                <input
                  id="current-password"
                  name="currentPassword"
                  type={
                    showPasswords.currentPassword
                      ? "text"
                      : "password"
                  }
                  value={formData.currentPassword}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="current-password"
                  placeholder="Enter current password"
                  className="w-full pl-14 pr-14 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/20 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                />

                <button
                  type="button"
                  onClick={() =>
                    togglePasswordVisibility("currentPassword")
                  }
                  disabled={loading}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-yellow-500 transition-colors disabled:cursor-not-allowed"
                  aria-label={
                    showPasswords.currentPassword
                      ? "Hide current password"
                      : "Show current password"
                  }
                >
                  {showPasswords.currentPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {/* NEW PASSWORD */}

            <div className="space-y-2">
              <label
                htmlFor="new-password"
                className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500 ml-2"
              >
                New Password
              </label>

              <div className="relative group">
                <KeyRound
                  className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors pointer-events-none"
                  size={20}
                />

                <input
                  id="new-password"
                  name="newPassword"
                  type={
                    showPasswords.newPassword
                      ? "text"
                      : "password"
                  }
                  value={formData.newPassword}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  className="w-full pl-14 pr-14 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/20 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                />

                <button
                  type="button"
                  onClick={() =>
                    togglePasswordVisibility("newPassword")
                  }
                  disabled={loading}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-yellow-500 transition-colors disabled:cursor-not-allowed"
                  aria-label={
                    showPasswords.newPassword
                      ? "Hide new password"
                      : "Show new password"
                  }
                >
                  {showPasswords.newPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {/* CONFIRM NEW PASSWORD */}

            <div className="space-y-2">
              <label
                htmlFor="confirm-password"
                className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500 ml-2"
              >
                Confirm New Password
              </label>

              <div className="relative group">
                <ShieldCheck
                  className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors pointer-events-none"
                  size={20}
                />

                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type={
                    showPasswords.confirmPassword
                      ? "text"
                      : "password"
                  }
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  className={`w-full pl-14 pr-14 py-4 bg-slate-900/80 border ${confirmPasswordBorderClass} rounded-2xl text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-yellow-500/20 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed`}
                />

                <button
                  type="button"
                  onClick={() =>
                    togglePasswordVisibility("confirmPassword")
                  }
                  disabled={loading}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-yellow-500 transition-colors disabled:cursor-not-allowed"
                  aria-label={
                    showPasswords.confirmPassword
                      ? "Hide confirmed password"
                      : "Show confirmed password"
                  }
                >
                  {showPasswords.confirmPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>

              {/* LIVE PASSWORD MATCH STATUS */}

              {formData.confirmPassword && (
                <div className="ml-2 mt-2">
                  {formData.newPassword ===
                  formData.confirmPassword ? (
                    <p className="flex items-center gap-2 text-green-400 text-xs font-semibold">
                      <CheckCircle2 size={14} />
                      Passwords match.
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-red-400 text-xs font-semibold">
                      <AlertCircle size={14} />
                      Passwords do not match.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ==================================================
              SAVE BUTTON
              ================================================== */}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/60 disabled:cursor-not-allowed text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-yellow-500/10 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <Loader2
                  size={20}
                  className="animate-spin"
                />
                Saving Changes...
              </>
            ) : (
              <>
                <Save size={20} />
                Save Changes
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}