"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { ResultCard, type ExistingEntry } from "@/components/ResultCard";
import { popularityKey } from "@/lib/popularity-key";
import type { SearchItem } from "@/lib/catalog";

/**
 * An artist's records, in an order you choose.
 *
 * The app's control, ported: three fields and a direction rather than six flat
 * options, so pressing the field you are already on flips it and the chevron
 * says which way it points. The label doubles as the readout — a bare filter
 * glyph in the corner of a page full of cover art proved easy to miss entirely.
 *
 * Client-side because it is pure reordering of data the page already holds.
 * Sending it back to the server would cost a round trip and a Spotify call to
 * change the order of a list already on screen.
 */

type Field = "date" | "popularity" | "length";

const FIELDS: { key: Field; label: string; short: string }[] = [
  { key: "date", label: "Release Date", short: "Date" },
  { key: "popularity", label: "Popularity", short: "Popular" },
  { key: "length", label: "Length", short: "Length" },
];

/**
 * Oldest-first for a discography, because that is the order a body of work is
 * usually read in — and the order this page already used. The other two lead
 * with the biggest: "least followed" and "shortest" are not what anyone opens
 * a menu looking for.
 */
const OPENS_ASCENDING: Record<Field, boolean> = {
  date: true,
  popularity: false,
  length: false,
};

export function Discography({
  albums,
  popularity,
  isLoggedIn,
  existing,
}: {
  albums: SearchItem[];
  popularity: Record<string, number>;
  isLoggedIn: boolean;
  existing: Record<string, ExistingEntry>;
}) {
  const [field, setField] = useState<Field>("date");
  const [ascending, setAscending] = useState(true);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Where each record places by following, ranked against the albums on *this
   * page* rather than everything Deezer knows — so "#1" means "their biggest of
   * these", which is the claim the page can actually support.
   *
   * Taken from the unsorted set, so a place means the same thing whichever
   * order the grid is in.
   */
  const places = useMemo(() => {
    const ranked = albums
      .map((a) => [popularityKey(a.title), popularity[popularityKey(a.title)]] as const)
      .filter((pair): pair is readonly [string, number] => typeof pair[1] === "number")
      .sort((a, b) => b[1] - a[1]);
    return new Map(ranked.map(([k], i) => [k, i + 1]));
  }, [albums, popularity]);

  const ordered = useMemo(() => {
    const rank = (album: SearchItem): number | null => {
      if (field === "popularity") return popularity[popularityKey(album.title)] ?? null;
      if (field === "length") return album.totalTracks ?? null;
      // The full date where Spotify gives one, so two records from the same year
      // keep their real order; the year alone as the fallback.
      const raw = album.releaseDate ?? album.year;
      if (!raw) return null;
      const [y, m, d] = `${raw}-01-01`.split("-");
      return Number(y) * 10000 + Number(m) * 100 + Number(d);
    };

    return [...albums].sort((lhs, rhs) => {
      const a = rank(lhs);
      const b = rank(rhs);
      // Records missing the sorted fact go last in *both* directions. One with
      // no follower count is not the least followed, and one with no track
      // count is not the shortest — the rule the library uses for unrated rows.
      if (a == null && b == null) return lhs.title.localeCompare(rhs.title);
      if (a == null) return 1;
      if (b == null) return -1;
      if (a === b) return lhs.title.localeCompare(rhs.title);
      return ascending ? a - b : b - a;
    });
  }, [albums, popularity, field, ascending]);

  /** The fact being sorted on, in place of the artist's name. */
  const caption = (album: SearchItem): string | undefined => {
    if (field !== "length") return album.year ?? undefined;
    if (album.totalTracks == null) return "—";
    return album.totalTracks === 1 ? "1 track" : `${album.totalTracks} tracks`;
  };

  const current = FIELDS.find((f) => f.key === field)!;

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest">
          Discography
          <span className="ml-2 text-zinc-700 tabular-nums">{albums.length}</span>
        </h2>

        {albums.length > 1 && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900/70 backdrop-blur ring-1 ring-inset ring-white/10 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:ring-white/20 transition"
            >
              <FilterIcon />
              {current.short}
              <span aria-hidden className="text-[9px]">{ascending ? "▲" : "▼"}</span>
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl bg-zinc-900/95 backdrop-blur-md ring-1 ring-inset ring-white/10 shadow-xl shadow-black/50 p-1"
              >
                {FIELDS.map((f) => {
                  const active = f.key === field;
                  return (
                    <button
                      key={f.key}
                      role="menuitem"
                      onClick={() => {
                        // Re-pressing the current field flips it: that is where
                        // the "up and down" lives, with no second control.
                        if (active) setAscending((a) => !a);
                        else {
                          setField(f.key);
                          setAscending(OPENS_ASCENDING[f.key]);
                        }
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs text-left transition-colors ${
                        active ? "text-brand-500 bg-white/5" : "text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      {f.label}
                      {active && (
                        <span aria-hidden className="text-[9px]">{ascending ? "▲" : "▼"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {popularity && Object.keys(popularity).length > 0 && (
        <p className="text-[10px] text-zinc-600 mb-3">
          #1 is this artist&rsquo;s most-followed record here.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
        {ordered.map((album) => (
          <ResultCard
            key={album.id}
            item={album}
            isLoggedIn={isLoggedIn}
            existing={existing[album.id] ?? null}
            place={places.get(popularityKey(album.title))}
            caption={caption(album)}
          />
        ))}
      </div>
    </section>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="w-3.5 h-3.5 fill-current">
      <rect x="2" y="3.5" width="12" height="1.6" rx="0.8" />
      <rect x="4" y="7.2" width="8" height="1.6" rx="0.8" />
      <rect x="6" y="10.9" width="4" height="1.6" rx="0.8" />
    </svg>
  );
}
