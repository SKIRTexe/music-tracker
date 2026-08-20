import { prisma } from "@/lib/prisma";

export type ExistingEntry = { status: string; rating: number | null };

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
