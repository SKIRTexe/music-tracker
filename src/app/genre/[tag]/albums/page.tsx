import { getGenreAlbums } from "@/lib/musicbrainz";
import { auth } from "@/lib/auth";
import { AlbumCard } from "@/components/AlbumCard";
import Link from "next/link";

function formatTag(tag: string): string {
  return tag
    .split(/[-\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function GenreAlbumsPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const [albums, session] = await Promise.all([
    getGenreAlbums(decoded, 60),
    auth(),
  ]);

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href={`/genre/${encodeURIComponent(decoded)}`}
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← {formatTag(decoded)}
      </Link>
      <h1 className="text-lg font-medium text-zinc-300 mb-8">
        {formatTag(decoded)} Albums
      </h1>
      {albums.length === 0 ? (
        <p className="text-zinc-600 text-sm">No albums found.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} isLoggedIn={!!session?.user} />
          ))}
        </div>
      )}
    </div>
  );
}
