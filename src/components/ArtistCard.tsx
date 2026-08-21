import Link from "next/link";
import type { ArtistItem } from "@/lib/catalog";

/**
 * Spotify returns artist images in the search response, so this no longer needs to
 * be a client component fetching a photo per card — it was previously one extra
 * request per artist to an iTunes lookup, because MusicBrainz stores no images.
 */
export function ArtistCard({ artist }: { artist: ArtistItem }) {
  const initials = artist.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Link href={`/artist/${artist.id}`} className="group block text-center">
      <div className="aspect-square rounded-full overflow-hidden bg-zinc-800 mb-2 group-hover:opacity-80 transition-opacity">
        {artist.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.imageUrl}
            alt={artist.name}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-lg font-semibold text-zinc-600">{initials}</span>
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-zinc-200 line-clamp-1" title={artist.name}>
        {artist.name}
      </p>
      {artist.genres.length > 0 && (
        <p className="text-[10px] text-zinc-600 line-clamp-1 capitalize" title={artist.genres.join(", ")}>
          {artist.genres[0]}
        </p>
      )}
    </Link>
  );
}
