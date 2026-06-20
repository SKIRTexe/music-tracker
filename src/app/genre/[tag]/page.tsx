import { getGenreAlbums, getGenreArtists } from "@/lib/musicbrainz";
import { auth } from "@/lib/auth";
import { ExpandableAlbums } from "@/components/ExpandableAlbums";
import { ExpandableArtists } from "@/components/ExpandableArtists";
import { GenreSlideshow } from "@/components/GenreSlideshow";
import { getWikipediaArticle } from "@/lib/wikipedia";
import { ExpandableText } from "@/components/ExpandableText";
import Link from "next/link";

function formatTag(tag: string): string {
  return tag
    .split(/[-\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function GenrePage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const formatted = formatTag(decoded);

  const [albums, artists, session, wikiArticle] = await Promise.all([
    getGenreAlbums(decoded, 40, "high"),
    getGenreArtists(decoded, 40, "high"),
    auth(),
    getWikipediaArticle(`${formatted} music`),
  ]);

  // First paragraph of intro for the slideshow banner overlay
  const slideshowSummary = wikiArticle.intro
    ?.split("\n")
    .find((p) => p.trim().length > 0) ?? undefined;

  const slideshowAlbums = albums.slice(0, 6).map((a) => ({
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

      {/* Full-width header banner with genre title + summary overlaid */}
      <GenreSlideshow albums={slideshowAlbums} genre={formatted} summary={slideshowSummary} />

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

      {/* Recommended albums carousel → popup */}
      <ExpandableAlbums
        title="Recommended Albums"
        albums={albums}
        isLoggedIn={!!session?.user}
      />

      {/* Recommended artists carousel → popup */}
      <ExpandableArtists title="Recommended Artists" artists={artists} />
    </div>
  );
}
