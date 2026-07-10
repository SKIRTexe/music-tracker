import { NextRequest, NextResponse } from "next/server";
import { getArtistAlbums } from "@/lib/musicbrainz";
import { resolveAlbumArtwork } from "@/lib/artwork";
import type { MBAlbum } from "@/lib/musicbrainz";

export async function GET(req: NextRequest) {
  const mbid = req.nextUrl.searchParams.get("mbid");
  if (!mbid) return NextResponse.json({ singles: [] });

  const singles = await getArtistAlbums(mbid, 40, "single");

  await Promise.all(
    singles.map(async (s) => {
      const artist = (s as MBAlbum)["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(s.title, artist, s.id);
      if (url) s.coverUrl = url;
    })
  );

  return NextResponse.json({ singles });
}
