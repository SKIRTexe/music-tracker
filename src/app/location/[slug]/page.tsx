import { auth } from "@/lib/auth";
import { getWikipediaArticle } from "@/lib/wikipedia";
import { ExpandableText } from "@/components/ExpandableText";
import { GenreSlideshow } from "@/components/GenreSlideshow";
import { LazyLocationAlbumCarousel, LazyLocationArtistCarousel } from "@/components/LazyLocationCarousel";
import Link from "next/link";

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
          mode === "albums" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Albums
      </Link>
      <Link
        href={`/location/${slug}?mode=artists`}
        className={`px-4 py-2 border-l border-zinc-800 transition-colors ${
          mode === "artists" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
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

  // Only server-side fetches: auth + Wikipedia (no MusicBrainz here)
  const [session, wikiArticle] = await Promise.all([
    auth(),
    getWikipediaArticle(`${displayName} music`),
  ]);

  const isLoggedIn = !!session?.user;

  const slideshowSummary = wikiArticle.intro
    ?.split("\n")
    .find((p) => p.trim().length > 0) ?? undefined;

  // Placeholder slideshow — carousels load client-side
  const slideshowAlbums = [{ title: displayName, artist: "" }];

  const countryParam = isCountry ? "&country=1" : "";
  const encodedSlug = encodeURIComponent(slug);
  const encodedName = encodeURIComponent(displayName);

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

      <ModeToggle slug={slug} mode={isArtistMode ? "artists" : "albums"} />

      {isArtistMode ? (
        // Artists mode — one lazy carousel
        <LazyLocationArtistCarousel
          title={`Artists from ${displayName}`}
          fetchUrl={`/api/location-artists?slug=${encodedSlug}${countryParam}`}
        />
      ) : (
        // Albums mode — per-genre lazy carousels
        GENRES.map(({ label, tag }) => (
          <LazyLocationAlbumCarousel
            key={tag}
            title={label}
            fetchUrl={`/api/location-albums?slug=${encodedSlug}${countryParam}&genre=${encodeURIComponent(tag)}`}
            isLoggedIn={isLoggedIn}
            href={`/genre/${encodeURIComponent(tag)}`}
            tag={tag}
          />
        ))
      )}
    </div>
  );
}
