import {
  searchAlbums,
  searchArtists,
  getGenreAlbums,
  getGenreArtists,
} from "@/lib/musicbrainz";
import { resolveAlbumArtwork, resolveArtistArtwork } from "@/lib/artwork";
import type { MBAlbum } from "@/lib/musicbrainz";

export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Carousel } from "@/components/Carousel";
import { ArtistCarousel } from "@/components/ArtistCarousel";
import { AlbumCard } from "@/components/AlbumCard";
import { ArtistCard } from "@/components/ArtistCard";
import { FavoriteGenreButton } from "@/components/FavoriteGenreButton";
import Link from "next/link";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const GENRES = [
  { label: "Rock", tag: "rock" },
  { label: "Hip-Hop", tag: "hip-hop" },
  { label: "Jazz", tag: "jazz" },
  { label: "Electronic", tag: "electronic" },
  { label: "Pop", tag: "pop" },
  { label: "R&B / Soul", tag: "soul" },
  { label: "Classical", tag: "classical" },
  { label: "Metal", tag: "metal" },
  { label: "Indie", tag: "indie" },
  { label: "Folk", tag: "folk" },
];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string }>;
}) {
  const { q, mode } = await searchParams;
  const isArtistMode = mode === "artists";
  const session = await auth();
  const isLoggedIn = !!session?.user;

  // ── Search mode ────────────────────────────────────────────────────────────
  if (q) {
    if (isArtistMode) {
      const results = await searchArtists(q, 25);
      return (
        <div className="max-w-5xl mx-auto">
          <ModeToggle mode="artists" />
          <SearchBar defaultValue={q} mode="artists" />
          <p className="text-xs text-zinc-600 mb-6">
            {results.length} artists for &ldquo;{q}&rdquo;
          </p>
          {results.length === 0 ? (
            <p className="text-zinc-600 text-sm">No artists found.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {results.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          )}
        </div>
      );
    }

    const results = await searchAlbums(q, 25);
    return (
      <div className="max-w-5xl mx-auto">
        <ModeToggle mode="albums" />
        <SearchBar defaultValue={q} mode="albums" />
        <p className="text-xs text-zinc-600 mb-6">
          {results.length} results for &ldquo;{q}&rdquo;
        </p>
        {results.length === 0 ? (
          <p className="text-zinc-600 text-sm">No results found.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {results.map((album) => (
              <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Fetch favorites ────────────────────────────────────────────────────────
  const favoriteTags = new Set<string>();
  if (session?.user?.id) {
    const favs = await prisma.favoriteGenre.findMany({
      where: { userId: session.user.id },
      select: { tag: true },
    });
    favs.forEach((f) => favoriteTags.add(f.tag));
  }

  const sortedGenres = [
    ...GENRES.filter((g) => favoriteTags.has(g.tag)),
    ...GENRES.filter((g) => !favoriteTags.has(g.tag)),
  ];

  // ── Artists mode ───────────────────────────────────────────────────────────
  if (isArtistMode) {
    const artistGenreResults = await Promise.all(
      sortedGenres.map(({ tag }) => getGenreArtists(tag, 50))
    );

    const shuffledArtistGenre = artistGenreResults.map((pool) => shuffle(pool).slice(0, 16));

    const seenArtistIds = new Set<string>();
    const recommendedArtistPool = sortedGenres
      .flatMap((_, i) => shuffle(artistGenreResults[i] ?? []).slice(0, 5))
      .filter((a) => { if (seenArtistIds.has(a.id)) return false; seenArtistIds.add(a.id); return true; });
    const recommendedArtists = shuffle(recommendedArtistPool).slice(0, 16);

    // Pre-resolve artist artwork server-side
    const displayedArtists = [...recommendedArtists, ...shuffledArtistGenre.flat()];
    const uniqueArtists = [...new Map(displayedArtists.map((a) => [a.id, a])).values()];
    await Promise.all(
      uniqueArtists.map(async (artist) => {
        const url = await resolveArtistArtwork(artist.name);
        if (url) artist.imageUrl = url;
      })
    );

    return (
      <div className="max-w-5xl mx-auto">
        <ModeToggle mode="artists" />
        <SearchBar defaultValue="" mode="artists" />
        <ArtistCarousel title="Recommended Artists" artists={recommendedArtists} />
        {sortedGenres.map(({ label, tag }, i) => (
          <ArtistCarousel
            key={label}
            title={label}
            artists={shuffledArtistGenre[i] ?? []}
            href={`/genre/${encodeURIComponent(tag)}`}
          />
        ))}
      </div>
    );
  }

  // ── Albums mode (default) ──────────────────────────────────────────────────
  const genreResults = await Promise.all(
    sortedGenres.map(({ tag }) => getGenreAlbums(tag, 50))
  );

  // Shuffle once — same result used for pre-resolution and render
  const shuffledGenre = genreResults.map((pool) => shuffle(pool).slice(0, 16));

  // Build Recommended by sampling across all genre pools — diverse + cycles well
  const seenIds = new Set<string>();
  const recommendedPool = sortedGenres
    .flatMap((_, i) => shuffle(genreResults[i] ?? []).slice(0, 5))
    .filter((a) => { if (seenIds.has(a.id)) return false; seenIds.add(a.id); return true; });
  const recommended = shuffle(recommendedPool).slice(0, 16);

  // Pre-resolve iTunes artwork for every displayed album in parallel.
  // Results are cached in src/lib/artwork.ts — after first load, all instant.
  const displayed = [...recommended, ...shuffledGenre.flat()];
  const unique = [...new Map(displayed.map((a) => [a.id, a])).values()];
  await Promise.all(
    unique.map(async (album) => {
      const artist = (album as MBAlbum)["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(album.title, artist);
      if (url) album.coverUrl = url;
    })
  );

  return (
    <div className="max-w-5xl mx-auto">
      <ModeToggle mode="albums" />
      <SearchBar defaultValue="" mode="albums" />

      <Carousel
        title="Recommended"
        albums={recommended}
        isLoggedIn={isLoggedIn}
        href="/recommended"
      />

      {sortedGenres.map(({ label, tag }, i) => (
        <Carousel
          key={label}
          title={label}
          albums={shuffledGenre[i] ?? []}
          isLoggedIn={isLoggedIn}
          href={`/genre/${encodeURIComponent(tag)}`}
          favoriteButton={
            isLoggedIn ? (
              <FavoriteGenreButton tag={tag} isFavorite={favoriteTags.has(tag)} />
            ) : undefined
          }
        />
      ))}
    </div>
  );
}

function ModeToggle({ mode }: { mode: "albums" | "artists" }) {
  return (
    <div className="flex border border-zinc-800 rounded overflow-hidden text-xs w-fit mb-6">
      <Link
        href="/"
        className={`px-4 py-2 transition-colors ${
          mode === "albums"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Albums
      </Link>
      <Link
        href="/?mode=artists"
        className={`px-4 py-2 border-l border-zinc-800 transition-colors ${
          mode === "artists"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Artists
      </Link>
    </div>
  );
}

function SearchBar({ defaultValue, mode }: { defaultValue: string; mode: "albums" | "artists" }) {
  return (
    <form method="GET" className="flex gap-2 mb-10">
      {mode === "artists" && <input type="hidden" name="mode" value="artists" />}
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder={mode === "artists" ? "Search artists..." : "Search albums or artists..."}
        autoComplete="off"
        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm text-zinc-300 transition-colors"
      >
        Search
      </button>
    </form>
  );
}
