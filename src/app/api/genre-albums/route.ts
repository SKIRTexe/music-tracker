import { NextRequest, NextResponse } from "next/server";
import { getGenreAlbums, getDecadeAlbums } from "@/lib/musicbrainz";
import { resolveAlbumArtwork } from "@/lib/artwork";

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
  if (!tag) return NextResponse.json({ albums: [] });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const raw = from && to
    ? await getDecadeAlbums(parseInt(from), parseInt(to), tag, 30, "low")
    : await getGenreAlbums(tag, 50, "low");

  const albums = shuffle(raw).slice(0, 16);

  await Promise.all(
    albums.map(async (a) => {
      const artist = a["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(a.title, artist, a.id);
      if (url) a.coverUrl = url;
    })
  );

  return NextResponse.json({ albums });
}
