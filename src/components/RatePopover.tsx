"use client";

import { useState, useTransition } from "react";
import { saveToLibrary, rateItem, removeFromLibrary, type LibraryItemInput } from "@/app/actions";
import { RankFlow, useRankingMode } from "@/components/RankFlow";
import type { ExistingEntry } from "@/lib/library";

export const STATUS_LABELS: Record<string, string> = {
  LISTENED: "Listened",
  LISTENING: "Listening",
  WANT: "Want to listen",
};

const STATUSES = ["LISTENED", "LISTENING", "WANT"] as const;

/**
 * The add/rate controls. Shared by album and song cards and by album tracklist
 * rows, so every surface saves the same way — the caller supplies the item and
 * positions the popover.
 */
export function RatePopover({
  item,
  saved,
  onSaved,
  onClose,
  className = "",
}: {
  item: LibraryItemInput;
  saved: ExistingEntry | null;
  onSaved: (next: ExistingEntry | null) => void;
  onClose: () => void;
  className?: string;
}) {
  const [rating, setRating] = useState(saved?.rating ?? 7.0);
  const [isPending, startTransition] = useTransition();
  const [flowOpen, setFlowOpen] = useState(false);
  const mode = useRankingMode(item.itemType);

  /**
   * Marking something Listened is the moment you have an opinion about it, so
   * that is when to ask for one.
   *
   * Only for a first rating — re-marking something already rated as Listened is
   * not a request to re-rate it, and prompting then is nagging. The prompt opens
   * *after* the status write lands rather than alongside it: both paths upsert
   * the same row, and firing them together races two writes at one record.
   */
  const handleStatus = (status: string) => {
    onSaved({ status, rating: saved?.rating ?? null });
    const promptToRate = status === "LISTENED" && saved?.rating == null;
    if (!promptToRate) onClose();

    startTransition(async () => {
      await saveToLibrary(item, status);
      if (promptToRate) setFlowOpen(true);
    });
  };

  const handleRate = () => {
    onSaved({ status: "LISTENED", rating });
    onClose();
    startTransition(async () => { await rateItem(item, rating); });
  };

  const handleRemove = () => {
    onSaved(null);
    onClose();
    startTransition(async () => {
      await removeFromLibrary(
        item.mbid,
        item.itemType === "SONG"
          ? { title: item.title, artistName: item.artistName }
          : undefined
      );
    });
  };

  return (
    <div
      // max-w keeps it inside the viewport on a narrow phone, where a card is
      // barely wider than the popover itself.
      className={`z-30 w-44 max-w-[calc(100vw-1.5rem)] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 ${className}`}
    >
      <div className="flex flex-col gap-1 mb-3">
        {STATUSES.map((s) => (
          <button
            key={s}
            disabled={isPending}
            onClick={() => handleStatus(s)}
            className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded transition-colors disabled:opacity-40 ${
              saved?.status === s
                ? "bg-zinc-600 text-zinc-100"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-2.5">
        {/*
         * Which control appears depends on the user's ranking setting, which is
         * fetched rather than passed in so this stays drop-in on every surface.
         * Until it arrives the slider shows — the same control as before, so the
         * common case never waits on a request.
         */}
        {mode?.active ? (
          <>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] text-zinc-500">Rate</span>
              {saved?.rating != null && (
                <span className="text-xs font-semibold text-zinc-200 tabular-nums">
                  {saved.rating.toFixed(1)}
                  <span className="text-zinc-600 font-normal">/10</span>
                </span>
              )}
            </div>
            <button
              onClick={() => setFlowOpen(true)}
              disabled={isPending}
              className="w-full text-[11px] py-1.5 bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors disabled:opacity-40"
            >
              {saved?.rating != null ? "Rate again" : "Rate by comparison"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px] text-zinc-500">Rate</span>
              <span className="text-xs font-semibold text-zinc-200 tabular-nums">
                {rating.toFixed(1)}
                <span className="text-zinc-600 font-normal">/10</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={rating}
              onChange={(e) => setRating(parseFloat(e.target.value))}
              aria-label={`Rating for ${item.title}`}
              className="w-full h-6 accent-zinc-300 cursor-pointer"
            />
            <button
              onClick={handleRate}
              disabled={isPending}
              className="mt-2 w-full text-[11px] py-1.5 bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors disabled:opacity-40"
            >
              {isPending ? "Saving…" : saved?.rating != null ? "Update rating" : "Save rating"}
            </button>
          </>
        )}
        {saved && (
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="mt-1.5 w-full text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Remove from library
          </button>
        )}
      </div>
      {flowOpen && (
        <RankFlow
          item={item}
          onClose={() => {
            setFlowOpen(false);
            onClose();
          }}
          onRated={(next) => onSaved({ status: "LISTENED", rating: next })}
        />
      )}
    </div>
  );
}
