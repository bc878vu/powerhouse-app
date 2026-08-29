import React,{useEffect,useState}from"react";
import{Bot,CheckCircle2,MessageCircle,Send,ShieldCheck,Sparkles,AlertTriangle}from"lucide-react";
import{httpsCallable}from"firebase/functions";
import{functions}from"./firebase";
import{getUser}from"./utils/auth";

const suggestions=["PowerHouse ka current overall status batao","Mere pending tasks kya hain?","Panel network mein koi issue hai?","Mujhe short maintenance summary do"];

export default function AI(){
 const user=getUser(),admin=["admin","superadmin"].includes(user?.role);
 const[m,setM]=useState([]),[q,setQ]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState({}),[note,setNote]=useState("");
 useEffect(()=>{httpsCallable(functions,"aiStatus")({}).then(r=>setStatus(r.data||{})).catch(e=>setStatus({aiConfigured:false,whatsappConfigured:false,error:e?.message||"Firebase Functions not deployed"}))},[]);
 const ask=async(v=q)=>{v=String(v||"").trim();if(!v||busy)return;setQ("");setM(x=>[...x,{role:"user",text:v}]);setBusy(true);try{const call=httpsCallable(functions,"aiChat"),r=await call({message:v}),d=r.data||{};setM(x=>[...x,{role:"ai",text:d.answer||"AI response nahi mili."}])}catch(e){setM(x=>[...x,{role:"ai",text:e?.message||"AI request failed.",error:true}])}finally{setBusy(false)}};
 const report=async()=>{setBusy(true);setNote("");try{const call=httpsCallable(functions,"sendWhatsAppReport"),r=await call({}),d=r.data||{};setNote(d.success?`WhatsApp report sent: ${d.sent||0}`:`WhatsApp report failed (${d.failed||0})`)}catch(e){setNote(e?.message||"WhatsApp report failed.")}finally{setBusy(false)}};
 return <main className="w-full max-w-[1500px] mx-auto min-w-0 space-y-4 sm:space-y-5 pb-6 sm:pb-10">
  <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 sm:gap-5">
   <div className="flex min-w-0 items-center gap-3 sm:gap-4">
    <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-yellow-500 text-black flex items-center justify-center"><Sparkles size={26}/></div>
    <div className="min-w-0"><p className="text-[8px] sm:text-[10px] uppercase tracking-[.22em] sm:tracking-[.25em] text-yellow-500 font-black">Firebase Intelligent Operations</p><h1 className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight">PowerHouse AI</h1><p className="text-slate-500 text-xs sm:text-sm">Firebase Cloud Functions + project data based AI.</p></div>
   </div>
   <div className="grid grid-cols-1 min-[430px]:grid-cols-2 xl:flex gap-2 w-full xl:w-auto">
    <span className={`min-h-[42px] px-3 py-2 rounded-xl border flex items-center justify-center text-center text-[9px] sm:text-[10px] font-black ${status.aiConfigured?"border-green-500/20 text-green-400":"border-red-500/20 text-red-400"}`}>{status.aiConfigured?"AI Ready":"AI Setup Required"}</span>
    <span className={`min-h-[42px] px-3 py-2 rounded-xl border flex items-center justify-center text-center text-[9px] sm:text-[10px] font-black ${status.whatsappConfigured?"border-green-500/20 text-green-400":"border-yellow-500/20 text-yellow-400"}`}>{status.whatsappConfigured?"WhatsApp Connected":"WhatsApp Setup Required"}</span>
   </div>
  </header>
  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:grid-cols-[minmax(0,1fr)_360px] gap-4 sm:gap-5 items-start">
   <section className="min-w-0 bg-[#020617] border border-white/5 rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col h-[calc(100dvh-180px)] min-h-[520px] max-h-[820px] lg:min-h-[600px]">
    <div className="shrink-0 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/5 flex gap-3 items-center"><Bot className="text-yellow-500 shrink-0"/><div className="min-w-0"><b>AI Assistant</b><p className="text-[9px] sm:text-[10px] text-slate-500 truncate">{admin?"Admin: full Firebase operational context":"Staff: your own Firebase information only"}</p></div></div>
    <div className="flex-1 min-h-0 p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 overflow-y-auto overscroll-contain">
     {!m.length?<div className="min-h-full h-full flex items-center justify-center text-center py-6"><div className="w-full max-w-2xl"><Sparkles size={34} className="mx-auto text-yellow-500 mb-3 sm:mb-4"/><h2 className="text-lg sm:text-xl font-black">Ask PowerHouse AI</h2><p className="text-xs sm:text-sm text-slate-500 my-3 sm:my-4">Panels, routes, tasks, duties, tools, fuel aur system ke bare mein poochhein.</p><div className="grid gap-2 text-left">{suggestions.map(s=><button key={s} onClick={()=>ask(s)} className="w-full text-left px-3 sm:px-4 py-3 rounded-xl bg-white/[.03] border border-white/5 text-[11px] sm:text-xs text-slate-300 hover:bg-white/[.06] hover:border-white/10 transition-colors">{s}</button>)}</div></div></div>
     :m.map((x,i)=><div key={i} className={`flex min-w-0 ${x.role==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[94%] sm:max-w-[88%] md:max-w-[78%] rounded-2xl px-3 sm:px-4 py-3 ${x.role==="user"?"bg-yellow-500 text-black":"bg-white/[.04] border border-white/5 text-slate-200"}`}><div className={`text-xs sm:text-sm whitespace-pre-wrap break-words leading-6 ${x.error?"text-red-400":""}`}>{x.text}</div></div></div>)}
     {busy&&<div className="text-xs text-slate-500">AI is thinking…</div>}
    </div>
    <div className="shrink-0 p-3 sm:p-4 border-t border-white/5 bg-[#020617]"><form onSubmit={e=>{e.preventDefault();ask()}} className="flex items-stretch gap-2"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ask PowerHouse AI…" className="flex-1 min-w-0 min-h-[48px] bg-white/[.04] border border-white/10 rounded-xl px-3 sm:px-4 py-3 text-sm outline-none focus:border-yellow-500"/><button aria-label="Send message" disabled={busy||!q.trim()} className="w-12 sm:w-14 shrink-0 rounded-xl bg-yellow-500 text-black flex items-center justify-center disabled:opacity-40"><Send size={17}/></button></form></div>
   </section>
   <aside className="min-w-0 space-y-3 sm:space-y-4 lg:sticky lg:top-[88px]">
    <div className="bg-[#020617] border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-5"><div className="flex gap-2 mb-3"><ShieldCheck className="text-yellow-500 shrink-0" size={18}/><b>Access Scope</b></div><p className="text-xs text-slate-400 leading-6">{admin?"Admin: full operational Firebase context, including staff/task summaries.":"Staff: only your own account, tasks, duties, tools and fuel entries plus safe general information."}</p></div>
    <div className="bg-[#020617] border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-5"><div className="flex gap-2 mb-3"><MessageCircle className="text-green-400 shrink-0" size={18}/><b>WhatsApp</b></div><p className="text-xs text-slate-500 leading-5 mb-4">{admin?"Admin ko full operational report aur WhatsApp AI chat milegi.":"User ko short personal status/update aur apne data par AI chat milegi."}</p><button onClick={report} disabled={busy} className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-black disabled:opacity-40"><MessageCircle size={14} className="inline mr-2"/>Send WhatsApp Report</button>{note&&<div className="mt-3 text-[11px] text-slate-400 flex gap-2"><CheckCircle2 size={14} className="text-green-400 shrink-0"/><span>{note}</span></div>}</div>
    <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex gap-2"><AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5"/><p className="text-[11px] text-slate-500 leading-5">Electrical AI advice ko site drawings, nameplate aur applicable safety standards se verify karein.</p></div>
   </aside>
  </div>
 </main>
}
