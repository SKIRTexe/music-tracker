"use client";

import { useState, useEffect } from "react";
import { LazyLocationAlbumCarousel } from "@/components/LazyLocationCarousel";

const DEFAULT_GENRES = [
  { label: "Rock",       tag: "rock" },
  { label: "Jazz",       tag: "jazz" },
  { label: "Electronic", tag: "electronic" },
  { label: "Hip-Hop",    tag: "hip-hop" },
  { label: "Pop",        tag: "pop" },
  { label: "Soul",       tag: "soul" },
  { label: "Folk",       tag: "folk" },
  { label: "Metal",      tag: "metal" },
];

interface Genre { label: string; tag: string }

export function LocationAlbumsSection({
  slug,
  countryParam,
  isLoggedIn,
}: {
  slug: string;
  countryParam: string;   // "" or "&country=1"
  isLoggedIn: boolean;
}) {
  const [genres, setGenres] = useState<Genre[] | null>(null);

  useEffect(() => {
    const isCountryFlag = countryParam === "&country=1" ? "1" : "0";
    fetch(`/api/location-genres?slug=${encodeURIComponent(slug)}&country=${isCountryFlag}`)
      .then((r) => r.json())
      .then((d) => {
        const list: Genre[] = d.genres ?? [];
        setGenres(list.length > 0 ? list : DEFAULT_GENRES);
      })
      .catch(() => setGenres(DEFAULT_GENRES));
  }, [slug, countryParam]);

  if (!genres) {
    return <p className="text-xs text-zinc-600 py-4">Loading genres…</p>;
  }

  const encodedSlug = encodeURIComponent(slug);

  return (
    <>
      {genres.map(({ label, tag }) => (
        <LazyLocationAlbumCarousel
          key={tag}
          title={label}
          fetchUrl={`/api/location-albums?slug=${encodedSlug}${countryParam}&genre=${encodeURIComponent(tag)}`}
          isLoggedIn={isLoggedIn}
          href={`/genre/${encodeURIComponent(tag)}`}
          tag={tag}
        />
      ))}
    </>
  );
}
