import { NextRequest, NextResponse } from "next/server";
import { getLocationArtists } from "@/lib/musicbrainz";
import { resolveArtistArtwork } from "@/lib/artwork";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ artists: [] });

  const artists = await getLocationArtists(name, 20, "low");

  await Promise.all(
    artists.map(async (a) => {
      const url = await resolveArtistArtwork(a.name);
      if (url) a.imageUrl = url;
    })
  );

  return NextResponse.json({ artists });
}
