import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function CompactSelect({ value, onChange, options, placeholder = "Select option", className = "", ariaLabel }) {
  const id = useId();
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    const close = event => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
    const key = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, []);

  const choose = next => { onChange(next); setOpen(false); };

  return <div ref={root} className={`relative min-w-0 ${className}`}>
    <button id={id} type="button" aria-label={ariaLabel || placeholder} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)} className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-left text-sm text-white outline-none transition focus:border-yellow-500/70 focus:ring-2 focus:ring-yellow-500/10">
      <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span><ChevronDown size={17} className={`shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}/>
    </button>
    {open && <div role="listbox" aria-labelledby={id} className="absolute left-0 top-[calc(100%+6px)] z-[100] w-full min-w-[180px] max-w-[min(100%,420px)] overflow-y-auto rounded-xl border border-slate-600/70 bg-slate-950 p-1 shadow-2xl ring-1 ring-black/40 max-h-[min(320px,45dvh)]">
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => choose(option.value)} className={`flex w-full min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-left text-sm leading-5 transition hover:bg-white/10 focus:bg-white/10 focus:outline-none ${option.value === value ? "bg-yellow-500/15 text-yellow-200" : "text-slate-100"}`}>
        <span className="min-w-0 flex-1 whitespace-normal break-words">{option.label}</span>{option.value === value && <Check size={16} className="shrink-0"/>}
      </button>)}
    </div>}
  </div>;
}
