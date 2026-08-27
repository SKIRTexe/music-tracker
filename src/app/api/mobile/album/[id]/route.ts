import { NextResponse } from "next/server";
import { getAlbum, CatalogNotFound } from "@/lib/catalog";
import { getExistingEntries, getSavedSongs, songKey } from "@/lib/library";
import { userIdFromRequest } from "@/lib/mobile-auth";
import { albumPopularity } from "@/lib/popularity";

/**
 * An album, its tracklist, and the user's standing on the album and on every
 * track — one request, because the detail screen needs all of it before it can
 * draw a single row.
 */
export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  let album;
  try {
    album = await getAlbum(id);
  } catch (err) {
    if (err instanceof CatalogNotFound) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("mobile album:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "catalog_error" }, { status: 502 });
  }

  const userId = (await userIdFromRequest(req)) ?? undefined;
  const [byId, songs, popularity] = await Promise.all([
    getExistingEntries(userId, [album.id]),
    getSavedSongs(userId),
    // Two cached Deezer requests. Never throws — an album page without
    // popularity is correct, not an error.
    albumPopularity(album.artistName, album.title),
  ]);

  const existing: Record<string, { status: string; rating: number | null }> = {};
  const saved = byId.get(album.id);
  if (saved) existing[album.id] = saved;
  for (const track of album.tracks) {
    // A track's own artist isn't on the album payload; the album artist is the
    // right key, and it is what the save path stores for a track added here.
    const hit = songs.get(songKey(track.title, album.artistName));
    if (hit) existing[track.id] = hit;
  }

  return NextResponse.json({ ...album, existing, popularity });
};
