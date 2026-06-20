"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MBArtist } from "@/lib/musicbrainz";

async function fetchArtistImage(name: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ artist: name });
    const res = await fetch(`/api/artwork?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

function formatYears(artist: MBArtist): string | null {
  const ls = artist["life-span"];
  if (!ls?.begin) return null;
  const start = ls.begin.slice(0, 4);
  const end = ls.ended && ls.end ? ls.end.slice(0, 4) : "present";
  return `${start}–${end}`;
}

export function ArtistCard({ artist }: { artist: MBArtist }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const router = useRouter();
  const years = formatYears(artist);

  useEffect(() => {
    let cancelled = false;
    fetchArtistImage(artist.name).then((url) => {
      if (!cancelled) setImageUrl(url);
    });
    return () => { cancelled = true; };
  }, [artist.name]);

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
