import { NextRequest, NextResponse } from "next/server";
import { getLocationAlbums } from "@/lib/musicbrainz";
import { resolveAlbumArtwork } from "@/lib/artwork";
import type { MBAlbum } from "@/lib/musicbrainz";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const isCountry = req.nextUrl.searchParams.get("country") === "1";
  const genre = req.nextUrl.searchParams.get("genre") ?? undefined;
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const fromYear = fromParam ? parseInt(fromParam) : undefined;
  const toYear = toParam ? parseInt(toParam) : undefined;
  if (!slug) return NextResponse.json({ albums: [] });

  const albums = await getLocationAlbums(slug, isCountry, genre, 20, "low", fromYear, toYear);

  await Promise.all(
    albums.map(async (a) => {
      const artist = (a as MBAlbum)["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(a.title, artist, a.id);
      if (url) a.coverUrl = url;
    })
  );

  return NextResponse.json({ albums });
}
