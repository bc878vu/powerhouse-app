import React, { useState } from "react";
import { ExternalLink, Maximize2, Fuel, LayoutDashboard } from "lucide-react";

const FUEL_APP_URL = "https://fuel-management-three.vercel.app/admin";

export default function FuelManagement() {
  const [src, setSrc] = useState(FUEL_APP_URL);
  const openFull = () => window.open(src, "_blank", "noopener,noreferrer");

  return (
    <section className="h-full min-h-[calc(100vh-120px)] flex flex-col gap-4">
      <div className="rounded-3xl border border-white/10 bg-[#020617]/90 p-4 md:p-5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-yellow-500 text-black flex items-center justify-center shadow-lg shadow-yellow-500/20"><Fuel size={22} /></div>
            <div>
              <h1 className="text-xl md:text-2xl font-black">Fuel Management</h1>
              <p className="text-xs text-slate-400 mt-1">Diesel, generator running hours, stock, entries and reports</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSrc(FUEL_APP_URL)} className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-4 py-2.5 text-sm font-black text-black hover:bg-yellow-400 transition"><LayoutDashboard size={17} /> Dashboard</button>
            <button type="button" onClick={openFull} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10 transition"><Maximize2 size={17} /> Full screen</button>
            <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10 transition"><ExternalLink size={17} /> Open module</a>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-yellow-500/10 bg-yellow-500/[0.04] px-4 py-3 text-xs text-slate-400">The complete Fuel Management application is loaded below with its own internal navigation. Dashboard, New Entry, Reports, Firebase data and its mobile layout remain intact.</div>
      </div>
      <div className="flex-1 min-h-[720px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <iframe key={src} title="PowerHouse Fuel Management" src={src} className="w-full h-full min-h-[720px] border-0 bg-slate-900" allow="clipboard-read; clipboard-write" />
      </div>
    </section>
  );
}
