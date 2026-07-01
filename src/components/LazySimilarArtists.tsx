"use client";

import { useState, useEffect } from "react";
import { ArtistCard } from "@/components/ArtistCard";
import type { MBArtist } from "@/lib/musicbrainz";

export function LazySimilarArtists({ fetchUrl }: { fetchUrl: string }) {
  const [artists, setArtists] = useState<MBArtist[] | null>(null);

  useEffect(() => {
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((d) => setArtists(d.artists ?? []))
      .catch(() => setArtists([]));
  }, [fetchUrl]);

  if (artists !== null && artists.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-4">
        Similar Artists
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {artists === null ? (
          <p className="text-xs text-zinc-600 py-4">Loading…</p>
        ) : (
          artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))
        )}
      </div>
    </section>
  );
}
