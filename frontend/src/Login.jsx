import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from './api';
import { setToken } from './utils/auth';
import { Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post('/auth/login', { email, password });
      setToken(JSON.stringify(res.data.user));
      window.location.href = "/"; 
    } catch (err) {
  alert(err?.response?.data?.msg || "Login Failed");
} finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0f1e] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[140px]"></div>
      <div className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] bg-yellow-500/10 rounded-full blur-[140px]"></div>

      <div className="relative z-10 w-full max-w-md bg-slate-800/40 backdrop-blur-3xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-500 rounded-2xl mb-4 shadow-xl">
            <ShieldCheck size={32} className="text-slate-900" />
          </div>
          <h2 className="text-3xl font-black text-white italic">
            POWER<span className="text-yellow-500 not-italic">HOUSE</span>
          </h2>
          <p className="text-slate-400 text-xs mt-2 uppercase tracking-[0.3em] font-bold">Secure Portal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="relative group">
            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={20} />
            <input
              type="email" placeholder="Official Email"
              className="w-full pl-14 pr-6 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-yellow-500/50"
              onChange={(e) => setEmail(e.target.value)} required
            />
          </div>

          <div className="relative group">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={20} />
            <input
              type="password" placeholder="Password"
              className="w-full pl-14 pr-6 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-yellow-500/50"
              onChange={(e) => setPassword(e.target.value)} required
            />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 text-slate-950 font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 active:scale-95"
          >
            {loading ? "Verifying..." : "Login Access"}
            <ArrowRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}