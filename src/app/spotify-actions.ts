"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  getSession,
  unlinkAccount,
  ensurePlaylist,
  playlistTrackUris,
  addTracks,
  removeTracks,
  urisForItem,
} from "@/lib/spotify";

export type ExportReport = {
  ok: boolean;
  message: string;
  playlistUrl?: string;
  /** Items included, with what they resolved to. */
  matched: { label: string; matchedAs: string; trackCount: number }[];
  /** Items with no Spotify match. */
  missing: string[];
  added: number;
  removed: number;
  alreadyPresent: number;
};

/**
 * Sync Want to Listen into one Spotify playlist.
 *
 * Two-way: tracks for anything currently in Want to Listen are added, and tracks
 * this app previously added are removed once their library row leaves Want to Listen
 * (marked Listened, or deleted). Tracks the user added to the playlist by hand are
 * never touched — that's why every added track is recorded in PlaylistTrack rather
 * than inferred by diffing the playlist.
 *
 * Albums are expanded to their full tracklist, since a playlist holds only tracks.
 */
export async function exportWantToListen(): Promise<ExportReport> {
  const empty = { matched: [], missing: [], added: 0, removed: 0, alreadyPresent: 0 };

  const authSession = await auth();
  const userId = authSession?.user?.id;
  if (!userId) return { ok: false, message: "Please sign in.", ...empty };

  const spotify = await getSession(userId);
  if (!spotify) return { ok: false, message: "Connect Spotify first.", ...empty };

  const wanted = await prisma.albumLog.findMany({
    where: { userId, status: "WANT" },
    orderBy: { addedAt: "asc" },
    select: { mbid: true, albumTitle: true, artistName: true, itemType: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { spotifyPlaylistId: true },
  });

  // With nothing wanted there may still be tracks to clear out, so this only bails
  // when there's also nothing recorded as previously added.
  const tracked = await prisma.playlistTrack.findMany({ where: { userId } });
  if (wanted.length === 0 && tracked.length === 0) {
    return { ok: false, message: "Nothing in Want to Listen yet.", ...empty };
  }

  try {
    const playlist = await ensurePlaylist(spotify, user?.spotifyPlaylistId ?? null);
    if (playlist.created) {
      await prisma.user.update({
        where: { id: userId },
        data: { spotifyPlaylistId: playlist.id },
      });
    }

    const inPlaylist = await playlistTrackUris(spotify, playlist.id);

    // What the playlist should contain on our behalf.
    const matched: ExportReport["matched"] = [];
    const missing: string[] = [];
    const desired = new Map<string, string>(); // uri -> source library row

    for (const item of wanted) {
      const label = `${item.albumTitle} — ${item.artistName}`;
      const result = await urisForItem(spotify, item.itemType, item.mbid);
      if (result.uris.length === 0) {
        missing.push(label);
        continue;
      }
      matched.push({ label, matchedAs: result.label ?? label, trackCount: result.uris.length });
      for (const uri of result.uris) {
        if (!desired.has(uri)) desired.set(uri, item.mbid);
      }
    }

    const ourUris = new Set(tracked.filter((t) => t.playlistId === playlist.id).map((t) => t.trackUri));

    /*
     * Adopt untracked tracks that this sync wants anyway. Playlists populated
     * before tracking existed have no records, so without this their tracks could
     * never be removed. Only tracks a current Want to Listen item asks for are
     * adopted, so anything the user added by hand stays untracked and untouched.
     */
    const adopt = [...desired.keys()].filter((uri) => inPlaylist.has(uri) && !ourUris.has(uri));
    if (adopt.length > 0) {
      await prisma.playlistTrack.createMany({
        data: adopt.map((uri) => ({
          userId,
          playlistId: playlist.id,
          trackUri: uri,
          sourceMbid: desired.get(uri)!,
        })),
        skipDuplicates: true,
      });
      for (const uri of adopt) ourUris.add(uri);
    }

    const toAdd = [...desired.keys()].filter((uri) => !inPlaylist.has(uri));
    // Ours, no longer wanted. Anything not in `ourUris` was added by the user.
    const toRemove = [...ourUris].filter((uri) => !desired.has(uri) && inPlaylist.has(uri));
    // Recorded but already gone from Spotify — the user deleted it there.
    const staleRecords = [...ourUris].filter((uri) => !inPlaylist.has(uri));

    if (toAdd.length > 0) await addTracks(spotify, playlist.id, toAdd);
    if (toRemove.length > 0) await removeTracks(spotify, playlist.id, toRemove);

    // Keep our record of the playlist in step with what we just did.
    if (toAdd.length > 0) {
      await prisma.playlistTrack.createMany({
        data: toAdd.map((uri) => ({
          userId,
          playlistId: playlist.id,
          trackUri: uri,
          sourceMbid: desired.get(uri)!,
        })),
        skipDuplicates: true,
      });
    }
    const forget = [...toRemove, ...staleRecords];
    if (forget.length > 0) {
      await prisma.playlistTrack.deleteMany({
        where: { userId, playlistId: playlist.id, trackUri: { in: forget } },
      });
    }

    const alreadyPresent = [...desired.keys()].filter((uri) => inPlaylist.has(uri)).length;
    // A successful manual sync clears any background-sync warning.
    await prisma.user.update({ where: { id: userId }, data: { playlistSyncFailedAt: null } });
    revalidatePath("/library");

    const parts: string[] = [];
    if (toAdd.length > 0) parts.push(`Added ${toAdd.length}`);
    if (toRemove.length > 0) parts.push(`removed ${toRemove.length}`);
    if (alreadyPresent > 0) parts.push(`${alreadyPresent} unchanged`);
    if (missing.length > 0) parts.push(`${missing.length} not on Spotify`);
    if (parts.length === 0) parts.push("Already up to date");

    return {
      ok: true,
      message: parts.join(" · "),
      playlistUrl: playlist.url,
      matched,
      missing,
      added: toAdd.length,
      removed: toRemove.length,
      alreadyPresent,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return { ok: false, message: `Spotify sync failed: ${detail}`, ...empty };
  }
}

export async function disconnectSpotify(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await unlinkAccount(session.user.id);
  await prisma.playlistTrack.deleteMany({ where: { userId: session.user.id } });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { spotifyPlaylistId: null },
  });
  revalidatePath("/library");
}
