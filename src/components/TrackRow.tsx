"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { RatePopover } from "@/components/RatePopover";
import { STATUS_LABELS } from "@/lib/statuses";
import { RankFlow } from "@/components/RankFlow";
import type { LibraryItemInput } from "@/app/actions";
import type { ExistingEntry } from "@/lib/library";
import type { CatalogTrack } from "@/lib/catalog";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = String(totalSec % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

/** One row of an album tracklist, individually rateable. */
export function TrackRow({
  track,
  index,
  albumTitle,
  artistName,
  artistMbid,
  releaseYear,
  coverUrl,
  isLoggedIn,
  existing,
}: {
  track: CatalogTrack;
  index: number;
  albumTitle: string;
  artistName: string;
  artistMbid?: string;
  releaseYear?: number;
  coverUrl?: string;
  isLoggedIn: boolean;
  existing: ExistingEntry | null;
}) {
  const [saved, setSaved] = useState<ExistingEntry | null>(existing);
  const [open, setOpen] = useState(false);
  // Owned by the row, not the popover — see ResultCard for why.
  const [flowOpen, setFlowOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A Spotify track id is the library key for a song.
  const mbid = track.id;

  const item: LibraryItemInput = {
    mbid: mbid ?? "",
    itemType: "SONG",
    title: track.title,
    artistName,
    parentAlbum: albumTitle,
    releaseYear,
    coverUrl,
    artistMbid,
  };

  return (
    <div
      ref={wrapRef}
      className="group relative flex items-center justify-between py-2.5 border-b border-zinc-800/50"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs text-zinc-700 w-5 text-right shrink-0 tabular-nums">
          {track.number ?? index + 1}
        </span>
        <span className="text-sm text-zinc-300 truncate">{track.title}</span>
        {saved?.rating != null && (
          <span className="text-[11px] font-semibold text-zinc-300 tabular-nums shrink-0">
            {saved.rating.toFixed(1)}
          </span>
        )}
        {saved && saved.rating == null && (
          <span className="text-[10px] text-zinc-600 shrink-0">
            {STATUS_LABELS[saved.status]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        {track.length && (
          <span className="text-xs text-zinc-600 tabular-nums">
            {formatDuration(track.length)}
          </span>
        )}

        {!mbid ? null : isLoggedIn ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={saved ? `Edit rating for ${track.title}` : `Rate ${track.title}`}
            className={`w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-xs transition-all ${
              saved
                ? "bg-zinc-100 text-zinc-900"
                : "bg-zinc-800 text-zinc-300 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus:opacity-100 hover:bg-zinc-700"
            } ${open ? "opacity-100" : ""}`}
          >
            {saved ? "✓" : "+"}
          </button>
        ) : (
          <Link
            href="/login"
            aria-label="Sign in to rate"
            className="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-300 text-xs can-hover:opacity-0 can-hover:group-hover:opacity-100 hover:bg-zinc-700 transition-all"
          >
            +
          </Link>
        )}
      </div>

      {open && mbid && (
        <RatePopover
          item={item}
          saved={saved}
          onSaved={setSaved}
          onClose={() => setOpen(false)}
          onPromptRate={() => setFlowOpen(true)}
          className="absolute right-0 top-8"
        />
      )}

      {flowOpen && (
        <RankFlow
          item={item}
          onClose={() => setFlowOpen(false)}
          onRated={(rating) => setSaved({ status: "LISTENED", rating })}
        />
      )}
    </div>
  );
}
