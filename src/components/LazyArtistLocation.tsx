"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LocationTag { label: string; slug: string }

export function LazyArtistLocation({ artistMbid }: { artistMbid: string }) {
  const [tags, setTags] = useState<LocationTag[] | null>(null);

  useEffect(() => {
    fetch(`/api/artist-location?mbid=${artistMbid}`)
      .then((r) => r.json())
      .then((d) => setTags(d.locationTags ?? []))
      .catch(() => setTags([]));
  }, [artistMbid]);

  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {tags.map(({ label, slug }) => (
        <Link
          key={label}
          href={`/location/${encodeURIComponent(slug)}`}
          className="text-[10px] px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          📍 {label}
        </Link>
      ))}
    </div>
  );
}
