"use client";

import { useState, useTransition } from "react";
import { setRankingEnabled } from "@/app/actions";
// No value import from lib/ranking here: it imports prisma, and pulling that into
// a client bundle is a build error waiting to happen. The threshold arrives as a
// prop from the server instead.

/**
 * The switch for comparison rating.
 *
 * Says plainly what turning it on does to existing ratings, because it is not
 * nothing: the ladder is seeded from them, and from then on scores are derived
 * from position, so numbers can shift as more items are placed. Surprising
 * someone's ratings into moving without warning would be worse than the feature.
 */
export function RankingToggle({
  enabled,
  ratedAlbums,
  minRated,
}: {
  enabled: boolean;
  ratedAlbums: number;
  minRated: number;
}) {
  const [on, setOn] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      await setRankingEnabled(next);
    });
  };

  const short = Math.max(0, minRated - ratedAlbums);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-200">Rate by comparison</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            Instead of picking a number, say roughly how it was and answer a few
            &ldquo;which did you like more?&rdquo; questions. The score comes from where it
            lands. You can always override with a number.
          </p>
        </div>

        <button
          onClick={toggle}
          disabled={isPending}
          role="switch"
          aria-checked={on}
          aria-label="Rate by comparison"
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-zinc-100" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform ${
              on ? "translate-x-[1.125rem] bg-zinc-900" : "translate-x-0.5 bg-zinc-400"
            }`}
          />
        </button>
      </div>

      {on && (
        <p className="mt-2 border-t border-zinc-800 pt-2 text-[11px] leading-snug text-zinc-600">
          {short > 0 ? (
            <>
              Rate {short} more album{short === 1 ? "" : "s"} the normal way first — there
              is nothing to compare against yet.
            </>
          ) : (
            <>
              Your existing ratings are kept exactly and set the starting order. Albums
              you compare from now on slot in between them.
            </>
          )}
        </p>
      )}
    </div>
  );
}
