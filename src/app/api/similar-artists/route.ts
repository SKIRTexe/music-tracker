import { NextRequest, NextResponse } from "next/server";
import { getSimilarArtists } from "@/lib/musicbrainz";
import { resolveArtistArtwork } from "@/lib/artwork";

export async function GET(req: NextRequest) {
  const mbid = req.nextUrl.searchParams.get("mbid");
  const tagsParam = req.nextUrl.searchParams.get("tags");
  if (!mbid || !tagsParam) return NextResponse.json({ artists: [] });

  const tags = tagsParam.split(",").filter(Boolean);
  const artists = await getSimilarArtists(tags, mbid, 12);

  await Promise.all(
    artists.map(async (a) => {
      const url = await resolveArtistArtwork(a.name);
      if (url) a.imageUrl = url;
    })
  );

  return NextResponse.json({ artists });
}
