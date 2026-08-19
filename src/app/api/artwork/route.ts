import { NextRequest, NextResponse } from "next/server";
import { resolveAlbumArtwork } from "@/lib/artwork";

/**
 * Cover art fallback. Result cards call this only when Cover Art Archive has no
 * image for a release, so the iTunes lookup stays off the critical path.
 */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const artist = req.nextUrl.searchParams.get("artist") ?? "";
  if (!title.trim()) return NextResponse.json({ url: null });

  const url = await resolveAlbumArtwork(title, artist);
  return NextResponse.json(
    { url },
    { headers: { "Cache-Control": "public, max-age=2592000" } }
  );
}
