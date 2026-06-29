"use client";

import { useState } from "react";
import Link from "next/link";
import { AlbumCard } from "@/components/AlbumCard";
import type { MBAlbum } from "@/lib/musicbrainz";

type ReleaseFilter = "albums" | "singles" | "both";

interface CarouselProps {
  title: string;
  albums: MBAlbum[];
  isLoggedIn: boolean;
  href?: string;
  tag?: string;
  favoriteButton?: React.ReactNode;
}

export function Carousel({ title, albums, isLoggedIn, href, tag, favoriteButton }: CarouselProps) {
  const [filter, setFilter] = useState<ReleaseFilter>("albums");
  const [singles, setSingles] = useState<MBAlbum[] | null>(null);
  const [loadingSingles, setLoadingSingles] = useState(false);

  const fetchSingles = async () => {
    if (singles !== null || !tag) return;
    setLoadingSingles(true);
    try {
      const res = await fetch(`/api/genre-singles?tag=${encodeURIComponent(tag)}`);
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

  const displayed =
    filter === "singles" ? (singles ?? []) :
    filter === "both" ? [...albums, ...(singles ?? [])] :
    albums;

  if (albums.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {href ? (
            <Link href={href} className="group inline-flex items-center gap-1.5">
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">
                {title}
              </h2>
              <span className="text-xs text-zinc-700 group-hover:text-zinc-400 transition-colors">→</span>
            </Link>
          ) : (
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
              {title}
            </h2>
          )}
          {favoriteButton}
        </div>

        {tag && (
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
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loadingSingles ? (
          <p className="text-xs text-zinc-600 py-4">Loading singles…</p>
        ) : displayed.length === 0 ? (
          <p className="text-xs text-zinc-600 py-4">No results.</p>
        ) : (
          displayed.map((album) => (
            <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
          ))
        )}
      </div>
    </section>
  );
}
