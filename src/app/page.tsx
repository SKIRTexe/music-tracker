import { search, type SearchItem } from "@/lib/catalog";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExistingEntries, getSavedSongs, songKey, type ExistingEntry } from "@/lib/library";
import { getDiscover } from "@/lib/discover";
import { ResultCard } from "@/components/ResultCard";
import { ArtistCard } from "@/components/ArtistCard";
import { LibraryItemCard } from "@/components/LibraryItemCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchType = "all" | "albums" | "songs" | "artists";

// The All view leads with albums and songs, so a long artist row pushes them off
// screen. The Artists tab still shows the full set.
const ARTISTS_IN_ALL_VIEW = 6;

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
        className={`flex-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand-500/60 ${
          big ? "px-4 py-3 text-base" : "px-3 py-2.5 text-base sm:text-sm"
        }`}
      />
      <button
        type="submit"
        className={`bg-brand-600 hover:bg-brand-500 rounded text-white font-medium transition-colors ${
          big ? "px-6 py-3 text-base" : "px-4 py-2.5 text-base sm:text-sm"
        }`}
      >
        Search
      </button>
    </form>
  );
}

/** A landing-page row: ruled off from the one above it, with room below. */
const BAND = "border-t border-zinc-800/60 pt-8 mb-10";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">{children}</h2>;
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
    // One Spotify request covers all three types in about half a second, so this
    // no longer needs the streamed sections MusicBrainz's ~17s searches required.
    const { albums, songs, artists } = await search(query, {
      albums: type === "all" || type === "albums",
      songs: type === "all" || type === "songs",
      artists: type === "all" || type === "artists",
      limit: type === "all" ? 18 : 36,
    });

    const items = [...albums, ...songs];
    const [existing, savedSongs] = await Promise.all([
      getExistingEntries(session?.user?.id, items.map((i) => i.id)),
      getSavedSongs(session?.user?.id),
    ]);
    const entryFor = (item: SearchItem): ExistingEntry | null =>
      existing.get(item.id) ??
      (item.itemType === "SONG"
        ? savedSongs.get(songKey(item.title, item.artistName)) ?? null
        : null);

    const shownArtists = type === "all" ? artists.slice(0, ARTISTS_IN_ALL_VIEW) : artists;
    const total = albums.length + songs.length + shownArtists.length;

    const grid = (list: SearchItem[]) => (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
        {list.map((item) => (
          <ResultCard
            key={item.id}
            item={item}
            isLoggedIn={isLoggedIn}
            existing={entryFor(item)}
          />
        ))}
      </div>
    );

    return (
      <div>
        <div className="sticky top-12 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60 pt-3 pb-3 mb-6 sm:mb-8">
          <SearchBar defaultValue={query} type={type} />
          <div className="flex gap-1 mt-3">
            {TYPE_TABS.map(({ key, label }) => (
              <Link
                key={key}
                href={`/?q=${encodeURIComponent(query)}${key === "all" ? "" : `&type=${key}`}`}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  type === key
                    ? "bg-brand-500/15 text-brand-500 ring-1 ring-inset ring-brand-500/30"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {total === 0 ? (
          <div className="py-16 text-center">
            <p className="text-zinc-400 text-sm mb-1">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-zinc-600 text-xs">Try an artist name, or check the spelling.</p>
          </div>
        ) : (
          <>
            {shownArtists.length > 0 && (
              <section className="mb-10">
                <SectionHeading>Artists</SectionHeading>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-5 sm:gap-5">
                  {shownArtists.map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} />
                  ))}
                </div>
              </section>
            )}

            {albums.length > 0 && (
              <section className="mb-10">
                <SectionHeading>Albums</SectionHeading>
                {grid(albums)}
              </section>
            )}

            {songs.length > 0 && (
              <section className="mb-10">
                <SectionHeading>Songs</SectionHeading>
                {grid(songs)}
              </section>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Landing ────────────────────────────────────────────────────────────────
  const userId = session?.user?.id;
  const [recent, discover] = await Promise.all([
    userId
      ? prisma.albumLog.findMany({
          where: { userId },
          orderBy: { addedAt: "desc" },
          take: 12,
          select: {
            id: true, mbid: true, itemType: true, albumTitle: true, artistName: true,
            parentAlbum: true, releaseYear: true, status: true, rating: true,
            coverUrl: true, addedAt: true,
          },
        })
      : [],
    getDiscover(userId),
  ]);

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
        <section className={BAND}>
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

      {discover.albums.length > 0 && (
        <section className={BAND}>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <SectionHeading>Suggested albums</SectionHeading>
            <p className="text-[10px] text-zinc-600 truncate">
              {discover.personal ? "Because you like " : "Popular in "}
              {/* Only the genres get capitalised — Tailwind's `capitalize` would
                  otherwise title-case the sentence around them. */}
              <span className="capitalize">{discover.genres.join(" · ")}</span>
            </p>
          </div>
          {/* Sized to divide into six exactly at every width — a fixed-length row
              with two orphans on the end reads as a grid that ran out. */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
            {discover.albums.map((item) => (
              <ResultCard key={item.id} item={item} isLoggedIn={isLoggedIn} existing={null} />
            ))}
          </div>
        </section>
      )}

      {discover.artists.length > 0 && (
        <section className={BAND}>
          <SectionHeading>Artists to explore</SectionHeading>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
            {discover.artists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
