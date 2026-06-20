"use client";

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addAlbumToLibrary, rateAlbumAction } from "@/app/actions";
import type { MBAlbum } from "@/lib/musicbrainz";

// ── Placeholder ────────────────────────────────────────────────────────────────

function Placeholder({ title }: { title: string }) {
  return (
    <div className="w-full h-full bg-zinc-800 flex items-center justify-center p-3">
      <span className="text-zinc-500 text-xs text-center leading-snug line-clamp-3">{title}</span>
    </div>
  );
}

// ── Long-press mini popup (no "Listened" — rating handles that) ────────────────

function LongPressMenu({
  album,
  artist,
  year,
  artworkUrl,
  anchorRect,
  isLoggedIn,
  isPending,
  ratingValue,
  onRatingChange,
  onAdd,
  onRate,
  onClose,
}: {
  album: MBAlbum;
  artist: string;
  year: string | null;
  artworkUrl: string | null;
  anchorRect: DOMRect;
  isLoggedIn: boolean;
  isPending: boolean;
  ratingValue: number;
  onRatingChange: (v: number) => void;
  onAdd: (status: string) => void;
  onRate: () => void;
  onClose: () => void;
}) {
  const menuWidth = 192;
  const menuHeight = 220;
  const spaceRight = window.innerWidth - anchorRect.right;
  const left =
    spaceRight >= menuWidth + 12
      ? anchorRect.right + 8
      : anchorRect.left - menuWidth - 8;
  const top = Math.min(anchorRect.top, window.innerHeight - menuHeight - 12);

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-4 w-48"
        style={{ top, left }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium text-zinc-200 line-clamp-1 leading-snug">
          {album.title}
        </p>
        <p className="text-[11px] text-zinc-600 truncate mb-3">{artist}</p>

        {isLoggedIn ? (
          <>
            {/* Status — no "Listened" (rating auto-sets that) */}
            <div className="flex flex-col gap-1 mb-3">
              {(
                [
                  ["LISTENING", "Listening now"],
                  ["WANT", "Want to listen"],
                ] as const
              ).map(([status, label]) => (
                <button
                  key={status}
                  disabled={isPending}
                  onClick={() => onAdd(status)}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="border-t border-zinc-800 pt-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] text-zinc-500">Rate</span>
                <span className="text-xs font-semibold text-zinc-200 tabular-nums">
                  {ratingValue.toFixed(1)}
                  <span className="text-zinc-700 font-normal">/10</span>
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={ratingValue}
                onChange={(e) => onRatingChange(parseFloat(e.target.value))}
                className="w-full accent-zinc-400 cursor-pointer"
              />
              <button
                onClick={onRate}
                disabled={isPending}
                className="mt-2 w-full text-[11px] py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors disabled:opacity-40"
              >
                {isPending ? "Saving…" : "Save rating → Listened"}
              </button>
            </div>
          </>
        ) : (
          <a
            href="/login"
            className="block w-full text-center text-xs py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
          >
            Sign in to add
          </a>
        )}
      </div>
    </>
  );
}

// ── AlbumCard ──────────────────────────────────────────────────────────────────

export function AlbumCard({ album, isLoggedIn }: { album: MBAlbum; isLoggedIn: boolean }) {
  const artist = album["artist-credit"]?.[0]?.artist?.name ?? "Unknown Artist";
  const artistId = album["artist-credit"]?.[0]?.artist?.id;
  const year = album.date ? album.date.slice(0, 4) : null;
  const router = useRouter();

  // Use pre-resolved iTunes URL if available (fast CDN), else fall back to CAA
  const primaryUrl = album.coverUrl ?? `https://coverartarchive.org/release/${album.id}/front-250`;
  const [imgFailed, setImgFailed] = useState(false);

  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [ratingValue, setRatingValue] = useState(5.0);
  const [isPending, startTransition] = useTransition();

  const cardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  const startPress = (e: React.PointerEvent) => {
    if (menuRect) return;
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      const rect = cardRef.current?.getBoundingClientRect() ?? null;
      setMenuRect(rect);
    }, 550);
  };

  const movePress = (e: React.PointerEvent) => {
    if (!pressOrigin.current) return;
    if (Math.abs(e.clientX - pressOrigin.current.x) > 8) {
      if (timerRef.current) clearTimeout(timerRef.current);
      pressOrigin.current = null;
    }
  };

  const endPress = (e: React.PointerEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!pressOrigin.current) return;
    const dx = Math.abs(e.clientX - pressOrigin.current.x);
    const dy = Math.abs(e.clientY - pressOrigin.current.y);
    pressOrigin.current = null;
    if (dx > 8 || dy > 8) return;
    if (!didLongPress.current) router.push(`/album/${album.id}`);
  };

  const cancelPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pressOrigin.current = null;
  };

  const handleAdd = (status: string) => {
    startTransition(async () => {
      await addAlbumToLibrary(
        album.id, album.title, artist, status,
        year ? parseInt(year) : undefined,
        imgFailed ? undefined : primaryUrl,
        artistId ?? undefined
      );
    });
    setMenuRect(null);
  };

  const handleRate = () => {
    startTransition(async () => {
      await rateAlbumAction(
        album.id, album.title, artist, ratingValue,
        year ? parseInt(year) : undefined,
        imgFailed ? undefined : primaryUrl,
        artistId ?? undefined
      );
    });
    setMenuRect(null);
  };

  return (
    <>
      <div className="shrink-0 w-36 select-none">
        {/* Image — handles album navigation and long-press menu */}
        <div
          ref={cardRef}
          className="aspect-square rounded-lg overflow-hidden bg-zinc-800 cursor-pointer"
          onPointerDown={startPress}
          onPointerMove={movePress}
          onPointerUp={endPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryUrl}
              alt={album.title}
              draggable={false}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <Placeholder title={album.title} />
          )}
        </div>

        {/* Title — click goes to album page */}
        <p
          className="text-xs font-medium text-zinc-200 mt-2 line-clamp-1 cursor-pointer hover:text-zinc-100 transition-colors"
          onClick={() => router.push(`/album/${album.id}`)}
        >
          {album.title}
        </p>

        {/* Artist — link to artist page */}
        {artistId ? (
          <Link
            href={`/artist/${artistId}`}
            className="text-xs text-zinc-500 truncate block hover:text-zinc-300 transition-colors"
          >
            {artist}
          </Link>
        ) : (
          <p className="text-xs text-zinc-500 truncate">{artist}</p>
        )}
        {year && <p className="text-[10px] text-zinc-700 mt-0.5 tabular-nums">{year}</p>}
      </div>

      {menuRect && (
        <LongPressMenu
          album={album}
          artist={artist}
          year={year}
          artworkUrl={imgFailed ? null : primaryUrl}
          anchorRect={menuRect}
          isLoggedIn={isLoggedIn}
          isPending={isPending}
          ratingValue={ratingValue}
          onRatingChange={setRatingValue}
          onAdd={handleAdd}
          onRate={handleRate}
          onClose={() => setMenuRect(null)}
        />
      )}
    </>
  );
}
