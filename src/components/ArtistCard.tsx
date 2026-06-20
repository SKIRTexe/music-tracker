"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MBArtist } from "@/lib/musicbrainz";

function formatYears(artist: MBArtist): string | null {
  const ls = artist["life-span"];
  if (!ls?.begin) return null;
  const start = ls.begin.slice(0, 4);
  const end = ls.ended && ls.end ? ls.end.slice(0, 4) : "present";
  return `${start}–${end}`;
}

export function ArtistCard({ artist }: { artist: MBArtist }) {
  // Use pre-resolved URL from server if available, otherwise fall back to async fetch
  const [imageUrl, setImageUrl] = useState<string | null>(artist.imageUrl ?? null);
  const router = useRouter();
  const years = formatYears(artist);

  useEffect(() => {
    if (imageUrl) return; // already have a URL from server pre-resolution
    let cancelled = false;
    const params = new URLSearchParams({ artist: artist.name });
    fetch(`/api/artwork?${params}`, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.url) setImageUrl(d.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [artist.name, imageUrl]);

  return (
    <div
      className="shrink-0 w-32 cursor-pointer select-none text-center"
      onClick={() => router.push(`/artist/${artist.id}`)}
    >
      {/* Circle image */}
      <div className="w-24 h-24 mx-auto rounded-full overflow-hidden bg-zinc-800 mb-2 hover:opacity-80 transition-opacity">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={artist.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-zinc-400 text-xl font-light">
              {artist.name.charAt(0)}
            </span>
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-zinc-200 line-clamp-1 px-1">{artist.name}</p>
      {years && <p className="text-[10px] text-zinc-600 mt-0.5">{years}</p>}
      {!years && artist.disambiguation && (
        <p className="text-[10px] text-zinc-600 truncate px-1">{artist.disambiguation}</p>
      )}
    </div>
  );
}
