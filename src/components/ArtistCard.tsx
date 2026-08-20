"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ArtistItem } from "@/lib/search";

/**
 * MusicBrainz stores no artist images, so the photo is the artwork of one of their
 * albums from the iTunes CDN, fetched lazily per card and memoised server-side.
 */
export function ArtistCard({ artist }: { artist: ArtistItem }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ artist: artist.name });
    fetch(`/api/artwork?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (active) setSrc(d.url ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, [artist.name]);

  const initials = artist.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Link href={`/artist/${artist.id}`} className="group block text-center">
      <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-2 group-hover:opacity-80 transition-opacity">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={artist.name}
            loading="lazy"
            draggable={false}
            onError={() => setSrc(null)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-lg font-semibold text-zinc-600">{initials}</span>
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-zinc-200 line-clamp-1" title={artist.name}>
        {artist.name}
      </p>
      {artist.disambiguation ? (
        <p className="text-[10px] text-zinc-600 line-clamp-1" title={artist.disambiguation}>
          {artist.disambiguation}
        </p>
      ) : (
        artist.kind && <p className="text-[10px] text-zinc-600">{artist.kind}</p>
      )}
    </Link>
  );
}
