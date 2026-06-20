"use client";

import { useState } from "react";
import { ArtistCard } from "@/components/ArtistCard";
import type { MBArtist } from "@/lib/musicbrainz";

export function ExpandableArtists({
  title,
  artists,
}: {
  title: string;
  artists: MBArtist[];
}) {
  const [open, setOpen] = useState(false);

  if (artists.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">{title}</h2>
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          See all →
        </button>
      </div>

      {/* Carousel */}
      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {artists.slice(0, 8).map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </div>

      {/* Modal */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-4 md:inset-10 z-50 bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-wrap gap-4">
                {artists.map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
