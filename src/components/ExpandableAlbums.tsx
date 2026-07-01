"use client";

import React, { useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import type { MBAlbum } from "@/lib/musicbrainz";

type Sort = "recommended" | "newest" | "oldest";

const SORT_LABELS: Record<Sort, string> = {
  recommended: "Recommended",
  newest: "Newest",
  oldest: "Oldest",
};

function sortAlbums(albums: MBAlbum[], sort: Sort): MBAlbum[] {
  if (sort === "newest") return [...albums].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (sort === "oldest") return [...albums].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return albums;
}

function DiscographyTimeline({ albums, isLoggedIn }: { albums: MBAlbum[]; isLoggedIn: boolean }) {
  // Group albums in current order by year, preserving sort direction
  const groups: { year: string; items: MBAlbum[] }[] = [];
  const byYear = new Map<string, MBAlbum[]>();
  for (const album of albums) {
    const year = album.date?.slice(0, 4) ?? "Unknown";
    if (!byYear.has(year)) {
      byYear.set(year, []);
      groups.push({ year, items: byYear.get(year)! });
    }
    byYear.get(year)!.push(album);
  }

  return (
    <div className="grid grid-cols-[3.5rem_1.25rem_1fr] gap-x-4">
      {groups.map(({ year, items }, idx) => (
        <React.Fragment key={year}>
          {/* Year label */}
          <div className="text-right pt-0.5 pb-8">
            <span className="text-xs font-semibold text-zinc-400 tabular-nums tracking-wide">
              {year === "Unknown" ? "—" : year}
            </span>
          </div>

          {/* Dot + connecting line to next year */}
          <div className="flex flex-col items-center">
            <div className="mt-1 w-2.5 h-2.5 rounded-full bg-zinc-600 ring-[3px] ring-zinc-950 shrink-0" />
            {idx < groups.length - 1 && (
              <div className="flex-1 w-px bg-zinc-800 mt-1.5" />
            )}
          </div>

          {/* Albums for this year */}
          <div className="flex flex-wrap gap-4 pb-8">
            {items.map((album) => (
              <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

type ReleaseFilter = "albums" | "singles" | "both";

export function ExpandableAlbums({
  title,
  albums,
  artistMbid,
  isLoggedIn,
}: {
  title: string;
  albums: MBAlbum[];
  artistMbid?: string;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<Sort>("recommended");
  const [filter, setFilter] = useState<ReleaseFilter>("albums");
  const [singles, setSingles] = useState<MBAlbum[] | null>(null);
  const [loadingSingles, setLoadingSingles] = useState(false);
  const [search, setSearch] = useState("");

  const fetchSingles = async () => {
    if (singles !== null || !artistMbid) return;
    setLoadingSingles(true);
    try {
      const res = await fetch(`/api/artist-singles?mbid=${encodeURIComponent(artistMbid)}`);
      const data = await res.json();
      setSingles(data.singles ?? []);
    } catch {
      setSingles([]);
    } finally {
      setLoadingSingles(false);
    }
  };

  const handleFilter = (f: ReleaseFilter) => {
    setFilter(f);
    if (f === "singles" || f === "both") fetchSingles();
  };

  const resolvedSingles = singles ?? [];
  const combined =
    filter === "albums" ? albums :
    filter === "singles" ? resolvedSingles :
    [...albums, ...resolvedSingles];

  if (albums.length === 0) return null;

  const sorted = sortAlbums(combined, sort);
  const filtered = search.trim()
    ? sorted.filter((a) =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        (a.date?.slice(0, 4) ?? "").includes(search.trim())
      )
    : sorted;
  const isTimeline = sort === "newest" || sort === "oldest";

  const filterTabs = artistMbid ? (
    <div className="flex border border-zinc-800 rounded overflow-hidden text-xs">
      {(["albums", "singles", "both"] as ReleaseFilter[]).map((f, i) => (
        <button
          key={f}
          onClick={() => handleFilter(f)}
          className={`px-3 py-1.5 capitalize transition-colors ${
            filter === f ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          } ${i !== 0 ? "border-l border-zinc-800" : ""}`}
        >
          {f}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <section className="mb-10">
      {/* Search bar */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          width="12" height="12" viewBox="0 0 20 20" fill="none"
        >
          <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
          <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search discography…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-8 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Header: clickable title + filter tabs + sort tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
          >
            {title} →
          </button>
          {filterTabs}
        </div>
        <div className="flex border border-zinc-800 rounded overflow-hidden text-xs">
          {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 transition-colors ${
                sort === s ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              } ${s !== "recommended" ? "border-l border-zinc-800" : ""}`}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Carousel */}
      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loadingSingles ? (
          <p className="text-xs text-zinc-600 py-4">Loading singles…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-zinc-600 py-4">No results.</p>
        ) : (
          filtered.slice(0, search ? filtered.length : 10).map((album) => (
            <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
          ))
        )}
      </div>

      {/* Full popup */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-4 md:inset-10 z-50 bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0 gap-4">
              <div className="flex items-center gap-4 shrink-0">
                <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
                {filterTabs}
              </div>
              {/* Search inside popup */}
              <div className="relative flex-1 max-w-xs">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                  width="12" height="12" viewBox="0 0 20 20" fill="none"
                >
                  <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex border border-zinc-800 rounded overflow-hidden text-xs">
                  {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSort(s)}
                      className={`px-3 py-1.5 transition-colors ${
                        sort === s ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                      } ${s !== "recommended" ? "border-l border-zinc-800" : ""}`}
                    >
                      {SORT_LABELS[s]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {filtered.length === 0 ? (
                <p className="text-xs text-zinc-600 py-4">No results.</p>
              ) : isTimeline ? (
                <DiscographyTimeline albums={filtered} isLoggedIn={isLoggedIn} />
              ) : (
                <div className="flex flex-wrap gap-4">
                  {filtered.map((album) => (
                    <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
