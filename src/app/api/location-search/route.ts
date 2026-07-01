import { NextRequest, NextResponse } from "next/server";
import { getLocationArtists, searchAlbumsByArtists } from "@/lib/musicbrainz";
import { resolveAlbumArtwork, resolveArtistArtwork } from "@/lib/artwork";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const isCountry = req.nextUrl.searchParams.get("country") === "1";
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!slug || !q) return NextResponse.json({ albums: [], artists: [] });

  // Get artists from this location (cached — shared with album/genre routes)
  const locationArtists = await getLocationArtists(slug, isCountry, 20, "low");
  if (locationArtists.length === 0) return NextResponse.json({ albums: [], artists: [] });

  // Filter artists whose names match the query
  const ql = q.toLowerCase();
  const matchingArtists = locationArtists.filter((a) =>
    a.name.toLowerCase().includes(ql)
  );

  // Search albums by location artists matching the query title/artist
  const artistIds = locationArtists.map((a) => a.id);
  const albums = await searchAlbumsByArtists(artistIds, q, 20, "low");

  // Resolve artwork in parallel
  await Promise.all([
    ...matchingArtists.map(async (a) => {
      const url = await resolveArtistArtwork(a.name);
      if (url) a.imageUrl = url;
    }),
    ...albums.map(async (album) => {
      const artist = album["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(album.title, artist);
      if (url) album.coverUrl = url;
    }),
  ]);

  return NextResponse.json({ albums, artists: matchingArtists });
}
