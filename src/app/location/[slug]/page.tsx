import { getLocationAlbums, getLocationArtists } from "@/lib/musicbrainz";
import { resolveAlbumArtwork, resolveArtistArtwork } from "@/lib/artwork";
import { auth } from "@/lib/auth";
import { Carousel } from "@/components/Carousel";
import { ArtistCarousel } from "@/components/ArtistCarousel";
import { GenreSlideshow } from "@/components/GenreSlideshow";
import { getWikipediaArticle } from "@/lib/wikipedia";
import { ExpandableText } from "@/components/ExpandableText";
import Link from "next/link";
import type { MBAlbum } from "@/lib/musicbrainz";

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

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function ModeToggle({ slug, mode }: { slug: string; mode: "albums" | "artists" }) {
  return (
    <div className="flex border border-zinc-800 rounded overflow-hidden text-xs w-fit mb-8">
      <Link
        href={`/location/${slug}`}
        className={`px-4 py-2 transition-colors ${
          mode === "albums"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Albums
      </Link>
      <Link
        href={`/location/${slug}?mode=artists`}
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

export default async function LocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { slug } = await params;
  const { mode } = await searchParams;

  const isArtistMode = mode === "artists";
  const isCountry = /^[A-Z]{2}$/.test(slug);

  let displayName: string;
  if (isCountry) {
    try {
      displayName = new Intl.DisplayNames(["en"], { type: "region" }).of(slug) ?? slug;
    } catch {
      displayName = slug;
    }
  } else {
    displayName = capitalizeWords(decodeURIComponent(slug));
  }

  // ── Artist mode ─────────────────────────────────────────────────────────────
  if (isArtistMode) {
    const [locationArtists, session, wikiArticle] = await Promise.all([
      getLocationArtists(displayName, 20, "high"),
      auth(),
      getWikipediaArticle(`${displayName} music`),
    ]);

    const slideshowSummary = wikiArticle.intro
      ?.split("\n")
      .find((p) => p.trim().length > 0) ?? undefined;

    // Resolve artwork in parallel
    await Promise.all(
      locationArtists.map(async (artist) => {
        const url = await resolveArtistArtwork(artist.name);
        if (url) artist.imageUrl = url;
      })
    );

    const seenIds = new Set<string>();
    const recommendedArtists = locationArtists
      .filter((a) => { if (seenIds.has(a.id)) return false; seenIds.add(a.id); return true; })
      .slice(0, 16);

    const slideshowAlbums = recommendedArtists.slice(0, 6).map((a) => ({
      title: a.name,
      artist: a.name,
    }));

    return (
      <div className="max-w-5xl mx-auto">
        <Link
          href="/"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-4 inline-block"
        >
          ← Discover
        </Link>

        <GenreSlideshow albums={slideshowAlbums} genre={displayName} summary={slideshowSummary} />

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

        <ModeToggle slug={slug} mode="artists" />

        <ArtistCarousel title="Artists" artists={recommendedArtists} />
      </div>
    );
  }

  // ── Album mode ───────────────────────────────────────────────────────────────
  const [genreResultsRaw, session, wikiArticle] = await Promise.all([
    Promise.all(
      GENRES.map(({ tag }) => getLocationAlbums(slug, isCountry, tag, 20, "high"))
    ),
    auth(),
    getWikipediaArticle(`${displayName} music`),
  ]);

  const genreResults = genreResultsRaw;

  const slideshowSummary = wikiArticle.intro
    ?.split("\n")
    .find((p) => p.trim().length > 0) ?? undefined;

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
      const url = await resolveAlbumArtwork(album.title, artist);
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
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-4 inline-block"
      >
        ← Discover
      </Link>

      <GenreSlideshow albums={slideshowAlbums} genre={displayName} summary={slideshowSummary} />

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

      <ModeToggle slug={slug} mode="albums" />

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
