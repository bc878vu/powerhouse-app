import React,{useEffect,useRef,useState}from"react";
import{collection,getDocs,orderBy,query,serverTimestamp,setDoc,doc}from"firebase/firestore";
import{CheckCircle2,Loader2}from"lucide-react";
import FuelManagementV2 from"./FuelManagementV2";
import{db}from"../firebase";

const KEY="fuel-report-download-v1";

export default function FuelReportAutoSave(){
 const saving=useRef(false);
 const skip=useRef(false);
 const[status,setStatus]=useState("");
 useEffect(()=>{
  const handler=async e=>{
   const button=e.target?.closest?.("button");
   if(!button||!/^EXCEL$/i.test((button.textContent||"").trim()))return;
   if(skip.current){skip.current=false;return;}
   if(saving.current){e.preventDefault();e.stopImmediatePropagation?.();return;}
   e.preventDefault();e.stopImmediatePropagation?.();
   saving.current=true;setStatus("Saving report data…");
   try{
    const snap=await getDocs(query(collection(db,"entries"),orderBy("createdAt","asc")));
    const rows=snap.docs.map(x=>({id:x.id,...x.data()}));
    const dates=rows.map(x=>String(x.date||"")).filter(Boolean).sort();
    const today=new Date().toISOString().slice(0,10);
    const start=dates[0]||today;
    const end=dates[dates.length-1]||today;
    const reportId=`download_${start}_${end}`.replace(/[^a-zA-Z0-9_-]/g,"_");
    await setDoc(doc(db,"fuelReportDownloads",reportId),{
      reportId,
      template:"Daily Diesel Consuption & Generator Running  Report",
      company:"Future fashion (pvt.) ltd LHR",
      source:"Daily Diesel Report November(7).xlsx",
      downloadedAt:serverTimestamp(),
      rangeStart:start,
      rangeEnd:end,
      entryCount:rows.length,
      entries:rows
    },{merge:true});
    setStatus("Report data saved ✓");
    skip.current=true;
    setTimeout(()=>button.click(),50);
   }catch(err){
    console.error("Fuel report auto-save failed",err);
    setStatus("Save failed — downloading report anyway");
    skip.current=true;
    setTimeout(()=>button.click(),50);
   }finally{
    saving.current=false;
    setTimeout(()=>setStatus(""),3000);
   }
  };
  document.addEventListener("click",handler,true);
  return()=>document.removeEventListener("click",handler,true);
 },[]);
 return <div className="relative">
  {status&&<div className="no-print fixed right-4 top-20 z-[9999] flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-xs font-bold text-white shadow-2xl">
   {status.includes("saved")?<CheckCircle2 size={16} className="text-green-400"/>:<Loader2 size={16} className="animate-spin text-yellow-400"/>}{status}
  </div>}
  <FuelManagementV2/>
 </div>;
}
