"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  saveToLibrary,
  rateItem,
  rateByNumber,
  removeFromLibrary,
  type LibraryItemInput,
} from "@/app/actions";
import { RankFlow, useRankingMode } from "@/components/RankFlow";
import { STATUSES, STATUS_LABELS } from "@/lib/statuses";

interface Props {
  mbid: string;
  albumTitle: string;
  artistName: string;
  releaseYear?: number;
  coverUrl?: string;
  artistMbid?: string;
  isLoggedIn: boolean;
  initialStatus: string | null;
  initialRating: number | null;
}

export function AlbumActions({
  mbid,
  albumTitle,
  artistName,
  releaseYear,
  coverUrl,
  artistMbid,
  isLoggedIn,
  initialStatus,
  initialRating,
}: Props) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [rating, setRating] = useState(initialRating ?? 7.0);
  const [isPending, startTransition] = useTransition();
  const [rated, setRated] = useState<number | null>(initialRating);
  const [flowOpen, setFlowOpen] = useState(false);
  const mode = useRankingMode("ALBUM");

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="inline-block px-4 py-2 text-sm bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors"
      >
        Sign in to add to library
      </Link>
    );
  }

  const item: LibraryItemInput = {
    mbid,
    itemType: "ALBUM",
    title: albumTitle,
    artistName,
    releaseYear,
    coverUrl,
    artistMbid,
  };

  const handleStatus = (newStatus: string) => {
    setStatus(newStatus);
    startTransition(async () => { await saveToLibrary(item, newStatus); });
  };

  /**
   * Save the slider's number.
   *
   * While ranking is on this goes through `rateByNumber`, never `rateItem`: a
   * direct write would leave a score that its position in the ladder disagrees
   * with, which is the one thing the ranking model is built to prevent. The
   * number picks a slot, and the slider then snaps to the score that slot
   * carries — so you can see where the album actually landed.
   */
  const handleRate = () => {
    setStatus("LISTENED");
    startTransition(async () => {
      if (mode?.active) {
        const settled = await rateByNumber(item, rating);
        if (settled != null) {
          setRated(settled);
          setRating(settled);
        }
        return;
      }
      await rateItem(item, rating);
      setRated(rating);
    });
  };

  const handleRemove = () => {
    setStatus(null);
    startTransition(async () => { await removeFromLibrary(mbid); });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => handleStatus(s)}
            disabled={isPending}
            className={`px-3 py-2 text-sm rounded transition-colors disabled:opacity-40 ${
              status === s
                ? "bg-zinc-600 text-zinc-100"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Saving a rating implies you listened to it. */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-zinc-500 uppercase tracking-widest">Your rating</span>
          <span className="text-sm font-semibold text-zinc-200 tabular-nums">
            {rating.toFixed(1)}
            <span className="text-zinc-600 text-xs font-normal"> /10</span>
          </span>
        </div>

        {/*
         * The slider stays available even with comparison rating on. The album
         * page is where you go to reconsider a record you already know, and
         * being made to re-answer a ladder of comparisons to nudge a score is
         * the wrong tool for that. It writes through the ranking either way.
         */}
        <input
          type="range"
          min="0"
          max="10"
          step="0.1"
          value={rating}
          onChange={(e) => setRating(parseFloat(e.target.value))}
          className="w-full h-6 accent-zinc-300 cursor-pointer"
        />

        <div className="flex flex-wrap items-center gap-3 mt-2.5">
          {mode?.active && (
            <button
              onClick={() => setFlowOpen(true)}
              disabled={isPending}
              className="text-xs px-3 py-1.5 bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors disabled:opacity-40"
            >
              {rated != null ? "Rate again" : "Rate by comparison"}
            </button>
          )}
          <button
            onClick={handleRate}
            disabled={isPending}
            className={`text-xs px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-40 ${
              mode?.active
                ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                : "bg-zinc-100 hover:bg-white text-zinc-900"
            }`}
          >
            {isPending
              ? "Saving…"
              : mode?.active
                ? "Use this score"
                : initialRating != null
                  ? "Update rating"
                  : "Save rating"}
          </button>
          {status && (
            <button
              onClick={handleRemove}
              disabled={isPending}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Remove from library
            </button>
          )}
        </div>

        {mode?.active && (
          <p className="mt-2 text-[11px] leading-snug text-zinc-600">
            A score here is kept exactly, and moves the album to the matching place in
            your ranking. Albums you rate by comparison fill the gaps around it.
          </p>
        )}

        {mode?.enabled && !mode.active && mode.needed > 0 && (
          <p className="mt-2 text-[11px] text-zinc-600">
            Rate {mode.needed} more album{mode.needed === 1 ? "" : "s"} and rating switches
            to comparisons.
          </p>
        )}
      </div>

      {flowOpen && (
        <RankFlow
          item={item}
          onClose={() => setFlowOpen(false)}
          onRated={(next) => {
            setRated(next);
            // The header reads the slider, so move it too — otherwise finishing a
            // comparison would leave the old number sitting above the new score.
            setRating(next);
            setStatus("LISTENED");
          }}
        />
      )}
    </div>
  );
}
