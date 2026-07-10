import { getDecadeAlbums, getGenreArtists } from "@/lib/musicbrainz";
import { resolveAlbumArtwork, resolveArtistArtwork } from "@/lib/artwork";
import { auth } from "@/lib/auth";
import { Carousel } from "@/components/Carousel";
import { ArtistCarousel } from "@/components/ArtistCarousel";
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

function ModeToggle({ decade, mode }: { decade: string; mode: "albums" | "artists" }) {
  return (
    <div className="flex border border-zinc-800 rounded overflow-hidden text-xs w-fit mb-8">
      <Link
        href={`/decade/${decade}`}
        className={`px-4 py-2 transition-colors ${
          mode === "albums"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Albums
      </Link>
      <Link
        href={`/decade/${decade}?mode=artists`}
        className={`px-4 py-2 border-l border-zinc-800 transition-colors ${
          mode === "artists"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Artists
      </Link>
    </div>
  );
}

export default async function DecadePage({
  params,
  searchParams,
}: {
  params: Promise<{ decade: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { decade } = await params;
  const { mode } = await searchParams;

  if (!VALID_DECADES.includes(decade)) notFound();

  const isArtistMode = mode === "artists";
  const { startYear, endYear } = parseDecade(decade);

  const [session, wikiArticle] = await Promise.all([
    auth(),
    getWikipediaArticle(`${decade} in music`),
  ]);

  const slideshowSummary = wikiArticle.intro
    ?.split("\n")
    .find((p) => p.trim().length > 0) ?? undefined;

  // ── Artist mode ─────────────────────────────────────────────────────────────
  if (isArtistMode) {
    const artistGenreResults = await Promise.all(
      GENRES.map(({ tag }) => getGenreArtists(tag, 20, "high"))
    );

    // Resolve artwork in parallel
    const allArtists = artistGenreResults.flat();
    const uniqueArtists = [...new Map(allArtists.map((a) => [a.id, a])).values()];
    await Promise.all(
      uniqueArtists.map(async (artist) => {
        const url = await resolveArtistArtwork(artist.name);
        if (url) artist.imageUrl = url;
      })
    );

    // Build recommended by sampling from each genre
    const seenIds = new Set<string>();
    const recommendedArtists = artistGenreResults
      .flatMap((pool) => pool.slice(0, 3))
      .filter((a) => { if (seenIds.has(a.id)) return false; seenIds.add(a.id); return true; })
      .slice(0, 16);

    const slideshowAlbums = recommendedArtists.slice(0, 6).map((a) => ({
      title: a.name,
      artist: a.name,
    }));

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

        <ModeToggle decade={decade} mode="artists" />

        <ArtistCarousel title="Recommended Artists" artists={recommendedArtists} />

        {GENRES.map(({ label, tag }, i) => (
          <ArtistCarousel
            key={tag}
            title={label}
            artists={artistGenreResults[i] ?? []}
            href={`/genre/${encodeURIComponent(tag)}`}
          />
        ))}
      </div>
    );
  }

  // ── Album mode ───────────────────────────────────────────────────────────────
  const genreResults = await Promise.all(
    GENRES.map(({ tag }) => getDecadeAlbums(startYear, endYear, tag, 20, "high"))
  );

  // Build recommended by sampling from each genre — diverse cross-genre mix
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
      const url = await resolveAlbumArtwork(album.title, artist, album.id);
      if (url) album.coverUrl = url;
    })
  );

  const slideshowAlbums = recommended.slice(0, 6).map((a) => ({
    title: a.title,
    artist: a["artist-credit"]?.[0]?.artist?.name ?? "",
  }));

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

      <ModeToggle decade={decade} mode="albums" />

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
