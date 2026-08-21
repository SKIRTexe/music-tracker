import { getArtistDetail, isNotFound } from "@/lib/musicbrainz";
import { artistDiscography } from "@/lib/search";
import { resolveArtistArtwork } from "@/lib/artwork";
import { auth } from "@/lib/auth";
import { getExistingEntries } from "@/lib/library";
import { ResultCard } from "@/components/ResultCard";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;

  let artist;
  try {
    artist = await getArtistDetail(mbid);
  } catch (err) {
    if (isNotFound(err)) notFound();
    return (
      <div className="max-w-2xl mx-auto pt-20 text-center">
        <p className="text-zinc-400 text-sm mb-3">
          Could not load this artist. MusicBrainz may be temporarily unavailable.
        </p>
        <Link
          href={`/artist/${mbid}`}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
        >
          Try again
        </Link>
      </div>
    );
  }

  const [albums, photo, session] = await Promise.all([
    artistDiscography({ id: artist.id, name: artist.name }, 100, { studioOnly: true }),
    resolveArtistArtwork(artist.name),
    auth(),
  ]);

  const existing = await getExistingEntries(
    session?.user?.id,
    albums.map((a) => a.id)
  );

  const years = artist.beganYear
    ? `${artist.beganYear}–${artist.endedYear ?? ""}`
    : null;

  return (
    <div>
      <Link
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← Search
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 sm:gap-5 mb-8 sm:mb-10">
        <div className="shrink-0 w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-zinc-800">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={artist.name} className="w-full h-full object-cover" />
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
          <p className="text-xs text-zinc-600 mb-2">
            {[artist.kind, artist.country, years].filter(Boolean).join(" · ")}
            {artist.disambiguation && (
              <span className="block text-zinc-600 mt-0.5">{artist.disambiguation}</span>
            )}
          </p>

          {artist.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.slice(0, 5).map((g) => (
                <span
                  key={g.id}
                  className="text-[10px] px-2 py-0.5 bg-zinc-800 rounded text-zinc-400 capitalize"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Discography, oldest first */}
      <section>
        <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">
          Discography
          <span className="ml-2 text-zinc-700 tabular-nums">{albums.length}</span>
        </h2>

        {albums.length === 0 ? (
          <p className="text-zinc-600 text-sm">
            No albums found for this artist on MusicBrainz.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5 sm:gap-5">
            {albums.map((album) => (
              <ResultCard
                key={album.id}
                item={album}
                isLoggedIn={!!session?.user}
                existing={existing.get(album.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
