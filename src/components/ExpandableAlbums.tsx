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

export function ExpandableAlbums({
  title,
  albums,
  isLoggedIn,
}: {
  title: string;
  albums: MBAlbum[];
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<Sort>("recommended");

  if (albums.length === 0) return null;

  const sorted = sortAlbums(albums, sort);
  const isTimeline = sort === "newest" || sort === "oldest";

  return (
    <section className="mb-10">
      {/* Header: clickable title + inline sort tabs */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
        >
          {title} →
        </button>
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

      {/* Carousel — sorted by current filter */}
      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sorted.slice(0, 10).map((album) => (
          <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
        ))}
      </div>

      {/* Full popup */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-4 md:inset-10 z-50 bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
              <div className="flex items-center gap-4">
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
              {isTimeline ? (
                <DiscographyTimeline albums={sorted} isLoggedIn={isLoggedIn} />
              ) : (
                <div className="flex flex-wrap gap-4">
                  {sorted.map((album) => (
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
