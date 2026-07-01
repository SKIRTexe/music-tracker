"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlbumCard } from "@/components/AlbumCard";
import { ArtistCard } from "@/components/ArtistCard";
import type { MBAlbum, MBArtist } from "@/lib/musicbrainz";

// ── Lazy album carousel ────────────────────────────────────────────────────────

export function LazyLocationAlbumCarousel({
  title,
  fetchUrl,
  isLoggedIn,
  href,
  tag,
}: {
  title: string;
  fetchUrl: string;
  isLoggedIn: boolean;
  href?: string;
  tag?: string;
}) {
  const [albums, setAlbums] = useState<MBAlbum[] | null>(null);

  useEffect(() => {
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((d) => setAlbums(d.albums ?? []))
      .catch(() => setAlbums([]));
  }, [fetchUrl]);

  if (albums !== null && albums.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center mb-4">
        {href ? (
          <Link href={href} className="group inline-flex items-center gap-1.5">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">
              {title}
            </h2>
            <span className="text-xs text-zinc-700 group-hover:text-zinc-400 transition-colors">→</span>
          </Link>
        ) : (
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">{title}</h2>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {albums === null ? (
          <p className="text-xs text-zinc-600 py-4">Loading…</p>
        ) : (
          albums.map((album) => (
            <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
          ))
        )}
      </div>
    </section>
  );
}

// ── Lazy artist carousel ───────────────────────────────────────────────────────

export function LazyLocationArtistCarousel({
  title,
  fetchUrl,
  href,
}: {
  title: string;
  fetchUrl: string;
  href?: string;
}) {
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
      <div className="flex items-center mb-4">
        {href ? (
          <Link href={href} className="group inline-flex items-center gap-1.5">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">
              {title}
            </h2>
            <span className="text-xs text-zinc-700 group-hover:text-zinc-400 transition-colors">→</span>
          </Link>
        ) : (
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">{title}</h2>
        )}
      </div>
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
