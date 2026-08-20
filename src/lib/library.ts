import { prisma } from "@/lib/prisma";

export type ExistingEntry = { status: string; rating: number | null };

/** Lowercase, strip punctuation — so "Kid-A" and "Kid A" are the same song. */
export function songKey(title: string, artistName: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${clean(title)}|${clean(artistName)}`;
}

/**
 * Which of these MusicBrainz ids the user has already saved, so result cards can
 * show their current status and rating instead of a bare "add" button.
 */
export async function getExistingEntries(
  userId: string | undefined,
  mbids: string[]
): Promise<Map<string, ExistingEntry>> {
  const map = new Map<string, ExistingEntry>();
  if (!userId || mbids.length === 0) return map;

  const rows = await prisma.albumLog.findMany({
    where: { userId, mbid: { in: mbids } },
    select: { mbid: true, status: true, rating: true },
  });
  for (const row of rows) {
    map.set(row.mbid, { status: row.status, rating: row.rating });
  }
  return map;
}

/**
 * The user's saved songs, keyed by title+artist rather than by id.
 *
 * MusicBrainz models a recording per release, so one studio song can have a dozen
 * recording ids — "Karma Police" has eleven for Radiohead alone with nothing to
 * tell them apart. Song search and an album's tracklist therefore often reference
 * different ids for what anyone would call the same song. Matching on title+artist
 * is what makes a song show as rated no matter which surface you came through.
 */
export async function getSavedSongs(
  userId: string | undefined
): Promise<Map<string, ExistingEntry>> {
  const map = new Map<string, ExistingEntry>();
  if (!userId) return map;

  const rows = await prisma.albumLog.findMany({
    where: { userId, itemType: "SONG" },
    select: { albumTitle: true, artistName: true, status: true, rating: true },
  });
  for (const row of rows) {
    map.set(songKey(row.albumTitle, row.artistName), {
      status: row.status,
      rating: row.rating,
    });
  }
  return map;
}
