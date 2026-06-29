import { getDecadeAlbums } from "@/lib/musicbrainz";
import { resolveAlbumArtwork } from "@/lib/artwork";
import { auth } from "@/lib/auth";
import { Carousel } from "@/components/Carousel";
import { GenreSlideshow } from "@/components/GenreSlideshow";
import { getWikipediaArticle } from "@/lib/wikipedia";
import { ExpandableText } from "@/components/ExpandableText";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { MBAlbum } from "@/lib/musicbrainz";

const VALID_DECADES = ["1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"];

const GENRES = [
  { label: "Rock",       tag: "rock" },
  { label: "Jazz",       tag: "jazz" },
  { label: "Electronic", tag: "electronic" },
  { label: "Hip-Hop",    tag: "hip-hop" },
  { label: "Pop",        tag: "pop" },
  { label: "Soul",       tag: "soul" },
  { label: "Folk",       tag: "folk" },
  { label: "Metal",      tag: "metal" },
];

function parseDecade(slug: string): { startYear: number; endYear: number } {
  const start = parseInt(slug);
  return { startYear: start, endYear: start + 9 };
}

export default async function DecadePage({
  params,
}: {
  params: Promise<{ decade: string }>;
}) {
  const { decade } = await params;

  if (!VALID_DECADES.includes(decade)) notFound();

  const { startYear, endYear } = parseDecade(decade);

  const [genreResults, session, wikiArticle] = await Promise.all([
    Promise.all(GENRES.map(({ tag }) => getDecadeAlbums(startYear, endYear, tag, 20, "high"))),
    auth(),
    getWikipediaArticle(`${decade} in music`),
  ]);

  // Build recommended by sampling 2 from each genre — diverse cross-genre mix
  const seenIds = new Set<string>();
  const recommended = genreResults
    .flatMap((pool) => pool.slice(0, 3))
    .filter((a) => { if (seenIds.has(a.id)) return false; seenIds.add(a.id); return true; })
    .slice(0, 16);

  // Resolve artwork for all displayed albums in parallel
  const allAlbums = [...recommended, ...genreResults.flat()];
  const unique = [...new Map(allAlbums.map((a) => [a.id, a])).values()];
  await Promise.all(
    unique.map(async (album) => {
      const artist = (album as MBAlbum)["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(album.title, artist);
      if (url) album.coverUrl = url;
    })
  );

  const slideshowAlbums = recommended.slice(0, 6).map((a) => ({
    title: a.title,
    artist: a["artist-credit"]?.[0]?.artist?.name ?? "",
  }));

  const slideshowSummary = wikiArticle.intro
    ?.split("\n")
    .find((p) => p.trim().length > 0) ?? undefined;

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/decade"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-4 inline-block"
      >
        ← Decades
      </Link>

      <GenreSlideshow albums={slideshowAlbums} genre={decade} summary={slideshowSummary} />

      {wikiArticle.intro && (
        <section className="mb-8">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">
            About
          </h2>
          <ExpandableText text={wikiArticle.intro} initialParagraphs={3} />
        </section>
      )}

      {wikiArticle.history && (
        <section className="mb-8">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">
            History
          </h2>
          <ExpandableText text={wikiArticle.history} initialParagraphs={3} />
        </section>
      )}

      <Carousel
        title="Recommended"
        albums={recommended}
        isLoggedIn={!!session?.user}
      />

      {GENRES.map(({ label, tag }, i) => {
        const albums = genreResults[i] ?? [];
        if (albums.length === 0) return null;
        return (
          <Carousel
            key={tag}
            title={label}
            albums={albums}
            isLoggedIn={!!session?.user}
            href={`/genre/${encodeURIComponent(tag)}`}
            tag={tag}
          />
        );
      })}
    </div>
  );
}
