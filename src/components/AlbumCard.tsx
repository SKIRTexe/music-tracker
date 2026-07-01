"use client";

import { useState, useRef, useEffect, useTransition, forwardRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addAlbumToLibrary, rateAlbumAction } from "@/app/actions";
import type { MBAlbum } from "@/lib/musicbrainz";

const MENU_W = 192;
const MENU_H = 220;
// Approximate height of the sticky search banner (navbar 48px + search bar ~60px)
const HEADER_H = 108;

// ── Placeholder ────────────────────────────────────────────────────────────────

function Placeholder({ title }: { title: string }) {
  return (
    <div className="w-full h-full bg-zinc-800 flex items-center justify-center p-3">
      <span className="text-zinc-500 text-xs text-center leading-snug line-clamp-3">{title}</span>
    </div>
  );
}

// ── Long-press mini popup ──────────────────────────────────────────────────────

const LongPressMenu = forwardRef<
  HTMLDivElement,
  {
    album: MBAlbum;
    artist: string;
    year: string | null;
    artworkUrl: string | null;
    initialTop: number;
    initialLeft: number;
    isLoggedIn: boolean;
    isPending: boolean;
    ratingValue: number;
    onRatingChange: (v: number) => void;
    onAdd: (status: string) => void;
    onRate: () => void;
    onClose: () => void;
  }
>(function LongPressMenu(
  { album, artist, isLoggedIn, isPending, ratingValue, onRatingChange, onAdd, onRate, onClose, initialTop, initialLeft },
  ref
) {
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div
        ref={ref}
        className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-4 w-48"
        style={{ top: initialTop, left: initialLeft }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium text-zinc-200 line-clamp-1 leading-snug">
          {album.title}
        </p>
        <p className="text-[11px] text-zinc-600 truncate mb-3">{artist}</p>

        {isLoggedIn ? (
          <>
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
});

// ── Position helpers ───────────────────────────────────────────────────────────

function calcMenuPos(cardRect: DOMRect): { top: number; left: number } {
  const spaceRight = window.innerWidth - cardRect.right;
  const left =
    spaceRight >= MENU_W + 12
      ? cardRect.right + 8
      : cardRect.left - MENU_W - 8;
  const top = Math.min(
    Math.max(cardRect.top, HEADER_H + 8),
    window.innerHeight - MENU_H - 12
  );
  return { top, left };
}

// ── AlbumCard ──────────────────────────────────────────────────────────────────

export function AlbumCard({ album, isLoggedIn }: { album: MBAlbum; isLoggedIn: boolean }) {
  const artist = album["artist-credit"]?.[0]?.artist?.name ?? "Unknown Artist";
  const artistId = album["artist-credit"]?.[0]?.artist?.id;
  const year = album.date ? album.date.slice(0, 4) : null;
  const router = useRouter();

  const primaryUrl = album.coverUrl ?? `https://coverartarchive.org/release/${album.id}/front-250`;
  const [imgFailed, setImgFailed] = useState(false);

  // menuOpen drives whether the popup is mounted; position is managed imperatively
  const [menuOpen, setMenuOpen] = useState(false);
  const [initialPos, setInitialPos] = useState({ top: 0, left: 0 });
  const [ratingValue, setRatingValue] = useState(5.0);
  const [isPending, startTransition] = useTransition();

  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const didLongPress = useRef(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  // Imperatively reposition the menu on scroll — no React re-render, no lag
  const syncPosition = useCallback(() => {
    const card = cardRef.current;
    const menu = menuRef.current;
    if (!card || !menu) return;

    const rect = card.getBoundingClientRect();

    // Hide behind the sticky header
    if (rect.bottom < HEADER_H) {
      menu.style.visibility = "hidden";
      return;
    }
    menu.style.visibility = "visible";

    const { top, left } = calcMenuPos(rect);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(syncPosition);
    };

    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [menuOpen, syncPosition]);

  const startPress = (e: React.PointerEvent) => {
    if (menuOpen) return;
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      setInitialPos(calcMenuPos(rect));
      setMenuOpen(true);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
  };

  return (
    <>
      <div className="shrink-0 w-36 select-none">
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

        <p
          className="text-xs font-medium text-zinc-200 mt-2 line-clamp-1 cursor-pointer hover:text-zinc-100 transition-colors"
          onClick={() => router.push(`/album/${album.id}`)}
        >
          {album.title}
        </p>

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
        <div className="flex items-center gap-1.5 mt-0.5">
          {year && (
            <Link
              href={`/decade/${Math.floor(parseInt(year) / 10) * 10}s`}
              className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors tabular-nums"
              onClick={(e) => e.stopPropagation()}
            >
              {year}
            </Link>
          )}
          {album.releaseType === "single" && (
            <span className="text-[9px] px-1 py-px rounded bg-zinc-800 text-zinc-500 tracking-wide leading-none">
              Single
            </span>
          )}
        </div>
      </div>

      {menuOpen && (
        <LongPressMenu
          ref={menuRef}
          album={album}
          artist={artist}
          year={year}
          artworkUrl={imgFailed ? null : primaryUrl}
          initialTop={initialPos.top}
          initialLeft={initialPos.left}
          isLoggedIn={isLoggedIn}
          isPending={isPending}
          ratingValue={ratingValue}
          onRatingChange={setRatingValue}
          onAdd={handleAdd}
          onRate={handleRate}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
