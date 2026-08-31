import { getAlbum, CatalogNotFound } from "@/lib/catalog";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExistingEntries, getSavedSongs, songKey } from "@/lib/library";
import { AlbumActions } from "@/components/AlbumActions";
import { communityRating, COMMUNITY_MIN_RATINGS } from "@/lib/social";
import { TrackRow } from "@/components/TrackRow";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = String(totalSec % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let album;
  try {
    album = await getAlbum(id);
  } catch (err) {
    if (err instanceof CatalogNotFound) notFound();
    return (
      <div className="max-w-2xl mx-auto pt-20 text-center">
        <p className="text-zinc-400 text-sm mb-3">
          Could not load this album. Please try again.
        </p>
        <Link
          href={`/album/${id}`}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
        >
          Try again
        </Link>
      </div>
    );
  }

  const session = await auth();
  const community = await communityRating(id);

  const [userEntry, trackEntries, savedSongs] = await Promise.all([
    session?.user?.id
      ? prisma.albumLog.findUnique({
          where: { userId_mbid: { userId: session.user.id, mbid: album.id } },
        })
      : Promise.resolve(null),
    getExistingEntries(session?.user?.id, album.tracks.map((t) => t.id)),
    // Falls back to title+artist, since the same song exists under a different
    // track id on every album it appears on.
    getSavedSongs(session?.user?.id),
  ]);

  const totalMs = album.tracks.reduce((sum, t) => sum + (t.length ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← Search
      </Link>

      <div className="flex gap-4 sm:gap-6 mb-8 sm:mb-10">
        <div className="shrink-0 w-28 h-28 sm:w-44 sm:h-44 rounded-lg overflow-hidden bg-zinc-800">
          {album.coverArtUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={album.coverArtUrl} alt={album.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <span className="text-zinc-500 text-xs text-center leading-snug">{album.title}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 leading-snug mb-1">
            {album.title}
          </h1>
          <p className="text-sm text-zinc-500 mb-3">
            {album.artistId ? (
              <Link href={`/artist/${album.artistId}`} className="hover:text-zinc-300 transition-colors">
                {album.artistName}
              </Link>
            ) : (
              album.artistName
            )}
            {album.year && <span className="text-zinc-700"> · {album.year}</span>}
            {album.tracks.length > 0 && (
              <span className="text-zinc-700">
                {" "}· {album.tracks.length} track{album.tracks.length === 1 ? "" : "s"}
                {totalMs > 0 && ` · ${formatDuration(totalMs)}`}
              </span>
            )}
          </p>

          {/* What everyone else made of it, shown next to the facts rather than
              beside the user's own score — it is context for deciding whether to
              listen, not a benchmark to rate against. Absent below
              COMMUNITY_MIN_RATINGS, because an average of one or two is that
              person's rating with their name taken off. */}
          {community && (
            <div className="mb-4 inline-flex items-baseline gap-2 rounded-full bg-zinc-900 px-3 py-1.5 ring-1 ring-inset ring-white/10">
              <span className="text-sm font-semibold tabular-nums text-brand-500">
                {community.average.toFixed(1)}
              </span>
              <span className="text-[11px] text-zinc-500">
                community average from {community.count}{" "}
                {community.count === 1 ? "rating" : "ratings"}
              </span>
            </div>
          )}

          {album.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {album.genres.slice(0, 6).map((g) => (
                <span
                  key={g}
                  className="text-[10px] px-2 py-0.5 bg-zinc-800 rounded text-zinc-400 capitalize"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          <AlbumActions
            mbid={album.id}
            albumTitle={album.title}
            artistName={album.artistName}
            releaseYear={album.year ? parseInt(album.year) : undefined}
            coverUrl={album.coverArtUrl ?? undefined}
            artistMbid={album.artistId}
            isLoggedIn={!!session?.user}
            initialStatus={userEntry?.status ?? null}
            initialRating={userEntry?.rating ?? null}
          />
        </div>
      </div>

      {album.tracks.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
              Tracklist
            </h2>
            <p className="text-[10px] text-zinc-700">
              {session?.user ? "Tap + to rate a track" : "Sign in to rate tracks"}
            </p>
          </div>
          <div>
            {album.tracks.map((track, i) => (
              <TrackRow
                key={track.id ?? i}
                track={track}
                index={i}
                albumTitle={album.title}
                artistName={album.artistName}
                artistMbid={album.artistId}
                releaseYear={album.year ? parseInt(album.year) : undefined}
                coverUrl={album.coverArtUrl ?? undefined}
                isLoggedIn={!!session?.user}
                existing={
                  trackEntries.get(track.id) ||
                  savedSongs.get(songKey(track.title, album.artistName)) ||
                  null
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
