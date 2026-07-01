import { NextRequest, NextResponse } from "next/server";
import { getLocationArtists } from "@/lib/musicbrainz";
import { resolveArtistArtwork } from "@/lib/artwork";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const isCountry = req.nextUrl.searchParams.get("country") === "1";
  if (!slug) return NextResponse.json({ artists: [] });

  const artists = await getLocationArtists(slug, isCountry, 20, "low");

  await Promise.all(
    artists.map(async (a) => {
      const url = await resolveArtistArtwork(a.name);
      if (url) a.imageUrl = url;
    })
  );

  return NextResponse.json({ artists });
}
