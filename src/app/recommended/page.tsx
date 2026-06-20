import { getFeaturedAlbums } from "@/lib/musicbrainz";
import { auth } from "@/lib/auth";
import { AlbumCard } from "@/components/AlbumCard";
import Link from "next/link";

export default async function RecommendedPage() {
  const [albums, session] = await Promise.all([
    getFeaturedAlbums(40),
    auth(),
  ]);

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-6 inline-block"
      >
        ← Discover
      </Link>
      <h1 className="text-lg font-medium text-zinc-300 mb-8">Recommended</h1>

      {albums.length === 0 ? (
        <p className="text-zinc-600 text-sm">No recommendations available.</p>
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
