"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { removeFromLibrary } from "@/app/actions";
import { LibraryItemCard, type LibraryEntry } from "@/components/LibraryItemCard";

export type { LibraryEntry };

type Filter = "ALL" | "LISTENED" | "LISTENING" | "WANT";
type TypeFilter = "ALL" | "ALBUM" | "SONG";
type Sort = "added_desc" | "added_asc" | "rating_desc" | "rating_asc" | "title_asc";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "LISTENED", label: "Listened" },
  { key: "LISTENING", label: "Listening" },
  { key: "WANT", label: "Want to Listen" },
];

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "ALL", label: "Everything" },
  { key: "ALBUM", label: "Albums" },
  { key: "SONG", label: "Songs" },
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

export function LibraryView({ entries }: { entries: LibraryEntry[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
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

  const byType =
    typeFilter === "ALL"
      ? localEntries
      : localEntries.filter((e) => e.itemType === typeFilter);

  const filtered = filter === "ALL" ? byType : byType.filter((e) => e.status === filter);
  const sorted = sortEntries(filtered, sort);

  return (
    <div>
      {/*
        Status is a native select on phones and a tab bar from sm up. The four tab
        labels come to roughly 400px of text, which is wider than an iPhone's usable
        width, so the last one sat off-screen behind a horizontal scroll that iOS
        renders no visible hint for.
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
              key === "ALL" ? byType.length : byType.filter((e) => e.status === key).length;
            return (
              <option key={key} value={key}>
                {label} ({count})
              </option>
            );
          })}
        </select>
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            aria-label="Filter by type"
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-zinc-200 focus:outline-none focus:border-zinc-600"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort by"
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-zinc-200 focus:outline-none focus:border-zinc-600"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status tabs + sort (sm and up) */}
      <div className="hidden sm:flex flex-wrap items-end justify-between gap-2 mb-5 border-b border-zinc-800">
        <div className="flex gap-1 overflow-x-auto max-w-full -mb-px">
          {FILTERS.map(({ key, label }) => {
            const count =
              key === "ALL" ? byType.length : byType.filter((e) => e.status === key).length;
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
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            aria-label="Filter by type"
            className="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-400 focus:outline-none"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
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

      {sorted.length === 0 ? (
        <p className="text-zinc-600 text-sm py-8">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
          {sorted.map((entry) => (
            <LibraryItemCard key={entry.id} entry={entry} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
