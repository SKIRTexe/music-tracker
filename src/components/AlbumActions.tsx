"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveToLibrary, rateItem, removeFromLibrary, type LibraryItemInput } from "@/app/actions";
import { RankFlow, useRankingMode } from "@/components/RankFlow";

const STATUSES = [
  ["LISTENED", "Listened"],
  ["LISTENING", "Listening now"],
  ["WANT", "Want to listen"],
] as const;

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

  const handleRate = () => {
    setStatus("LISTENED");
    startTransition(async () => { await rateItem(item, rating); });
  };

  const handleRemove = () => {
    setStatus(null);
    startTransition(async () => { await removeFromLibrary(mbid); });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {STATUSES.map(([s, label]) => (
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
            {label}
          </button>
        ))}
      </div>

      {/* Saving a rating implies you listened to it. */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-zinc-500 uppercase tracking-widest">Your rating</span>
          {(!mode?.active || rated != null) && (
            <span className="text-sm font-semibold text-zinc-200 tabular-nums">
              {(mode?.active ? (rated as number) : rating).toFixed(1)}
              <span className="text-zinc-600 text-xs font-normal"> /10</span>
            </span>
          )}
        </div>

        {/* Comparison rating replaces the slider outright — see RankFlow. */}
        {!mode?.active && (
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={rating}
            onChange={(e) => setRating(parseFloat(e.target.value))}
            className="w-full h-6 accent-zinc-300 cursor-pointer"
          />
        )}

        <div className="flex items-center gap-3 mt-2.5">
          <button
            onClick={() => (mode?.active ? setFlowOpen(true) : handleRate())}
            disabled={isPending}
            className="text-xs px-3 py-1.5 bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors disabled:opacity-40"
          >
            {mode?.active
              ? rated != null
                ? "Rate again"
                : "Rate by comparison"
              : isPending
                ? "Saving…"
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
            setStatus("LISTENED");
          }}
        />
      )}
    </div>
  );
}
