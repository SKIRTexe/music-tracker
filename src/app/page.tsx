import { Suspense } from "react";
import {
  searchAlbumSection,
  searchSongSection,
  searchArtistSection,
  type SearchItem,
} from "@/lib/search";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExistingEntries, getSavedSongs, songKey, type ExistingEntry } from "@/lib/library";
import { ResultCard } from "@/components/ResultCard";
import { ArtistCard } from "@/components/ArtistCard";
import { LibraryItemCard } from "@/components/LibraryItemCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchType = "all" | "albums" | "songs" | "artists";

const TYPE_TABS: { key: SearchType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
  { key: "songs", label: "Songs" },
];

function SearchBar({ defaultValue, type, big }: { defaultValue: string; type: SearchType; big?: boolean }) {
  return (
    <form method="GET" action="/" className="flex gap-2">
      {type !== "all" && <input type="hidden" name="type" value={type} />}
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="Search albums, songs, or artists…"
        autoComplete="off"
        autoFocus={big}
        aria-label="Search"
        className={`flex-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 ${
          big ? "px-4 py-3 text-base" : "px-3 py-2.5 text-base sm:text-sm"
        }`}
      />
      <button
        type="submit"
        className={`bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors ${
          big ? "px-6 py-3 text-base" : "px-4 py-2.5 text-base sm:text-sm"
        }`}
      >
        Search
      </button>
    </form>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">{children}</h2>;
}

/** Placeholder cards, so a pending section already has the shape of its result. */
function CardSkeleton({ count, round }: { count: number; round?: boolean }) {
  return (
    <div
      className={`grid gap-x-3 gap-y-5 sm:gap-5 ${
        round
          ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      }`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div
            className={`aspect-square bg-zinc-900 animate-pulse ${round ? "rounded-full" : "rounded-lg"}`}
          />
          <div className="h-2 bg-zinc-900 rounded mt-2 animate-pulse" />
          <div className="h-2 bg-zinc-900/60 rounded mt-1.5 w-2/3 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** Result cards, marking anything the user has already saved. */
async function ItemGrid({ items }: { items: SearchItem[] }) {
  const session = await auth();
  const [existing, savedSongs] = await Promise.all([
    getExistingEntries(session?.user?.id, items.map((i) => i.id)),
    getSavedSongs(session?.user?.id),
  ]);
  const entryFor = (item: SearchItem): ExistingEntry | null =>
    existing.get(item.id) ??
    (item.itemType === "SONG"
      ? savedSongs.get(songKey(item.title, item.artistName)) ?? null
      : null);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
      {items.map((item) => (
        <ResultCard
          key={item.id}
          item={item}
          isLoggedIn={!!session?.user}
          existing={entryFor(item)}
        />
      ))}
    </div>
  );
}

/*
 * Each section fetches independently and is streamed in by Suspense. One handler
 * used to await all three before sending anything, so a cold search showed a blank
 * page for ~16 seconds. Now the shell is immediate and each section appears as it
 * resolves — artists first, since that's a single MusicBrainz request.
 *
 * Albums and songs both need the same release-group search for artist detection;
 * that costs nothing extra because mbFetch shares in-flight requests and caches.
 */
async function ArtistResults({ query, limit }: { query: string; limit: number }) {
  const artists = await searchArtistSection(query, limit);
  if (artists.length === 0) return null;
  return (
    <section className="mb-10">
      <SectionHeading>Artists</SectionHeading>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-5 sm:gap-5">
        {artists.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </div>
    </section>
  );
}

async function AlbumResults({ query, limit }: { query: string; limit: number }) {
  const albums = await searchAlbumSection(query, limit);
  if (albums.length === 0) return null;
  return (
    <section className="mb-10">
      <SectionHeading>Albums</SectionHeading>
      <ItemGrid items={albums} />
    </section>
  );
}

async function SongResults({ query, limit }: { query: string; limit: number }) {
  const songs = await searchSongSection(query, limit);
  if (songs.length === 0) return null;
  return (
    <section className="mb-10">
      <SectionHeading>Songs</SectionHeading>
      <ItemGrid items={songs} />
    </section>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type: typeParam } = await searchParams;
  const type: SearchType =
    typeParam === "albums" || typeParam === "songs" || typeParam === "artists"
      ? typeParam
      : "all";
  const query = q?.trim() ?? "";

  const session = await auth();
  const isLoggedIn = !!session?.user;

  // ── Search results ─────────────────────────────────────────────────────────
  if (query) {
    const limit = type === "all" ? 18 : 36;
    const show = (t: SearchType) => type === "all" || type === t;

    return (
      <div>
        <div className="sticky top-12 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60 pt-3 pb-3 mb-6 sm:mb-8">
          <SearchBar defaultValue={query} type={type} />
          <div className="flex gap-1 mt-3">
            {TYPE_TABS.map(({ key, label }) => (
              <Link
                key={key}
                href={`/?q=${encodeURIComponent(query)}${key === "all" ? "" : `&type=${key}`}`}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  type === key ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {show("artists") && (
          <Suspense
            fallback={
              <section className="mb-10">
                <SectionHeading>Artists</SectionHeading>
                <CardSkeleton count={8} round />
              </section>
            }
          >
            <ArtistResults query={query} limit={limit} />
          </Suspense>
        )}

        {show("albums") && (
          <Suspense
            fallback={
              <section className="mb-10">
                <SectionHeading>Albums</SectionHeading>
                <CardSkeleton count={6} />
              </section>
            }
          >
            <AlbumResults query={query} limit={limit} />
          </Suspense>
        )}

        {show("songs") && (
          <Suspense
            fallback={
              <section className="mb-10">
                <SectionHeading>Songs</SectionHeading>
                <CardSkeleton count={6} />
              </section>
            }
          >
            <SongResults query={query} limit={limit} />
          </Suspense>
        )}
      </div>
    );
  }

  // ── Landing ────────────────────────────────────────────────────────────────
  const recent = session?.user?.id
    ? await prisma.albumLog.findMany({
        where: { userId: session.user.id },
        orderBy: { addedAt: "desc" },
        take: 12,
        select: {
          id: true, mbid: true, itemType: true, albumTitle: true, artistName: true,
          parentAlbum: true, releaseYear: true, status: true, rating: true,
          coverUrl: true, addedAt: true,
        },
      })
    : [];

  return (
    <div>
      <div className="pt-8 sm:pt-12 pb-8 sm:pb-10 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-2">
          Track the music you love
        </h1>
        <p className="text-sm text-zinc-500 mb-8">
          Search any album or song, add it to your library, rate it out of 10.
        </p>
        <div className="max-w-xl mx-auto">
          <SearchBar defaultValue="" type="all" big />
        </div>
        {!isLoggedIn && (
          <p className="text-xs text-zinc-600 mt-5">
            <Link href="/register" className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
              Create an account
            </Link>{" "}
            to start building your library.
          </p>
        )}
      </div>

      {recent.length > 0 && (
        <section className="border-t border-zinc-800/60 pt-8">
          <div className="flex items-baseline justify-between mb-4">
            <SectionHeading>Recently added</SectionHeading>
            <Link href="/library" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              View library →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
            {recent.map((entry) => (
              <LibraryItemCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
