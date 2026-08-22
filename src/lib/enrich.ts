import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAlbum, getTrack, catalogConfigured } from "@/lib/catalog";
import { artistGenresByName } from "@/lib/musicbrainz";

/**
 * Fills in the facts a saved row needs for analytics but the UI never asked for:
 * genres, track count and runtime.
 *
 * This exists because **nothing on the add path knows an item's genre.** Spotify
 * search results carry none, and Spotify no longer returns artist genres at all —
 * the field was withdrawn, so genres now come from MusicBrainz instead. Either way
 * a genre costs a network call the tapped card never made, which is why this runs
 * in `after()` and not during the save.
 *
 * Genres are cached per artist in `ArtistMeta`: a library with thirty Radiohead
 * items pays for one artist lookup, not thirty. Runtime comes from Spotify, which
 * still has it.
 */

/** Artists change genre roughly never; a month-old cache entry is fine. */
const ARTIST_TTL_MS = 30 * 86_400_000;

/**
 * Genres for one artist, from cache when possible.
 *
 * Keyed by Spotify artist id where there is one. Rows saved before the Spotify
 * migration have no artist id, so they fall back to a name-derived key — which is
 * also all MusicBrainz is matched on anyway.
 */
export async function artistGenres(
  artistId: string | null,
  artistName: string
): Promise<string[]> {
  const key = artistId ?? `name:${artistName.trim().toLowerCase()}`;

  const cached = await prisma.artistMeta.findUnique({ where: { artistId: key } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < ARTIST_TTL_MS) {
    return cached.genres;
  }

  const genres = await artistGenresByName(artistName);

  // Cached even when empty: an artist MusicBrainz has no genres for should not be
  // looked up again on every future save.
  await prisma.artistMeta.upsert({
    where: { artistId: key },
    create: { artistId: key, name: artistName, genres, fetchedAt: new Date() },
    update: { name: artistName, genres, fetchedAt: new Date() },
  });
  return genres;
}

/**
 * Genres for display, from the cache only — never blocking on a lookup.
 *
 * A page render must not wait on MusicBrainz: one request per second is fine in
 * the background and unacceptable in front of a user. So a cache miss shows no
 * genres this time and fills the cache for next time.
 */
export async function cachedArtistGenres(
  artistId: string | null,
  artistName: string
): Promise<string[]> {
  const key = artistId ?? `name:${artistName.trim().toLowerCase()}`;

  const row = await prisma.artistMeta
    .findUnique({ where: { artistId: key } })
    .catch(() => null);
  if (row) return row.genres;

  try {
    after(() => artistGenres(artistId, artistName).catch(() => {}));
  } catch {
    // No request context (a script, a test) — nothing to defer the work to.
  }
  return [];
}

/**
 * Enrich one library row. Safe to call on every save — an already-enriched row
 * returns without a single request.
 */
export async function enrichRow(logId: string): Promise<boolean> {
  if (!catalogConfigured()) return false;

  try {
    const row = await prisma.albumLog.findUnique({
      where: { id: logId },
      select: {
        id: true,
        mbid: true,
        itemType: true,
        artistMbid: true,
        artistName: true,
        enrichedAt: true,
      },
    });
    if (!row || row.enrichedAt) return false;

    const genres = await artistGenres(row.artistMbid, row.artistName);

    let trackCount: number | null = null;
    let durationMs: number | null = null;

    if (row.itemType === "SONG") {
      const track = await getTrack(row.mbid);
      trackCount = 1;
      durationMs = track.durationMs;
    } else {
      const album = await getAlbum(row.mbid);
      trackCount = album.totalTracks || album.tracks.length;
      // A tracklist missing durations should stay null rather than claim zero.
      const sum = album.tracks.reduce((n, t) => n + (t.length ?? 0), 0);
      durationMs = sum > 0 ? sum : null;
    }

    await prisma.albumLog.update({
      where: { id: logId },
      data: { genres, trackCount, durationMs, enrichedAt: new Date() },
    });

    /*
     * Backfill the events already written for this item. The ADDED event fires
     * before enrichment can possibly have run, so without this the *first* event
     * of every item's history is the one event with no genres on it — and a
     * genre-over-time chart would be missing exactly the adds it's plotting.
     */
    if (genres.length > 0) {
      await prisma.libraryEvent.updateMany({
        where: { mbid: row.mbid, genres: { isEmpty: true } },
        data: { genres },
      });
    }
    return true;
  } catch (err) {
    // Never fatal: an unenriched row is missing genre, not broken.
    console.error("enrichRow failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Enrich rows saved before enrichment existed, oldest first.
 *
 * One catalogue call per row and one per new artist, so it is deliberately batched
 * and never run from a page render. Call it from a script or a maintenance route.
 *
 * Returns rows actually enriched, *not* rows examined — so a caller looping until
 * it returns 0 terminates when the catalogue is unreachable or unconfigured,
 * rather than spinning on the same batch for ever.
 */
export async function enrichBacklog(userId?: string, limit = 25): Promise<number> {
  const rows = await prisma.albumLog.findMany({
    where: { enrichedAt: null, ...(userId ? { userId } : {}) },
    orderBy: { addedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let enriched = 0;
  for (const row of rows) if (await enrichRow(row.id)) enriched++;
  return enriched;
}
