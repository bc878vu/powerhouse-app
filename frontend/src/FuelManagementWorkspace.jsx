import React, { useState } from "react";
import { Activity, FileSpreadsheet, Fuel, LayoutDashboard, Zap } from "lucide-react";
import ProductionFuelManagement from "./pages/ProductionFuelManagement";
import FuelManagementLegacy from "./FuelManagement";
import WapdaManagement from "./WapdaManagement";
import DailyDieselReport from "./pages/DailyDieselReportExact";

const TABS = [["dashboard","Dashboard",LayoutDashboard],["entry","Fuel Entry / Fuel Center",Fuel],["wapda","WAPDA Report",Zap],["reports","Fuel Reports",FileSpreadsheet]];
export default function FuelManagementWorkspace(){
 const[tab,setTab]=useState("dashboard");
 return <div className="min-w-0 space-y-4 pb-8">
  <div className="sticky top-0 z-30 rounded-2xl border border-white/10 bg-[#020617]/95 p-2 shadow-2xl backdrop-blur-xl">
   <div className="flex min-w-0 gap-2 overflow-x-auto">
    {TABS.map(([id,label,Icon])=><button key={id} type="button" onClick={()=>setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition ${tab===id?"bg-yellow-500 text-black shadow-lg shadow-yellow-500/10":"bg-white/[.04] text-slate-400 hover:bg-white/[.08] hover:text-white"}`}><Icon size={15}/>{label}</button>)}
    <div className="ml-auto hidden items-center gap-2 px-3 text-[9px] font-black uppercase tracking-[.18em] text-emerald-400 md:flex"><Activity size={13}/> Live Firestore</div>
   </div>
  </div>
  {tab==="dashboard"&&<ProductionFuelManagement/>}
  {tab==="entry"&&<FuelManagementLegacy/>}
  {tab==="wapda"&&<WapdaManagement/>}
  {tab==="reports"&&<DailyDieselReport/>}
 </div>;
}
