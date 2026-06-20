"use client";

import { useState, useTransition } from "react";
import { addAlbumToLibrary, rateAlbumAction, removeFromLibrary } from "@/app/actions";

// "Listened" is not in the list — rating auto-sets that status
const STATUSES = [
  ["LISTENING", "Listening now"],
  ["WANT", "Want to listen"],
] as const;

interface Props {
  mbid: string;
  albumTitle: string;
  artistName: string;
  releaseYear?: number;
  coverUrl?: string;
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
  isLoggedIn,
  initialStatus,
  initialRating,
}: Props) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [rating, setRating] = useState(initialRating ?? 5.0);
  const [isPending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <a href="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        Sign in to add to library
      </a>
    );
  }

  const handleStatus = (newStatus: string) => {
    startTransition(async () => {
      await addAlbumToLibrary(mbid, albumTitle, artistName, newStatus, releaseYear, coverUrl);
    });
    setStatus(newStatus);
  };

  const handleRate = () => {
    startTransition(async () => {
      await rateAlbumAction(mbid, albumTitle, artistName, rating, releaseYear, coverUrl);
    });
    setStatus("LISTENED");
  };

  const handleRemove = () => {
    startTransition(async () => {
      await removeFromLibrary(mbid);
    });
    setStatus(null);
  };

  return (
    <div>
      {/* Status buttons — no Listened (rating handles that) */}
      <div className="flex flex-col gap-1.5 mb-5">
        {STATUSES.map(([s, label]) => (
          <button
            key={s}
            onClick={() => handleStatus(s)}
            disabled={isPending}
            className={`px-3 py-2 text-sm rounded text-left transition-colors disabled:opacity-40 ${
              status === s
                ? "bg-zinc-600 text-zinc-100"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
        {/* Show Listened as read-only if set via rating */}
        {status === "LISTENED" && (
          <div className="px-3 py-2 text-sm rounded bg-zinc-600 text-zinc-100">
            Listened ✓
          </div>
        )}
        {status && (
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="text-xs text-zinc-700 hover:text-zinc-500 text-left mt-0.5 transition-colors"
          >
            Remove from library
          </button>
        )}
      </div>

      {/* Rating — saving auto-marks as Listened */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-zinc-500 uppercase tracking-widest">Rating</span>
          <span className="text-sm font-semibold text-zinc-200 tabular-nums">
            {rating.toFixed(1)}
            <span className="text-zinc-600 text-xs font-normal"> /10</span>
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="10"
          step="0.1"
          value={rating}
          onChange={(e) => setRating(parseFloat(e.target.value))}
          className="w-full accent-zinc-400 cursor-pointer"
        />
        <button
          onClick={handleRate}
          disabled={isPending}
          className="mt-2.5 text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save rating → Listened"}
        </button>
      </div>
    </div>
  );
}
