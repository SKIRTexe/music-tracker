import { getArtist, artistAlbums, CatalogNotFound } from "@/lib/catalog";
import { cachedArtistGenres } from "@/lib/enrich";
import { auth } from "@/lib/auth";
import { getExistingEntries } from "@/lib/library";
import { Discography } from "@/components/Discography";
import { artistAlbumPopularity, withDeadline } from "@/lib/popularity";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

export const dynamic = "force-dynamic";

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let artist;
  try {
    artist = await getArtist(id);
  } catch (err) {
    if (err instanceof CatalogNotFound) notFound();
    return (
      <div className="max-w-2xl mx-auto pt-20 text-center">
        <p className="text-zinc-400 text-sm mb-3">
          Could not load this artist. Please try again.
        </p>
        <Link
          href={`/artist/${id}`}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
        >
          Try again
        </Link>
      </div>
    );
  }

  // One cached Deezer request covers the whole discography, and it is bounded:
  // a discography without fan counts is still a discography, so a slow lookup
  // must not hold the page. `after` lets the request finish and warm the cache
  // for the next visitor even when this render gave up waiting on it.
  const lookup = artistAlbumPopularity(artist.name);
  after(async () => {
    await lookup.catch(() => {});
  });

  // Spotify withdrew artist genres, so these come from the MusicBrainz cache.
  const [albums, session, genres, popularity] = await Promise.all([
    artistAlbums(artist.id),
    auth(),
    cachedArtistGenres(artist.id, artist.name),
    withDeadline(lookup, {} as Record<string, number>),
  ]);
  const existing = await getExistingEntries(session?.user?.id, albums.map((a) => a.id));

  return (
    <div>
      <Link
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← Search
      </Link>

      <div className="flex items-center gap-4 sm:gap-5 mb-8 sm:mb-10">
        <div className="shrink-0 w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-zinc-800">
          {artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-2xl font-semibold text-zinc-600">
                {artist.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 leading-tight mb-1">
            {artist.name}
          </h1>
          {artist.followers != null && (
            <p className="text-xs text-zinc-600 mb-2">
              {artist.followers.toLocaleString("en-US")} followers
            </p>
          )}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.slice(0, 5).map((g) => (
                <span
                  key={g}
                  className="text-[10px] px-2 py-0.5 bg-zinc-800 rounded text-zinc-400 capitalize"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {albums.length === 0 ? (
        <section>
          <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Discography</h2>
          <p className="text-zinc-600 text-sm">No albums found for this artist.</p>
        </section>
      ) : (
        <Discography
          albums={albums}
          popularity={popularity}
          isLoggedIn={!!session?.user}
          existing={Object.fromEntries(existing)}
        />
      )}
    </div>
  );
}
