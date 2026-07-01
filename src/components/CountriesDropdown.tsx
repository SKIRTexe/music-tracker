"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";

const WorldMapPicker = dynamic(
  () => import("./WorldMapPicker").then((m) => m.WorldMapPicker),
  { ssr: false, loading: () => <p className="text-xs text-zinc-600 py-8 text-center">Loading map…</p> }
);

export function CountriesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${
          open
            ? "border-zinc-600 text-zinc-200 bg-zinc-800"
            : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
        }`}
      >
        <span>Countries</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[580px] max-w-[90vw] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-4 z-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Browse by country</p>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors"
            >
              ✕
            </button>
          </div>
          <WorldMapPicker onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
