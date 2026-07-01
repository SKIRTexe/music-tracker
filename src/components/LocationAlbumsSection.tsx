"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { LazyLocationAlbumCarousel } from "@/components/LazyLocationCarousel";
import { AlbumCard } from "@/components/AlbumCard";
import { ArtistCard } from "@/components/ArtistCard";
import type { MBAlbum, MBArtist } from "@/lib/musicbrainz";

const DEFAULT_GENRES = [
  { label: "Rock",       tag: "rock" },
  { label: "Jazz",       tag: "jazz" },
  { label: "Electronic", tag: "electronic" },
  { label: "Hip-Hop",    tag: "hip-hop" },
  { label: "Pop",        tag: "pop" },
  { label: "Soul",       tag: "soul" },
  { label: "Folk",       tag: "folk" },
  { label: "Metal",      tag: "metal" },
];

const INITIAL_GENRE_COUNT = 8;

interface Genre { label: string; tag: string }
interface SearchResults { albums: MBAlbum[]; artists: MBArtist[] }

export function LocationAlbumsSection({
  slug,
  countryParam,
  isLoggedIn,
  displayName,
}: {
  slug: string;
  countryParam: string;   // "" or "&country=1"
  isLoggedIn: boolean;
  displayName: string;
}) {
  const [genres, setGenres] = useState<Genre[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCountryFlag = countryParam === "&country=1" ? "1" : "0";
  const encodedSlug = encodeURIComponent(slug);

  // Fetch location genres on mount
  useEffect(() => {
    fetch(`/api/location-genres?slug=${encodedSlug}&country=${isCountryFlag}&limit=20`)
      .then((r) => r.json())
      .then((d) => {
        const list: Genre[] = d.genres ?? [];
        setGenres(list.length > 0 ? list : DEFAULT_GENRES);
      })
      .catch(() => setGenres(DEFAULT_GENRES));
  }, [encodedSlug, isCountryFlag]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/location-search?slug=${encodedSlug}&country=${isCountryFlag}&q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((d) => { setResults(d); setSearching(false); })
        .catch(() => { setResults({ albums: [], artists: [] }); setSearching(false); });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, encodedSlug, isCountryFlag]);

  const visibleGenres = genres
    ? (showAll ? genres : genres.slice(0, INITIAL_GENRE_COUNT))
    : [];
  const hiddenCount = genres ? Math.max(0, genres.length - INITIAL_GENRE_COUNT) : 0;

  // Genre filter for search mode — genres whose label matches the query
  const matchingGenres = (genres ?? []).filter((g) =>
    g.label.toLowerCase().includes(query.toLowerCase()) ||
    g.tag.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-8">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          width="13" height="13" viewBox="0 0 20 20" fill="none"
        >
          <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
          <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search genres, albums, and artists from ${displayName}…`}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Search results mode */}
      {query.trim() ? (
        <div>
          {/* Matching genre carousels */}
          {matchingGenres.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-6">Genres</p>
              {matchingGenres.map(({ label, tag }) => (
                <LazyLocationAlbumCarousel
                  key={tag}
                  title={label}
                  fetchUrl={`/api/location-albums?slug=${encodedSlug}${countryParam}&genre=${encodeURIComponent(tag)}`}
                  isLoggedIn={isLoggedIn}
                  href={`/genre/${encodeURIComponent(tag)}`}
                  tag={tag}
                />
              ))}
            </div>
          )}

          {/* Artist results */}
          {searching ? (
            <p className="text-xs text-zinc-600 py-4">Searching…</p>
          ) : results ? (
            <>
              {results.artists.length > 0 && (
                <section className="mb-10">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-4">Artists</p>
                  <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {results.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}
                  </div>
                </section>
              )}

              {results.albums.length > 0 && (
                <section className="mb-10">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-4">Albums</p>
                  <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {results.albums.map((a) => <AlbumCard key={a.id} album={a} isLoggedIn={isLoggedIn} />)}
                  </div>
                </section>
              )}

              {results.artists.length === 0 && results.albums.length === 0 && matchingGenres.length === 0 && (
                <p className="text-xs text-zinc-600 py-4">No results from {displayName} for "{query}"</p>
              )}
            </>
          ) : null}
        </div>
      ) : (
        /* Genre carousels mode */
        <>
          {!genres ? (
            <p className="text-xs text-zinc-600 py-4">Loading genres…</p>
          ) : (
            <>
              {visibleGenres.map(({ label, tag }) => (
                <LazyLocationAlbumCarousel
                  key={tag}
                  title={label}
                  fetchUrl={`/api/location-albums?slug=${encodedSlug}${countryParam}&genre=${encodeURIComponent(tag)}`}
                  isLoggedIn={isLoggedIn}
                  href={`/genre/${encodeURIComponent(tag)}`}
                  tag={tag}
                />
              ))}

              {!showAll && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600 rounded-lg px-4 py-2 transition-colors mt-2 mb-8"
                >
                  Show {hiddenCount} more genre{hiddenCount !== 1 ? "s" : ""}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
