import { getAlbum, getAlbumImages, type MBGenre } from "@/lib/musicbrainz";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AlbumActions } from "@/components/AlbumActions";
import { ImageSlideshow } from "@/components/ImageSlideshow";
import { getWikipediaArticle } from "@/lib/wikipedia";
import { ExpandableText } from "@/components/ExpandableText";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getItunesArtwork(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&entity=album&limit=5`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
        next: { revalidate: 86400 },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const tl = title.toLowerCase();
    const match =
      data.results?.find((r: { collectionName?: string }) =>
        r.collectionName?.toLowerCase().includes(tl)
      ) ?? data.results?.[0];
    return match?.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null;
  } catch {
    return null;
  }
}

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
    album = await getAlbum(mbid);
  } catch (err) {
    const is404 = err instanceof Error && err.message.includes("404");
    if (is404) notFound();
    // Transient error — show retry prompt instead of 404
    return (
      <div className="max-w-2xl mx-auto pt-20 text-center">
        <p className="text-zinc-500 text-sm mb-3">Could not load album. MusicBrainz may be temporarily unavailable.</p>
        <a href="" className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2">Try again</a>
      </div>
    );
  }

  const artist = album["artist-credit"]?.[0]?.artist?.name ?? "Unknown Artist";
  const artistId = album["artist-credit"]?.[0]?.artist?.id;
  const year = album.date ? album.date.slice(0, 4) : null;
  const tracks = album.media?.flatMap((m) => m.tracks ?? []) ?? [];
  const genres: MBGenre[] = album.genres ?? [];

  const [artworkUrl, caaImages, session, wikiArticle] = await Promise.all([
    getItunesArtwork(album.title, artist),
    getAlbumImages(mbid),
    auth(),
    getWikipediaArticle(`${album.title} ${artist} album`),
  ]);

  const slideshowImages =
    caaImages.length > 0 ? caaImages : artworkUrl ? [artworkUrl] : [];

  let userEntry = null;
  if (session?.user?.id) {
    userEntry = await prisma.albumLog.findUnique({
      where: { userId_mbid: { userId: session.user.id, mbid } },
    });
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← Discover
      </Link>

      {/* Slideshow */}
      {slideshowImages.length > 0 && (
        <ImageSlideshow images={slideshowImages} alt={album.title} />
      )}

      {/* Album header */}
      <div className="flex gap-6 mb-8">
        <div className="shrink-0 w-44 h-44 rounded-lg overflow-hidden bg-zinc-800">
          {artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artworkUrl} alt={album.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <span className="text-zinc-600 text-xs text-center leading-snug">{album.title}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-zinc-100 leading-snug mb-1">
            {album.title}
          </h1>
          <p className="text-sm text-zinc-500 mb-2">
            {artistId ? (
              <Link href={`/artist/${artistId}`} className="hover:text-zinc-300 transition-colors">
                {artist}
              </Link>
            ) : (
              artist
            )}
            {year && <span className="text-zinc-700"> · {year}</span>}
          </p>

          {/* Genre tags */}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {genres.slice(0, 6).map((g) => (
                <Link
                  key={g.id}
                  href={`/genre/${encodeURIComponent(g.name)}`}
                  className="text-[10px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors capitalize"
                >
                  {g.name}
                </Link>
              ))}
            </div>
          )}

          <AlbumActions
            mbid={mbid}
            albumTitle={album.title}
            artistName={artist}
            releaseYear={year ? parseInt(year) : undefined}
            coverUrl={artworkUrl ?? undefined}
            isLoggedIn={!!session?.user}
            initialStatus={userEntry?.status ?? null}
            initialRating={userEntry?.rating ?? null}
          />
        </div>
      </div>

      {/* About */}
      {wikiArticle.intro && (
        <section className="mb-8">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">
            About
          </h2>
          <ExpandableText text={wikiArticle.intro} initialParagraphs={3} />
        </section>
      )}

      {/* History */}
      {wikiArticle.history && (
        <section className="mb-8">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">
            History
          </h2>
          <ExpandableText text={wikiArticle.history} initialParagraphs={3} />
        </section>
      )}

      {/* Tracklist */}
      {tracks.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">
            Tracklist
          </h2>
          <div>
            {tracks.map((track, i) => (
              <div
                key={track.id ?? i}
                className="flex items-center justify-between py-2.5 border-b border-zinc-800/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-zinc-700 w-5 text-right shrink-0 tabular-nums">
                    {track.number ?? i + 1}
                  </span>
                  <span className="text-sm text-zinc-300 truncate">{track.title}</span>
                </div>
                {track.length && (
                  <span className="text-xs text-zinc-600 shrink-0 ml-4 tabular-nums">
                    {formatDuration(track.length)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
