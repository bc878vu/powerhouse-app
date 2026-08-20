import React, { useState } from "react";
import { Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { loginWithFirebase } from "./firebaseAuth";
import { setToken } from "./utils/auth";

const friendlyAuthError = (error) => {
  const code = error?.code;
  const messages = {
    "auth/invalid-credential": "Invalid Firebase email or password. Reset the Firebase user password and try again.",
    "auth/user-not-found": "No Firebase account exists for this email. Add the user in Firebase Authentication first.",
    "auth/wrong-password": "Invalid Firebase email or password. Reset the Firebase user password and try again.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Please check your internet connection.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-disabled": "This Firebase account has been disabled.",
    "auth/operation-not-allowed": "Email/password sign-in is not enabled in Firebase Authentication.",
    "auth/api-key-not-valid": "Firebase API configuration is invalid. Check the deployed Firebase project configuration.",
    "permission-denied": "Firebase login succeeded, but Firestore denied the profile operation. Deploy the latest Firestore rules."
  };

  if (messages[code]) return messages[code];
  if (error?.message === "Your account is inactive. Contact admin.") return error.message;
  return error?.message || "Login failed. Please try again.";
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await loginWithFirebase(email, password);
      setToken(user);
      window.location.replace("/");
    } catch (authError) {
      console.error("Firebase login error:", authError);
      setError(friendlyAuthError(authError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0f1e] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[140px]" />
      <div className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] bg-yellow-500/10 rounded-full blur-[140px]" />

      <div className="relative z-10 w-full max-w-md bg-slate-800/40 backdrop-blur-3xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-500 rounded-2xl mb-4 shadow-xl">
            <ShieldCheck size={32} className="text-slate-900" />
          </div>
          <h2 className="text-3xl font-black text-white italic">
            POWER<span className="text-yellow-500 not-italic">HOUSE</span>
          </h2>
          <p className="text-slate-400 text-xs mt-2 uppercase tracking-[0.3em] font-bold">Secure Firebase Portal</p>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="relative group">
            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={20} />
            <input type="email" placeholder="Official Email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full pl-14 pr-6 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-yellow-500/50" required />
          </div>

          <div className="relative group">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={20} />
            <input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full pl-14 pr-6 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-yellow-500/50" required />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 text-slate-950 font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed">
            {loading ? "Verifying..." : "Login Access"}
            <ArrowRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
