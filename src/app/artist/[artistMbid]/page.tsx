import {
  getArtist,
  getArtistAlbums,
  getSimilarArtists,
  type MBArtistRelation,
  type MBGenre,
} from "@/lib/musicbrainz";
import { auth } from "@/lib/auth";
import { ExpandableAlbums } from "@/components/ExpandableAlbums";
import { ExpandableArtists } from "@/components/ExpandableArtists";
import { ArtistSlideshow } from "@/components/ArtistSlideshow";
import { BandMembers } from "@/components/BandMembers";
import { getWikipediaArticle } from "@/lib/wikipedia";
import { ExpandableText } from "@/components/ExpandableText";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ artistMbid: string }>;
}) {
  const { artistMbid } = await params;

  let artist;
  try {
    artist = await getArtist(artistMbid);
  } catch (err) {
    const is404 = err instanceof Error && err.message.includes("404");
    if (is404) notFound();
    return (
      <div className="max-w-2xl mx-auto pt-20 text-center">
        <p className="text-zinc-500 text-sm mb-3">
          Could not load artist. MusicBrainz may be temporarily unavailable.
        </p>
        <a href="" className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
          Try again
        </a>
      </div>
    );
  }

  const genres: MBGenre[] = artist.genres ?? [];
  const genreTags = genres.slice(0, 5).map((g) => g.name);

  const [albums, session, similarArtists, wikiArticle] = await Promise.all([
    getArtistAlbums(artistMbid, 40, "album"),
    auth(),
    getSimilarArtists(genreTags, artistMbid, 12),
    getWikipediaArticle(artist.name ?? ""),
  ]);

  const name: string = artist.name ?? "Unknown Artist";
  const disambiguation: string | undefined = artist.disambiguation;
  const country: string | undefined = artist.country;
  const lifeSpan = artist["life-span"];
  const formed: string | undefined = lifeSpan?.begin ? lifeSpan.begin.slice(0, 4) : undefined;
  const disbanded: string | undefined =
    lifeSpan?.ended && lifeSpan.end ? lifeSpan.end.slice(0, 4) : undefined;

  // Dedup members by artist id — MusicBrainz creates one relation per membership stint
  const membersSeen = new Set<string>();
  const members: MBArtistRelation[] = (artist.relations ?? []).filter(
    (r: MBArtistRelation) => {
      if (r.type !== "member of band" || r.direction !== "backward") return false;
      if (membersSeen.has(r.artist.id)) return false;
      membersSeen.add(r.artist.id);
      return true;
    }
  );

  // Pass album stubs to the client slideshow — no server-side iTunes blocking
  const slideshowAlbums = albums.slice(0, 6).map((a) => ({
    mbid: a.id,
    title: a.title,
    artistName: name,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← Discover
      </Link>

      {/* Slideshow — loads client-side, non-blocking */}
      <ArtistSlideshow albums={slideshowAlbums} artistName={name} />

      {/* Header: left = info + about, right = members */}
      <div className="flex gap-10 mb-10">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-100 mb-1">{name}</h1>
          {disambiguation && (
            <p className="text-sm text-zinc-500 mb-2">{disambiguation}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-zinc-600 mb-3">
            {country && <span>{country}</span>}
            {formed && (
              <span>{disbanded ? `${formed}–${disbanded}` : `Est. ${formed}`}</span>
            )}
          </div>

          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {genres.slice(0, 8).map((g) => (
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

          {/* About — full Wikipedia intro */}
          {wikiArticle.intro && (
            <section className="mb-8">
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">
                About
              </h2>
              <ExpandableText text={wikiArticle.intro} initialParagraphs={3} />
            </section>
          )}

          {/* History — Wikipedia history/career/background section */}
          {wikiArticle.history && (
            <section className="mb-8">
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">
                History
              </h2>
              <ExpandableText text={wikiArticle.history} initialParagraphs={3} />
            </section>
          )}
        </div>

        {members.length > 0 && (
          <aside className="w-56 shrink-0">
            <BandMembers members={members} />
          </aside>
        )}
      </div>

      <ExpandableAlbums title="Discography" albums={albums} artistMbid={artistMbid} isLoggedIn={!!session?.user} />

      {similarArtists.length > 0 && (
        <ExpandableArtists title="Similar Artists" artists={similarArtists} />
      )}
    </div>
  );
}
