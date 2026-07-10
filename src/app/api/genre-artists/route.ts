import { NextRequest, NextResponse } from "next/server";
import { getGenreArtists } from "@/lib/musicbrainz";
import { resolveArtistArtwork } from "@/lib/artwork";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  if (!tag) return NextResponse.json({ artists: [] });

  const raw = await getGenreArtists(tag, 50, "low");
  const artists = shuffle(raw).slice(0, 16);

  await Promise.all(
    artists.map(async (a) => {
      const url = await resolveArtistArtwork(a.name);
      if (url) a.imageUrl = url;
    })
  );

  return NextResponse.json({ artists });
}
