import { prisma } from "@/lib/prisma";
import {
  getSession,
  ensurePlaylist,
  addTracks,
  removeTracks,
  urisForItem,
} from "@/lib/spotify";

/**
 * Incremental playlist sync, run in the background after a library change.
 *
 * Deliberately incremental rather than a full sync: adding touches only the new
 * item's tracks, and removing needs no catalogue lookup at all because
 * `PlaylistTrack` already records which URIs came from which library row.
 *
 * Every failure is recorded on `User.playlistSyncFailedAt` so `/library` can say the
 * playlist may be out of date. A background sync that fails silently is worse than
 * no background sync — you'd trust a playlist that's wrong.
 */

async function noteFailure(userId: string): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { playlistSyncFailedAt: new Date() } })
    .catch(() => {});
}

async function clearFailure(userId: string): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { playlistSyncFailedAt: null } })
    .catch(() => {});
}

/** Add one library item's tracks to the playlist. */
export async function syncItemAdded(
  userId: string,
  mbid: string,
  itemType: string
): Promise<void> {
  try {
    const spotify = await getSession(userId);
    if (!spotify) return; // Spotify not connected — nothing to keep in step.

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { spotifyPlaylistId: true },
    });

    // First add creates the playlist, so the list exists from the outset.
    const playlist = await ensurePlaylist(spotify, user?.spotifyPlaylistId ?? null);
    if (playlist.created) {
      await prisma.user.update({
        where: { id: userId },
        data: { spotifyPlaylistId: playlist.id },
      });
    }

    const { uris } = await urisForItem(spotify, itemType, mbid);
    if (uris.length === 0) return; // Not on Spotify; the full sync reports these.

    const already = await prisma.playlistTrack.findMany({
      where: { userId, playlistId: playlist.id, trackUri: { in: uris } },
      select: { trackUri: true },
    });
    const have = new Set(already.map((r) => r.trackUri));
    const toAdd = uris.filter((u) => !have.has(u));
    if (toAdd.length === 0) return;

    await addTracks(spotify, playlist.id, toAdd);
    await prisma.playlistTrack.createMany({
      data: toAdd.map((uri) => ({ userId, playlistId: playlist.id, trackUri: uri, sourceMbid: mbid })),
      skipDuplicates: true,
    });
    await clearFailure(userId);
  } catch {
    await noteFailure(userId);
  }
}

/**
 * Remove one library item's tracks from the playlist.
 *
 * Needs no Spotify catalogue lookup — the URIs this item contributed are already
 * recorded, which also means it only ever removes tracks the app put there.
 */
export async function syncItemRemoved(userId: string, mbid: string): Promise<void> {
  try {
    const rows = await prisma.playlistTrack.findMany({ where: { userId, sourceMbid: mbid } });
    if (rows.length === 0) return;

    const spotify = await getSession(userId);
    if (!spotify) return;

    // Group by playlist in case the id changed at some point.
    const byPlaylist = new Map<string, string[]>();
    for (const r of rows) {
      byPlaylist.set(r.playlistId, [...(byPlaylist.get(r.playlistId) ?? []), r.trackUri]);
    }

    for (const [playlistId, uris] of byPlaylist) {
      await removeTracks(spotify, playlistId, uris);
    }
    await prisma.playlistTrack.deleteMany({ where: { userId, sourceMbid: mbid } });
    await clearFailure(userId);
  } catch {
    await noteFailure(userId);
  }
}
