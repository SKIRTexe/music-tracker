import { NextRequest, NextResponse } from "next/server";
import { getGenreAlbums } from "@/lib/musicbrainz";
import { resolveAlbumArtwork } from "@/lib/artwork";
import type { MBAlbum } from "@/lib/musicbrainz";

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  if (!tag) return NextResponse.json({ singles: [] });

  const singles = await getGenreAlbums(tag, 50, "low", "single");

  // Resolve artwork in parallel
  await Promise.all(
    singles.map(async (s) => {
      const artist = (s as MBAlbum)["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(s.title, artist, s.id);
      if (url) s.coverUrl = url;
    })
  );

  return NextResponse.json({ singles: singles.slice(0, 16) });
}
