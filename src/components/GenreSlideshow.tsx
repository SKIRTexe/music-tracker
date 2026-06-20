"use client";

import { useState, useEffect } from "react";

interface SimpleAlbum {
  title: string;
  artist: string;
}

async function fetchCover(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&entity=album&limit=3`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const tl = title.toLowerCase();
    const match =
      data.results?.find((r: { collectionName?: string }) =>
        r.collectionName?.toLowerCase().includes(tl)
      ) ?? data.results?.[0];
    return (match?.artworkUrl100 as string | undefined)?.replace("100x100bb", "600x600bb") ?? null;
  } catch {
    return null;
  }
}

export function GenreSlideshow({
  albums,
  genre,
  summary,
}: {
  albums: SimpleAlbum[];
  genre: string;
  summary?: string;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results: string[] = [];
      for (const album of albums.slice(0, 6)) {
        if (cancelled) break;
        const url = await fetchCover(album.title, album.artist);
        if (url) {
          results.push(url);
          if (!cancelled) setImages([...results]);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [albums]);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % images.length), 4000);
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <div className="relative w-full h-64 md:h-80 rounded-xl overflow-hidden bg-zinc-900 mb-10">
      {/* Images */}
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={src}
          alt={genre}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            i === current ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* Gradient overlays — strong at bottom for text, subtle at top */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/60 to-transparent" />

      {/* Genre title + summary overlaid at bottom-left */}
      <div className="absolute bottom-0 left-0 right-0 px-8 pb-8 pt-16">
        <h1 className="text-3xl font-bold text-zinc-100 mb-1">{genre}</h1>
        {summary && (
          <p className="text-xs text-zinc-400 leading-relaxed max-w-xl line-clamp-2">{summary}</p>
        )}
      </div>

      {/* Dot navigation */}
      {images.length > 1 && (
        <div className="absolute bottom-4 right-6 flex gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === current ? "bg-zinc-200" : "bg-zinc-600 hover:bg-zinc-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
