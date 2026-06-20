"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { removeFromLibrary } from "@/app/actions";

export type LibraryEntry = {
  id: string;
  mbid: string;
  albumTitle: string;
  artistName: string;
  artistMbid: string | null;
  releaseYear: number | null;
  status: string;
  rating: number | null;
  coverUrl: string | null;
  addedAt: Date;
};

type Filter = "ALL" | "LISTENED" | "LISTENING" | "WANT";
type Sort = "added_desc" | "added_asc" | "rating_desc" | "rating_asc";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "LISTENED", label: "Listened" },
  { key: "LISTENING", label: "Listening" },
  { key: "WANT", label: "Want to Listen" },
];

const SORT_OPTIONS: { value: Sort; label: string; forFilters: Filter[] }[] = [
  { value: "added_desc", label: "Recently Added", forFilters: ["ALL", "LISTENED", "LISTENING", "WANT"] },
  { value: "added_asc", label: "Oldest First", forFilters: ["ALL", "LISTENED", "LISTENING", "WANT"] },
  { value: "rating_desc", label: "Highest Rated", forFilters: ["LISTENED"] },
  { value: "rating_asc", label: "Lowest Rated", forFilters: ["LISTENED"] },
];

function sortEntries(entries: LibraryEntry[], sort: Sort): LibraryEntry[] {
  return [...entries].sort((a, b) => {
    if (sort === "added_desc") return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    if (sort === "added_asc") return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
    if (sort === "rating_desc") return (b.rating ?? -1) - (a.rating ?? -1);
    if (sort === "rating_asc") return (a.rating ?? 11) - (b.rating ?? 11);
    return 0;
  });
}

function RatingBadge({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return (
    <div className="mt-1.5 flex items-baseline gap-0.5">
      <span className="text-sm font-bold text-zinc-100 tabular-nums leading-none">
        {rating.toFixed(1)}
      </span>
      <span className="text-xs text-zinc-600 leading-none">/10</span>
    </div>
  );
}

function GridCard({
  entry,
  onRemove,
}: {
  entry: LibraryEntry;
  onRemove: (mbid: string) => void;
}) {
  return (
    <div className="group relative">
      <Link href={`/album/${entry.mbid}`} className="block">
        <div className="aspect-square rounded-lg overflow-hidden bg-zinc-800 mb-2 group-hover:opacity-80 transition-opacity">
          {entry.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.coverUrl}
              alt={entry.albumTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-3">
              <span className="text-zinc-600 text-xs text-center leading-snug line-clamp-3">
                {entry.albumTitle}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs font-medium text-zinc-200 line-clamp-1">{entry.albumTitle}</p>
      </Link>
      {entry.artistMbid ? (
        <Link
          href={`/artist/${entry.artistMbid}`}
          className="text-xs text-zinc-500 truncate block hover:text-zinc-300 transition-colors"
        >
          {entry.artistName}
        </Link>
      ) : (
        <p className="text-xs text-zinc-500 truncate">{entry.artistName}</p>
      )}
      <RatingBadge rating={entry.rating} />
      {entry.rating == null && (
        <p className="text-xs text-zinc-700 mt-1.5">Not rated</p>
      )}
      <button
        onClick={() => onRemove(entry.mbid)}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/80 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
      >
        ✕
      </button>
    </div>
  );
}

export function LibraryView({ entries }: { entries: LibraryEntry[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("added_desc");
  const [localEntries, setLocalEntries] = useState(entries);
  const [, startTransition] = useTransition();

  const handleRemove = (mbid: string) => {
    setLocalEntries((prev) => prev.filter((e) => e.mbid !== mbid));
    startTransition(async () => {
      await removeFromLibrary(mbid);
    });
  };

  const handleFilterChange = (f: Filter) => {
    setFilter(f);
    // Reset to a valid sort for the new filter
    const validSorts = SORT_OPTIONS.filter((s) => s.forFilters.includes(f));
    if (!validSorts.find((s) => s.value === sort)) {
      setSort("added_desc");
    }
  };

  const filtered =
    filter === "ALL"
      ? localEntries
      : localEntries.filter((e) => e.status === filter);

  const sorted = sortEntries(filtered, sort);

  const availableSorts = SORT_OPTIONS.filter((s) => s.forFilters.includes(filter));

  if (localEntries.length === 0) {
    return (
      <p className="text-zinc-600 text-sm">
        Your library is empty.{" "}
        <a
          href="/"
          className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
        >
          Discover albums
        </a>{" "}
        to get started.
      </p>
    );
  }

  return (
    <div>
      {/* Filter tabs + sort */}
      <div className="flex items-end justify-between mb-8 border-b border-zinc-800 pb-0">
        <div className="flex gap-1">
          {FILTERS.map(({ key, label }) => {
            const count =
              key === "ALL"
                ? localEntries.length
                : localEntries.filter((e) => e.status === key).length;
            return (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={`px-3 py-2 text-xs transition-colors border-b-2 -mb-px ${
                  filter === key
                    ? "border-zinc-300 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 tabular-nums ${
                    filter === key ? "text-zinc-400" : "text-zinc-700"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort dropdown */}
        {availableSorts.length > 1 && (
          <div className="flex items-center gap-2 pb-2">
            <span className="text-[10px] text-zinc-700 uppercase tracking-widest">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-400 focus:outline-none"
            >
              {availableSorts.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-zinc-600 text-sm">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {sorted.map((entry) => (
            <GridCard key={entry.id} entry={entry} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
