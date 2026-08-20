import { getAlbumDetail, isNotFound } from "@/lib/musicbrainz";
import { resolveAlbumArtwork } from "@/lib/artwork";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExistingEntries, getSavedSongs, songKey } from "@/lib/library";
import { AlbumActions } from "@/components/AlbumActions";
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

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;

  let album;
  try {
    album = await getAlbumDetail(mbid);
  } catch (err) {
    if (isNotFound(err)) notFound();
    // Transient failure — offer a retry rather than a misleading 404.
    return (
      <div className="max-w-2xl mx-auto pt-20 text-center">
        <p className="text-zinc-400 text-sm mb-3">
          Could not load this album. MusicBrainz may be temporarily unavailable.
        </p>
        <Link
          href={`/album/${mbid}`}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
        >
          Try again
        </Link>
      </div>
    );
  }

  // iTunes has better coverage and larger images than Cover Art Archive; fall back
  // to CAA when it has nothing.
  const [itunesArt, session] = await Promise.all([
    resolveAlbumArtwork(album.title, album.artistName),
    auth(),
  ]);
  const artworkUrl = itunesArt ?? album.coverArtUrl;

  const [userEntry, trackEntries, savedSongs] = await Promise.all([
    session?.user?.id
      ? prisma.albumLog.findUnique({
          where: { userId_mbid: { userId: session.user.id, mbid: album.id } },
        })
      : Promise.resolve(null),
    getExistingEntries(
      session?.user?.id,
      album.tracks.map((t) => t.recordingId).filter((id): id is string => !!id)
    ),
    // Falls back to title+artist, since the same song may be saved under a
    // different MusicBrainz recording id.
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

      <div className="flex flex-col sm:flex-row gap-6 mb-10">
        <div className="shrink-0 w-44 h-44 rounded-lg overflow-hidden bg-zinc-800">
          {artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artworkUrl} alt={album.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <span className="text-zinc-500 text-xs text-center leading-snug">{album.title}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-zinc-100 leading-snug mb-1">
            {album.title}
          </h1>
          <p className="text-sm text-zinc-500 mb-3">
            {album.artistName}
            {album.year && <span className="text-zinc-700"> · {album.year}</span>}
            {album.tracks.length > 0 && (
              <span className="text-zinc-700">
                {" "}· {album.tracks.length} track{album.tracks.length === 1 ? "" : "s"}
                {totalMs > 0 && ` · ${formatDuration(totalMs)}`}
              </span>
            )}
          </p>

          {album.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {album.genres.slice(0, 6).map((g) => (
                <span
                  key={g.id}
                  className="text-[10px] px-2 py-0.5 bg-zinc-800 rounded text-zinc-400 capitalize"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}

          <AlbumActions
            mbid={album.id}
            albumTitle={album.title}
            artistName={album.artistName}
            releaseYear={album.year ? parseInt(album.year) : undefined}
            coverUrl={artworkUrl ?? undefined}
            artistMbid={album.artistMbid}
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
              {session?.user ? "Hover a track to rate it" : "Sign in to rate tracks"}
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
                artistMbid={album.artistMbid}
                releaseYear={album.year ? parseInt(album.year) : undefined}
                coverUrl={artworkUrl ?? undefined}
                isLoggedIn={!!session?.user}
                existing={
                  (track.recordingId && trackEntries.get(track.recordingId)) ||
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
