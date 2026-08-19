"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { saveToLibrary, rateItem, type LibraryItemInput } from "@/app/actions";
import type { SearchItem } from "@/lib/search";

const STATUS_LABELS: Record<string, string> = {
  LISTENED: "Listened",
  LISTENING: "Listening",
  WANT: "Want to listen",
};

export type ExistingEntry = { status: string; rating: number | null };

export function ResultCard({
  item,
  isLoggedIn,
  existing,
}: {
  item: SearchItem;
  isLoggedIn: boolean;
  existing?: ExistingEntry | null;
}) {
  const isSong = item.itemType === "SONG";

  // Cover art: try Cover Art Archive, then fall back to an iTunes lookup, then to a
  // text placeholder. The iTunes call only fires for covers CAA is missing.
  const [src, setSrc] = useState<string | null>(item.coverArtUrl);
  const [triedItunes, setTriedItunes] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState<ExistingEntry | null>(existing ?? null);
  const [rating, setRating] = useState(existing?.rating ?? 7.0);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleImageError = async () => {
    if (triedItunes) { setSrc(null); return; }
    setTriedItunes(true);
    try {
      const params = new URLSearchParams({ title: item.title, artist: item.artistName });
      const res = await fetch(`/api/artwork?${params.toString()}`);
      const data = await res.json();
      setSrc(data.url ?? null);
    } catch {
      setSrc(null);
    }
  };

  const payload = (): LibraryItemInput => ({
    mbid: item.id,
    itemType: item.itemType,
    title: item.title,
    artistName: item.artistName,
    parentAlbum: item.parentAlbum,
    releaseYear: item.year ? parseInt(item.year) : undefined,
    coverUrl: src ?? undefined,
    artistMbid: item.artistMbid,
  });

  const handleStatus = (status: string) => {
    setSaved({ status, rating: saved?.rating ?? null });
    setMenuOpen(false);
    startTransition(async () => { await saveToLibrary(payload(), status); });
  };

  const handleRate = () => {
    setSaved({ status: "LISTENED", rating });
    setMenuOpen(false);
    startTransition(async () => { await rateItem(payload(), rating); });
  };

  const triggerClass = saved
    ? "bg-zinc-100 text-zinc-900"
    : "bg-zinc-950/80 text-zinc-200 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-zinc-800";

  const cover = (
    <div className="aspect-square rounded-lg overflow-hidden bg-zinc-800">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={item.title}
          loading="lazy"
          onError={handleImageError}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-3">
          <span className="text-zinc-500 text-xs text-center leading-snug line-clamp-3">
            {item.title}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div ref={wrapRef} className="group relative">
      {item.detailId ? (
        <Link href={`/album/${item.detailId}`} className="block hover:opacity-80 transition-opacity">
          {cover}
        </Link>
      ) : (
        cover
      )}

      {/* Add / rate trigger */}
      {isLoggedIn ? (
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={saved ? "Edit library entry" : "Add to library"}
          className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full text-sm transition-all ${triggerClass} ${menuOpen ? "opacity-100" : ""}`}
        >
          {saved ? "✓" : "+"}
        </button>
      ) : (
        <Link
          href="/login"
          aria-label="Sign in to add"
          className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 text-sm opacity-0 group-hover:opacity-100 hover:bg-zinc-800 transition-all"
        >
          +
        </Link>
      )}

      {/* Title + meta */}
      <div className="mt-2">
        <p className="text-xs font-medium text-zinc-200 line-clamp-1" title={item.title}>
          {item.title}
        </p>
        <p className="text-xs text-zinc-500 truncate" title={item.artistName}>
          {item.artistName}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isSong && (
            <span className="text-[9px] px-1 py-px rounded bg-zinc-800 text-zinc-400 tracking-wide leading-none">
              Song
            </span>
          )}
          {item.year && <span className="text-[10px] text-zinc-600 tabular-nums">{item.year}</span>}
          {saved?.rating != null && (
            <span className="text-[10px] font-semibold text-zinc-300 tabular-nums">
              {saved.rating.toFixed(1)}
            </span>
          )}
          {saved && saved.rating == null && (
            <span className="text-[10px] text-zinc-500">{STATUS_LABELS[saved.status]}</span>
          )}
        </div>
      </div>

      {/* Popover */}
      {menuOpen && (
        <div className="absolute z-30 top-9 right-1.5 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3">
          <div className="flex flex-col gap-1 mb-3">
            {(["LISTENED", "LISTENING", "WANT"] as const).map((s) => (
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
              step="0.5"
              value={rating}
              onChange={(e) => setRating(parseFloat(e.target.value))}
              className="w-full accent-zinc-300 cursor-pointer"
            />
            <button
              onClick={handleRate}
              disabled={isPending}
              className="mt-2 w-full text-[11px] py-1.5 bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save rating"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
