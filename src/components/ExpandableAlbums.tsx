"use client";

import { useState } from "react";
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
              <div className="flex flex-wrap gap-4">
                {sorted.map((album) => (
                  <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
