import { search, type SearchItem } from "@/lib/search";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExistingEntries, type ExistingEntry } from "@/lib/library";
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
          big ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
        }`}
      />
      <button
        type="submit"
        className={`bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors ${
          big ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"
        }`}
      >
        Search
      </button>
    </form>
  );
}

function ResultGrid({
  items,
  isLoggedIn,
  existing,
}: {
  items: SearchItem[];
  isLoggedIn: boolean;
  existing: Map<string, ExistingEntry>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
      {items.map((item) => (
        <ResultCard
          key={item.id}
          item={item}
          isLoggedIn={isLoggedIn}
          existing={existing.get(item.id) ?? null}
        />
      ))}
    </div>
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
    const { albums, songs, artists } = await search(query, {
      albums: type === "all" || type === "albums",
      songs: type === "all" || type === "songs",
      artists: type === "all" || type === "artists",
      limit: type === "all" ? 18 : 36,
    });

    const existing = await getExistingEntries(
      session?.user?.id,
      [...albums, ...songs].map((i) => i.id)
    );
    const total = albums.length + songs.length + artists.length;

    return (
      <div>
        <div className="sticky top-0 z-20 -mx-4 px-4 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60 pt-4 pb-3 mb-8">
          <SearchBar defaultValue={query} type={type} />
          <div className="flex gap-1 mt-3">
            {TYPE_TABS.map(({ key, label }) => (
              <Link
                key={key}
                href={`/?q=${encodeURIComponent(query)}${key === "all" ? "" : `&type=${key}`}`}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  type === key
                    ? "bg-zinc-700 text-zinc-100"
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
            <p className="text-zinc-600 text-xs">
              Try an artist name, or check the spelling. MusicBrainz may also be
              temporarily unavailable.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-600 mb-6">
              {total} result{total === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
            </p>

            {artists.length > 0 && (
              <section className="mb-10">
                <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">
                  Artists
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-5">
                  {artists.map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} />
                  ))}
                </div>
              </section>
            )}

            {albums.length > 0 && (
              <section className="mb-10">
                <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">
                  Albums
                </h2>
                <ResultGrid items={albums} isLoggedIn={isLoggedIn} existing={existing} />
              </section>
            )}

            {songs.length > 0 && (
              <section>
                <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">
                  Songs
                </h2>
                <ResultGrid items={songs} isLoggedIn={isLoggedIn} existing={existing} />
              </section>
            )}
          </>
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
      <div className="pt-12 pb-10 text-center">
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">Track the music you love</h1>
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
            <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest">
              Recently added
            </h2>
            <Link href="/library" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              View library →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
            {recent.map((entry) => (
              <LibraryItemCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
