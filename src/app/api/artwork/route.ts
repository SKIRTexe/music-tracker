import { NextRequest, NextResponse } from "next/server";
import { resolveArtistArtwork } from "@/lib/artwork";

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist") ?? "";
  if (!artist.trim()) return NextResponse.json({ url: null });

  const url = await resolveArtistArtwork(artist);
  return NextResponse.json(
    { url },
    { headers: { "Cache-Control": "public, max-age=2592000" } }
  );
}
