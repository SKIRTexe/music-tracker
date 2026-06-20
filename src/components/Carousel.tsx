import Link from "next/link";
import { AlbumCard } from "@/components/AlbumCard";
import type { MBAlbum } from "@/lib/musicbrainz";

interface CarouselProps {
  title: string;
  albums: MBAlbum[];
  isLoggedIn: boolean;
  href?: string;
  favoriteButton?: React.ReactNode;
}

export function Carousel({ title, albums, isLoggedIn, href, favoriteButton }: CarouselProps) {
  if (albums.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center mb-4">
        {href ? (
          <Link href={href} className="group inline-flex items-center gap-1.5">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">
              {title}
            </h2>
            <span className="text-xs text-zinc-700 group-hover:text-zinc-400 transition-colors">→</span>
          </Link>
        ) : (
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
            {title}
          </h2>
        )}
        {favoriteButton}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
        ))}
      </div>
    </section>
  );
}
