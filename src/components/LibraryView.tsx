"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { removeFromLibrary } from "@/app/actions";
import { LibraryItemCard, type LibraryEntry } from "@/components/LibraryItemCard";

export type { LibraryEntry };

import type { Status } from "@/lib/statuses";

type Filter = "ALL" | Status;
type Sort = "added_desc" | "added_asc" | "rating_desc" | "rating_asc" | "title_asc";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "LISTENED", label: "Listened" },
  { key: "WANT", label: "Want to Listen" },
];

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "added_desc", label: "Recently Added" },
  { value: "added_asc", label: "Oldest First" },
  { value: "rating_desc", label: "Highest Rated" },
  { value: "rating_asc", label: "Lowest Rated" },
  { value: "title_asc", label: "Title A–Z" },
];

function sortEntries(entries: LibraryEntry[], sort: Sort): LibraryEntry[] {
  return [...entries].sort((a, b) => {
    switch (sort) {
      case "added_desc": return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      case "added_asc":  return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      // Unrated entries sort last either way.
      case "rating_desc": return (b.rating ?? -1) - (a.rating ?? -1);
      case "rating_asc":  return (a.rating ?? 11) - (b.rating ?? 11);
      case "title_asc":   return a.albumTitle.localeCompare(b.albumTitle);
    }
  });
}

export function LibraryView({
  entries,
  syncControl,
}: {
  entries: LibraryEntry[];
  /**
   * Shown only on the Want to Listen tab, because that is the only thing it
   * syncs. Passed in rather than imported so this component stays unaware of
   * Spotify — it owns the filter state, which is the only reason it is involved.
   */
  syncControl?: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("added_desc");
  const [localEntries, setLocalEntries] = useState(entries);
  const [, startTransition] = useTransition();

  const handleRemove = (mbid: string) => {
    setLocalEntries((prev) => prev.filter((e) => e.mbid !== mbid));
    startTransition(async () => { await removeFromLibrary(mbid); });
  };

  if (localEntries.length === 0) {
    return (
      <p className="text-zinc-500 text-sm">
        Your library is empty.{" "}
        <Link href="/" className="text-zinc-300 hover:text-zinc-100 underline underline-offset-2">
          Search for something
        </Link>{" "}
        to add your first album or song.
      </p>
    );
  }

  const filtered =
    filter === "ALL" ? localEntries : localEntries.filter((e) => e.status === filter);
  const sorted = sortEntries(filtered, sort);

  // Albums and songs get their own areas rather than sharing a grid. An album
  // cover and a single track sitting side by side read as the same kind of thing
  // when they are not, and the "Song" badge was doing too much work to say so.
  const sections = [
    { key: "ALBUM", label: "Albums", items: sorted.filter((e) => e.itemType === "ALBUM") },
    { key: "SONG", label: "Songs", items: sorted.filter((e) => e.itemType === "SONG") },
  ];

  return (
    <div>
      {/*
        Status is a native select on phones and a tab bar from sm up. The tab labels
        came to roughly 400px of text back when there were four of them, which is
        wider than an iPhone's usable width, so the last one sat off-screen behind a
        horizontal scroll that iOS renders no visible hint for. Three fit, but the
        select stays: it is the better control on a phone regardless.
      */}
      <div className="sm:hidden mb-5 flex flex-col gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label="Show"
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          {FILTERS.map(({ key, label }) => {
            const count =
              key === "ALL" ? localEntries.length : localEntries.filter((e) => e.status === key).length;
            return (
              <option key={key} value={key}>
                {label} ({count})
              </option>
            );
          })}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort by"
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-zinc-200 focus:outline-none focus:border-zinc-600"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Status tabs + sort (sm and up) */}
      <div className="hidden sm:flex flex-wrap items-end justify-between gap-2 mb-5 border-b border-zinc-800">
        <div className="flex gap-1 overflow-x-auto max-w-full -mb-px">
          {FILTERS.map(({ key, label }) => {
            const count =
              key === "ALL" ? localEntries.length : localEntries.filter((e) => e.status === key).length;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-2 text-xs whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  filter === key
                    ? "border-zinc-300 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
                <span className={`ml-1.5 tabular-nums ${filter === key ? "text-zinc-400" : "text-zinc-700"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pb-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort by"
            className="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-400 focus:outline-none"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Above the grid, and outside the empty check: with nothing left to want,
          a sync may still have tracks to clear out of the playlist. */}
      {filter === "WANT" && syncControl && <div className="mb-5">{syncControl}</div>}

      {sorted.length === 0 ? (
        <p className="text-zinc-600 text-sm py-8">Nothing here yet.</p>
      ) : (
        <div className="space-y-8">
          {/* An empty section is left out rather than shown as a heading over
              nothing — a library of only albums should not carry a permanent
              "Songs 0". */}
          {sections
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <section key={section.key}>
                <h2 className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">
                  {section.label}
                  <span className="ml-2 tabular-nums text-zinc-700">
                    {section.items.length}
                  </span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
                  {section.items.map((entry) => (
                    <LibraryItemCard key={entry.id} entry={entry} onRemove={handleRemove} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
