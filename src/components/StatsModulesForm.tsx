"use client";

import { useState, useTransition } from "react";
import { setStatsHidden } from "@/app/actions";
import {
  STATS_MODULES,
  STATS_SECTIONS,
  modulesInSection,
} from "@/lib/stats-modules";

/**
 * Switches for the blocks on `/stats`.
 *
 * Each flip sends the whole hidden list rather than a single id, so flipping two
 * switches quickly can't race into a lost update. State is optimistic: the switch
 * moves immediately and the write happens behind it, because waiting on a round
 * trip to see a toggle move feels broken.
 */
export function StatsModulesForm({ hidden }: { hidden: string[] }) {
  const [off, setOff] = useState<Set<string>>(new Set(hidden));
  const [isPending, startTransition] = useTransition();

  const save = (next: Set<string>) => {
    setOff(next);
    startTransition(async () => {
      await setStatsHidden([...next]);
    });
  };

  const toggle = (id: string) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save(next);
  };

  const shownCount = STATS_MODULES.length - off.size;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          {shownCount} of {STATS_MODULES.length} shown
        </p>
        {off.size > 0 && (
          <button
            onClick={() => save(new Set())}
            disabled={isPending}
            className="text-[11px] text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-300 disabled:opacity-50"
          >
            Show everything
          </button>
        )}
      </div>

      <div className="space-y-4">
        {STATS_SECTIONS.map((section) => {
          const modules = modulesInSection(section);
          const allOff = modules.every((m) => off.has(m.id));

          return (
            <div key={section}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <h3 className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {section}
                </h3>
                {/* Says why a whole heading will be missing, rather than leaving
                    someone to work it out from the stats page. */}
                {allOff && (
                  <span className="text-[10px] text-zinc-600">section hidden</span>
                )}
              </div>

              <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
                {modules.map((m) => {
                  const on = !off.has(m.id);
                  return (
                    <li key={m.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-medium ${
                            on ? "text-zinc-200" : "text-zinc-500"
                          }`}
                        >
                          {m.label}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-zinc-600">
                          {m.hint}
                        </p>
                      </div>

                      <button
                        onClick={() => toggle(m.id)}
                        disabled={isPending}
                        role="switch"
                        aria-checked={on}
                        aria-label={m.label}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                          on ? "bg-zinc-100" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform ${
                            on
                              ? "translate-x-[1.125rem] bg-zinc-900"
                              : "translate-x-0.5 bg-zinc-400"
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
