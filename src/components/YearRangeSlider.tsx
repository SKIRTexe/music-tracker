"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export const YEAR_MIN = 1950;
export const YEAR_MAX = 2025;
const RANGE = YEAR_MAX - YEAR_MIN;

export function YearRangeSlider({
  initialFrom = YEAR_MIN,
  initialTo = YEAR_MAX,
}: {
  initialFrom?: number;
  initialTo?: number;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const fromRef = useRef(initialFrom);
  const toRef = useRef(initialTo);
  const dragging = useRef<"from" | "to" | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  fromRef.current = from;
  toRef.current = to;

  const isFiltered = from !== YEAR_MIN || to !== YEAR_MAX;

  const pct = (y: number) => ((y - YEAR_MIN) / RANGE) * 100;
  const yearAt = (p: number) =>
    Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round((p / 100) * RANGE + YEAR_MIN)));

  const clientPct = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  };

  const commit = (f: number, t: number) => {
    if (f === YEAR_MIN && t === YEAR_MAX) {
      router.push("/");
    } else {
      router.push(`/?from=${f}&to=${t}`);
    }
  };

  const onPointerDown = (handle: "from" | "to") => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = handle;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const year = yearAt(clientPct(e.clientX));
    if (dragging.current === "from") {
      const val = Math.min(year, toRef.current - 1);
      fromRef.current = val;
      setFrom(val);
    } else {
      const val = Math.max(year, fromRef.current + 1);
      toRef.current = val;
      setTo(val);
    }
  };

  const onPointerUp = () => {
    if (dragging.current) {
      dragging.current = null;
      commit(fromRef.current, toRef.current);
    }
  };

  const clear = () => {
    setFrom(YEAR_MIN);
    setTo(YEAR_MAX);
    fromRef.current = YEAR_MIN;
    toRef.current = YEAR_MAX;
    router.push("/");
  };

  const fromPct = pct(from);
  const toPct = pct(to);
  const startDecade = `${Math.floor(from / 10) * 10}s`;

  return (
    <div className="flex items-center gap-4">
      {/* Track */}
      <div
        ref={trackRef}
        className="flex-1 relative h-5 flex items-center select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Background */}
        <div className="w-full h-px bg-zinc-800" />
        {/* Active range fill */}
        <div
          className="absolute h-px bg-zinc-500 pointer-events-none"
          style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
        />
        {/* From handle */}
        <div
          className="absolute w-3 h-3 rounded-full bg-zinc-300 hover:bg-white border border-zinc-600 -translate-x-1/2 cursor-grab active:cursor-grabbing transition-colors touch-none z-10"
          style={{ left: `${fromPct}%` }}
          onPointerDown={onPointerDown("from")}
        />
        {/* To handle */}
        <div
          className="absolute w-3 h-3 rounded-full bg-zinc-300 hover:bg-white border border-zinc-600 -translate-x-1/2 cursor-grab active:cursor-grabbing transition-colors touch-none z-10"
          style={{ left: `${toPct}%` }}
          onPointerDown={onPointerDown("to")}
        />
      </div>

      {/* Year label */}
      <div className="shrink-0 flex items-center gap-1.5 w-28">
        {isFiltered ? (
          <>
            <Link
              href={`/decade/${startDecade}`}
              className="text-xs text-zinc-300 hover:text-zinc-100 transition-colors tabular-nums"
            >
              {from} – {to}
            </Link>
            <button
              onClick={clear}
              className="text-zinc-700 hover:text-zinc-400 transition-colors text-[10px]"
              title="Clear filter"
            >
              ✕
            </button>
          </>
        ) : (
          <span className="text-xs text-zinc-600 tabular-nums">All years</span>
        )}
      </div>
    </div>
  );
}
