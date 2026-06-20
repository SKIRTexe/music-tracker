import { getGenreArtists } from "@/lib/musicbrainz";
import { ArtistCard } from "@/components/ArtistCard";
import Link from "next/link";

function formatTag(tag: string): string {
  return tag
    .split(/[-\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function GenreArtistsPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const artists = await getGenreArtists(decoded, 60);

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href={`/genre/${encodeURIComponent(decoded)}`}
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← {formatTag(decoded)}
      </Link>
      <h1 className="text-lg font-medium text-zinc-300 mb-8">
        {formatTag(decoded)} Artists
      </h1>
      {artists.length === 0 ? (
        <p className="text-zinc-600 text-sm">No artists found.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      )}
    </div>
  );
}
