"use client";

import { useState, useEffect } from "react";

interface SimpleAlbum {
  mbid: string;
  title: string;
  artistName: string;
}

export function ArtistSlideshow({ albums, artistName }: { albums: SimpleAlbum[]; artistName: string }) {
  const [current, setCurrent] = useState(0);
  // Track which mbids failed to load so we skip them
  const [failedSet, setFailedSet] = useState<Set<string>>(new Set());

  const images = albums
    .filter((a) => !failedSet.has(a.mbid))
    .map((a) => ({
      mbid: a.mbid,
      url: `https://coverartarchive.org/release/${a.mbid}/front-250`,
    }));

  const idx = images.length > 0 ? Math.min(current, images.length - 1) : 0;

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % images.length), 4000);
    return () => clearInterval(id);
  }, [images.length]);

  if (images.length === 0) {
    return <div className="w-full h-48 md:h-64 rounded-xl bg-zinc-900 mb-10" />;
  }

  return (
    <div className="relative w-full aspect-[3/1] rounded-xl overflow-hidden bg-zinc-900 mb-10">
      {images.map(({ mbid, url }, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={mbid}
          src={url}
          alt={artistName}
          onError={() =>
            setFailedSet((prev) => {
              const next = new Set(prev);
              next.add(mbid);
              return next;
            })
          }
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            i === idx ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === idx ? "bg-zinc-200" : "bg-zinc-600 hover:bg-zinc-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
