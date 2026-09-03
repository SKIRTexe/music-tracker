import { NextResponse } from "next/server";
import { communityRating } from "@/lib/social";
import { reviewsForAlbum } from "@/lib/reviews";
import { clientKey, memoryLimit, tooMany } from "@/lib/rate-limit";
import { getAlbum, CatalogNotFound } from "@/lib/catalog";
import { getExistingEntries, getSavedSongs, songKey } from "@/lib/library";
import { userIdFromRequest } from "@/lib/mobile-auth";
import { albumPopularity, withDeadline, NO_POPULARITY } from "@/lib/popularity";
import { after } from "next/server";

/**
 * An album, its tracklist, and the user's standing on the album and on every
 * track — one request, because the detail screen needs all of it before it can
 * draw a single row.
 */
export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  // These are open proxies onto Spotify's quota — no sign-in required, because
  // browsing the catalogue without an account is the point. The in-memory
  // limiter is per-instance and therefore leaky, which is the right trade here:
  // a database round trip on every search would cost more than the abuse it
  // prevents, and this app has exhausted its connection pool before. It exists
  // to stop one client hammering the quota, not to be exact.
  const gate = memoryLimit(clientKey(req, "album"), 120, 60_000);
  if (!gate.ok) return tooMany(gate.retryAfter);

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
  // Two cached Deezer requests. Never throws, and never delays the page: past
  // the deadline the album renders without it and the lookup finishes in the
  // background, so the next visit has it.
  const lookup = albumPopularity(album.artistName, album.title, album.totalTracks);
  after(async () => {
    await lookup.catch(() => {});
  });

  const [byId, songs, popularity] = await Promise.all([
    getExistingEntries(userId, [album.id]),
    getSavedSongs(userId),
    withDeadline(lookup, NO_POPULARITY),
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

  // Cheap: one indexed aggregate over AlbumLog, and null below the disclosure
  // floor rather than a number built from one or two people.
  // Both are indexed lookups keyed on the album, so they run together rather
  // than adding their latencies to a page that already waited on the catalogue.
  const [community, reviews] = await Promise.all([
    communityRating(id),
    reviewsForAlbum(id, userId ?? null),
  ]);

  return NextResponse.json({ ...album, existing, popularity, community, reviews });
};
