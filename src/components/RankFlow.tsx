"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  getComparisonSetup,
  rateByComparison,
  rateByNumber,
  rateItem,
  type ComparisonSetup,
  rankingMode,
  type LibraryItemInput,
} from "@/app/actions";
import type { Bucket, LadderItem } from "@/lib/ranking";

/**
 * The comparison rating flow: bucket, then head-to-head questions, then a score.
 *
 * The binary search runs entirely here. The server sends every candidate once
 * when the modal opens, so answering a question is instant — no request per tap.
 * The final slot is submitted once and the server re-scores from it, so a stale
 * candidate list can't corrupt anything.
 *
 * Rendered through a portal because the trigger lives inside result cards, whose
 * ancestors clip and transform; a modal positioned inside one would be cropped.
 */

const BUCKET_HINTS: Record<Bucket, string> = {
  LOVED: "6.8 – 10",
  FINE: "3.4 – 6.7",
  DISLIKED: "0 – 3.3",
};

export function RankFlow({
  item,
  onClose,
  onRated,
  setup: given,
}: {
  item: LibraryItemInput;
  onClose: () => void;
  /** Lets the calling card update its badge without waiting for a refresh. */
  onRated: (rating: number) => void;
  /** Pre-supplied candidates, skipping the fetch. Used to render fixtures. */
  setup?: ComparisonSetup;
}) {
  const [setup, setSetup] = useState<ComparisonSetup | null>(given ?? null);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [range, setRange] = useState<{ lo: number; hi: number }>({ lo: 0, hi: 0 });
  const [result, setResult] = useState<number | null>(null);
  const [score, setScore] = useState(7);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (given) return;
    let live = true;
    getComparisonSetup(item).then((s) => live && setSetup(s));
    return () => {
      live = false;
    };
    // The item is fixed for the lifetime of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const candidates: LadderItem[] =
    setup?.buckets.find((b) => b.bucket === bucket)?.items ?? [];

  const submit = (chosenBucket: Bucket, insertIndex: number) => {
    startTransition(async () => {
      const rating = await rateByComparison(item, chosenBucket, insertIndex);
      if (rating != null) {
        setResult(rating);
        onRated(rating);
      } else {
        onClose();
      }
    });
  };

  const chooseBucket = (b: Bucket) => {
    const items = setup?.buckets.find((x) => x.bucket === b)?.items ?? [];
    setBucket(b);
    setRange({ lo: 0, hi: items.length });
    // Nothing to compare against yet — it simply becomes the first of its bucket.
    if (items.length === 0) submit(b, 0);
  };

  /** Narrow the search. Submits as soon as the window closes to a single slot. */
  const answer = (preferNew: boolean, mid: number) => {
    if (!bucket) return;
    const next = preferNew ? { lo: range.lo, hi: mid } : { lo: mid + 1, hi: range.hi };
    if (next.lo >= next.hi) submit(bucket, next.lo);
    else setRange(next);
  };

  const saveNumber = () => {
    startTransition(async () => {
      // Only route through the ladder when the user has actually opted into
      // ranking. Otherwise this is a plain rating and must not start building a
      // ladder behind their back.
      if (!setup?.active) {
        await rateItem(item, score);
        setResult(score);
        onRated(score);
        return;
      }

      const rating = await rateByNumber(item, score);
      if (rating != null) {
        setResult(rating);
        onRated(rating);
      } else {
        onClose();
      }
    });
  };

  const mid = Math.floor((range.lo + range.hi) / 2);
  const remaining = Math.max(0, range.hi - range.lo);
  const questionsLeft = remaining > 0 ? Math.ceil(Math.log2(remaining + 1)) : 0;


  /** Comparisons need a ladder; without one the prompt is just the slider. */
  const canCompare = !!setup?.active;

  const heading =
    result !== null
      ? "Rated"
      : !setup
        ? "Loading…"
        : bucket
          ? "Which did you like more?"
          : canCompare
            ? `How was ${item.title}?`
            : `Rate ${item.title}`;

  /**
   * The slider, shown *beneath* the buckets rather than behind a link.
   *
   * Someone who already knows the number should not have to answer a ladder of
   * comparisons to enter it, and someone who doesn't should not have to go
   * looking for the alternative. When there is no ladder to compare against,
   * this is the whole prompt.
   */
  const sliderBlock = (
    <div className={canCompare ? "mt-4 border-t border-zinc-800 pt-3" : "mt-4"}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-zinc-500">
          {canCompare ? "Or set a score yourself" : "Score"}
        </span>
        <span className="text-sm font-semibold tabular-nums text-zinc-200">
          {score.toFixed(1)}
          <span className="font-normal text-zinc-600">/10</span>
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        step="0.1"
        value={score}
        onChange={(e) => setScore(parseFloat(e.target.value))}
        aria-label={`Score for ${item.title}`}
        className="mt-1 h-6 w-full cursor-pointer accent-zinc-300"
      />
      <button
        onClick={saveNumber}
        disabled={isPending}
        className={`mt-1 w-full rounded py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
          canCompare
            ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            : "bg-zinc-100 text-zinc-900 hover:bg-white"
        }`}
      >
        {isPending ? "Saving…" : "Use this score"}
      </button>
      {canCompare && (
        <p className="mt-2 text-[10px] leading-snug text-zinc-600">
          Kept exactly, and moves {item.title} to the matching place in your ranking.
        </p>
      )}
    </div>
  );

  const body = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Rate ${item.title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-medium text-zinc-200">{heading}</p>
          {/* Rating is a prompt, not a demand — leaving without one is allowed,
              and the status change has already been saved either way. */}
          <button
            onClick={onClose}
            aria-label="Close without rating"
            className="-mr-1 -mt-1 shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Result ─────────────────────────────────────────────────────── */}
        {result !== null ? (
          <div className="py-2 text-center">
            <p className="mt-1 text-4xl font-semibold leading-none text-zinc-100">
              {result.toFixed(1)}
            </p>
            <p className="mt-2 truncate text-xs text-zinc-400">{item.title}</p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded bg-zinc-100 py-2 text-xs font-medium text-zinc-900 transition-colors hover:bg-white"
            >
              Done
            </button>
          </div>
        ) : !setup ? (
          <p className="py-8 text-center text-xs text-zinc-500">Loading your ranking…</p>
        ) : bucket ? (
          /* ── Comparison ───────────────────────────────────────────────── */
          <div>
            <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
              About {questionsLeft} question{questionsLeft === 1 ? "" : "s"} to go
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <ComparisonChoice
                title={item.title}
                artistName={item.artistName}
                coverUrl={item.coverUrl ?? null}
                onClick={() => answer(true, mid)}
                disabled={isPending}
              />
              <ComparisonChoice
                title={candidates[mid]?.title ?? ""}
                artistName={candidates[mid]?.artistName ?? ""}
                coverUrl={candidates[mid]?.coverUrl ?? null}
                onClick={() => answer(false, mid)}
                disabled={isPending}
              />
            </div>

            <button
              onClick={() => bucket && submit(bucket, mid + 1)}
              disabled={isPending}
              className="mt-3 w-full rounded bg-zinc-800 py-2 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40"
            >
              Too close to call
            </button>
          </div>
        ) : (
          /* ── Bucket, with the slider underneath ───────────────────────── */
          <div>
            {canCompare && (
              <>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Start rough — the comparisons do the fine-tuning.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {setup.buckets.map((b) => (
                    <button
                      key={b.bucket}
                      onClick={() => chooseBucket(b.bucket)}
                      disabled={isPending}
                      className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2.5 text-left text-xs text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-40"
                    >
                      <span>{b.label}</span>
                      <span className="text-[10px] tabular-nums text-zinc-500">
                        {BUCKET_HINTS[b.bucket]}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sliderBlock}
          </div>
        )}
      </div>
    </div>
  );

  // Portalled on the client only; there is no document during the server render.
  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function ComparisonChoice({
  title,
  artistName,
  coverUrl,
  onClick,
  disabled,
}: {
  title: string;
  artistName: string;
  coverUrl: string | null;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 text-left transition-colors hover:border-zinc-600 disabled:opacity-40"
    >
      <div className="aspect-square w-full overflow-hidden rounded bg-zinc-800">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-snug text-zinc-200">
        {title}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-zinc-500">{artistName}</p>
    </button>
  );
}

/**
 * Which rating UI to show. Fetched rather than passed down, so the rate controls
 * stay drop-in wherever they already appear and no page has to thread it through.
 */
export function useRankingMode(itemType: string) {
  const [mode, setMode] = useState<{ enabled: boolean; active: boolean; needed: number } | null>(null);
  useEffect(() => {
    let live = true;
    rankingMode(itemType).then((m) => live && setMode(m));
    return () => {
      live = false;
    };
  }, [itemType]);
  return mode;
}
