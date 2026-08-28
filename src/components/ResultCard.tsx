"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { LibraryItemInput } from "@/lib/library-write";
import { RatePopover } from "@/components/RatePopover";
import { ScoreBadge, StatusMarker, PlaceBadge, CoverTag } from "@/components/Badges";
import { RankFlow } from "@/components/RankFlow";
import type { SearchItem } from "@/lib/catalog";

// Hold a cover to open the rate popover without leaving the page. Matches the
// original gesture: 550ms, cancelled if the pointer moves more than 8px (so
// scrolling and dragging don't trigger it).
const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE = 8;

// Type-only import, so the server-side prisma module is never pulled into the bundle.
import type { ExistingEntry } from "@/lib/library";
export type { ExistingEntry };

export function ResultCard({
  item,
  isLoggedIn,
  existing,
  place,
  caption,
}: {
  item: SearchItem;
  isLoggedIn: boolean;
  existing?: ExistingEntry | null;
  /** Where this record places among the artist's, by following. 1 is biggest. */
  place?: number;
  /** Replaces the artist line — a discography repeats one artist on every card. */
  caption?: string;
}) {
  const isSong = item.itemType === "SONG";

  // Spotify includes cover art in the search response, so a missing image just
  // falls back to the title placeholder — no second lookup needed.
  const [src, setSrc] = useState<string | null>(item.coverArtUrl);

  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState<ExistingEntry | null>(existing ?? null);
  // Owned by the card, not the popover: the prompt portals outside the card ref,
  // so the outside-press handler that closes the menu must not take it with it.
  const [flowOpen, setFlowOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const didLongPress = useRef(false);
  const pointerKind = useRef<string>("mouse");

  // Close the popover on outside press or Escape. Listens for pointerdown rather
  // than mousedown so a tap outside closes it on touch devices too.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Don't leave a timer running if the card unmounts mid-press.
  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    };
  }, []);

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  };

  const startPress = (e: React.PointerEvent) => {
    pointerKind.current = e.pointerType;
    // Reset before the guards below: on touch a completed long press doesn't
    // always emit a click, and a stale flag would swallow the next tap.
    didLongPress.current = false;
    // Only the primary button arms the gesture — right-click should stay a
    // right-click, and the popover has its own controls once open.
    if (menuOpen || !isLoggedIn || e.button !== 0) return;
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      pressOrigin.current = null;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  };

  const movePress = (e: React.PointerEvent) => {
    const origin = pressOrigin.current;
    if (!origin) return;
    const moved =
      Math.abs(e.clientX - origin.x) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - origin.y) > MOVE_TOLERANCE;
    if (moved) clearPress();
  };

  // A completed long press must not also follow the link.
  const suppressClickAfterPress = (e: React.MouseEvent) => {
    if (didLongPress.current) {
      e.preventDefault();
      didLongPress.current = false;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // On touch, the native long-press menu would fight the gesture. On mouse,
    // leave right-click alone so "open in new tab" still works.
    if (pointerKind.current !== "mouse") e.preventDefault();
  };

  const handleImageError = () => setSrc(null);

  const payload = (): LibraryItemInput => ({
    mbid: item.id,
    itemType: item.itemType,
    title: item.title,
    artistName: item.artistName,
    parentAlbum: item.parentAlbum,
    releaseYear: item.year ? parseInt(item.year) : undefined,
    coverUrl: src ?? undefined,
    artistMbid: item.artistId,
  });

  // Visible by default so it exists on touch; only pointer devices hide it until
  // hover. A saved card shows the app's badge rather than a tick — the badge is
  // the trigger, so the cover carries the score and the control at once instead
  // of stacking two round things in the same corner.
  const unsavedTrigger =
    "w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-sm bg-zinc-950/80 text-zinc-200 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus:opacity-100 hover:bg-zinc-800";

  const cover = (
    <div className="aspect-square rounded-lg overflow-hidden bg-zinc-800 relative">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={item.title}
          loading="lazy"
          draggable={false}
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

      {/* A place where a discography shows one, otherwise the song marker. Never
          both: only albums are ranked and only songs are tagged, so they cannot
          collide. */}
      <div className="absolute bottom-1.5 left-1.5 pointer-events-none">
        {place != null ? <PlaceBadge place={place} /> : isSong ? <CoverTag text="Song" /> : null}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className="group relative">
      <div
        onPointerDown={startPress}
        onPointerMove={movePress}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        onContextMenu={handleContextMenu}
        className="select-none"
      >
        {item.detailId ? (
          <Link
            href={`/album/${item.detailId}`}
            onClick={suppressClickAfterPress}
            className="block hover:opacity-80 transition-opacity"
          >
            {cover}
          </Link>
        ) : (
          cover
        )}
      </div>

      {/* Add / rate trigger */}
      {isLoggedIn ? (
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={saved ? "Edit library entry" : "Add to library"}
          className={`absolute top-1 right-1 flex items-center justify-center transition-all ${
            saved ? "" : unsavedTrigger
          } ${menuOpen ? "opacity-100" : ""}`}
        >
          {saved?.rating != null ? (
            <ScoreBadge rating={saved.rating} compact />
          ) : saved ? (
            <StatusMarker status={saved.status as "LISTENED" | "WANT"} />
          ) : (
            "+"
          )}
        </button>
      ) : (
        <Link
          href="/login"
          aria-label="Sign in to add"
          className="absolute top-1 right-1 w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 text-sm can-hover:opacity-0 can-hover:group-hover:opacity-100 hover:bg-zinc-800 transition-all"
        >
          +
        </Link>
      )}

      {/* Title + meta */}
      <div className="mt-2">
        <p className="text-xs font-medium text-zinc-200 line-clamp-1" title={item.title}>
          {item.title}
        </p>
        <p className="text-xs text-zinc-500 truncate" title={caption ?? item.artistName}>
          {caption ?? item.artistName}
        </p>
        {/* The cover carries the score, the status and the song tag now, so
            repeating them here is noise. Only the year is left, and only when
            the line above is not already showing it. */}
        {caption == null && item.year && (
          <div className="mt-0.5">
            <span className="text-[10px] text-zinc-600 tabular-nums">{item.year}</span>
          </div>
        )}
      </div>

      {menuOpen && (
        <RatePopover
          item={payload()}
          saved={saved}
          onSaved={setSaved}
          onClose={() => setMenuOpen(false)}
          onPromptRate={() => setFlowOpen(true)}
          className="absolute top-9 right-1.5"
        />
      )}

      {flowOpen && (
        <RankFlow
          item={payload()}
          onClose={() => setFlowOpen(false)}
          onRated={(rating) => setSaved({ status: "LISTENED", rating })}
        />
      )}
    </div>
  );
}
