import { NextRequest, NextResponse } from "next/server";
import { resolveAlbumArtwork, resolveArtistArtwork } from "@/lib/artwork";

/**
 * Artwork fallback. Cards call this only when Cover Art Archive has no image (or,
 * for artists, where there is no cover art to begin with), so the iTunes lookup
 * stays off the critical path. Results are memoised server-side per process.
 *
 *   /api/artwork?title=OK+Computer&artist=Radiohead   → album cover
 *   /api/artwork?artist=Radiohead                    → artist photo
 */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim() ?? "";
  const artist = req.nextUrl.searchParams.get("artist")?.trim() ?? "";

  const url = title
    ? await resolveAlbumArtwork(title, artist)
    : artist
      ? await resolveArtistArtwork(artist)
      : null;

  return NextResponse.json(
    { url },
    { headers: { "Cache-Control": "public, max-age=2592000" } }
  );
}
