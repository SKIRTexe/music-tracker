"use client";

import Link from "next/link";
import { ScoreBadge, StatusMarker, CoverTag } from "@/components/Badges";

export type LibraryEntry = {
  id: string;
  mbid: string;
  itemType: string;
  albumTitle: string;
  artistName: string;
  parentAlbum: string | null;
  releaseYear: number | null;
  status: string;
  rating: number | null;
  coverUrl: string | null;
  addedAt: Date;
};

/**
 * A saved album or song. Pass `onRemove` to show the remove button — omit it for
 * read-only contexts like the homepage.
 */
export function LibraryItemCard({
  entry,
  onRemove,
}: {
  entry: LibraryEntry;
  onRemove?: (mbid: string) => void;
}) {
  const isSong = entry.itemType === "SONG";
  // Songs are stored under a recording id, which has no album page of its own.
  const href = isSong ? null : `/album/${entry.mbid}`;

  const cover = (
    <div className="aspect-square rounded-lg overflow-hidden bg-zinc-800 relative">
      {entry.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.coverUrl}
          alt={entry.albumTitle}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-3">
          <span className="text-zinc-500 text-xs text-center leading-snug line-clamp-3">
            {entry.albumTitle}
          </span>
        </div>
      )}

      {/* The same badges as the app and as a search result, so a shelf reads for
          "what have I rated" without reading a single title. */}
      <div className="absolute top-1.5 right-1.5 pointer-events-none">
        {entry.rating != null ? (
          <ScoreBadge rating={entry.rating} compact />
        ) : (
          <StatusMarker status={entry.status === "LISTENED" ? "LISTENED" : "WANT"} />
        )}
      </div>
      {isSong && (
        <div className="absolute bottom-1.5 left-1.5 pointer-events-none">
          <CoverTag text="Song" />
        </div>
      )}
    </div>
  );

  return (
    <div className="group relative">
      {href ? (
        <Link href={href} className="block hover:opacity-80 transition-opacity">
          {cover}
        </Link>
      ) : (
        cover
      )}

      <div className="mt-2">
        <p className="text-xs font-medium text-zinc-200 line-clamp-1" title={entry.albumTitle}>
          {entry.albumTitle}
        </p>
        <p className="text-xs text-zinc-500 truncate">{entry.artistName}</p>
      </div>

      {onRemove && (
        <button
          onClick={() => onRemove(entry.mbid)}
          aria-label={`Remove ${entry.albumTitle}`}
          className="absolute top-1 left-1 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus:opacity-100 transition-opacity bg-zinc-950/80 rounded-full w-8 h-8 sm:w-6 sm:h-6 text-[11px] text-zinc-300 hover:text-zinc-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
