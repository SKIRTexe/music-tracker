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
  resolveAlbum,
  resolveSong,
} from "@/lib/spotify";

export type ExportReport = {
  ok: boolean;
  message: string;
  playlistUrl?: string;
  /** Items found on Spotify, with what they matched. */
  matched: { label: string; matchedAs: string; trackCount: number }[];
  /** Items with no confident Spotify match. */
  missing: string[];
  added: number;
  alreadyPresent: number;
};

/**
 * Push everything in Want to Listen into one Spotify playlist. Albums are expanded
 * into their full tracklists, since a playlist can only hold tracks. Re-running
 * syncs the same playlist rather than creating another, and skips anything already
 * in it — so removing a track in Spotify keeps it removed.
 */
export async function exportWantToListen(): Promise<ExportReport> {
  const empty = { matched: [], missing: [], added: 0, alreadyPresent: 0 };

  const authSession = await auth();
  const userId = authSession?.user?.id;
  if (!userId) return { ok: false, message: "Please sign in.", ...empty };

  const spotify = await getSession(userId);
  if (!spotify) {
    return { ok: false, message: "Connect Spotify first.", ...empty };
  }

  const wanted = await prisma.albumLog.findMany({
    where: { userId, status: "WANT" },
    orderBy: { addedAt: "asc" },
    select: { albumTitle: true, artistName: true, itemType: true },
  });

  if (wanted.length === 0) {
    return {
      ok: false,
      message: "Nothing in Want to Listen yet.",
      ...empty,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { spotifyPlaylistId: true },
  });

  try {
    const playlist = await ensurePlaylist(spotify, user?.spotifyPlaylistId ?? null);
    if (playlist.created) {
      await prisma.user.update({
        where: { id: userId },
        data: { spotifyPlaylistId: playlist.id },
      });
    }

    const existing = await playlistTrackUris(spotify, playlist.id);

    const matched: ExportReport["matched"] = [];
    const missing: string[] = [];
    const toAdd: string[] = [];
    const queued = new Set<string>();
    let alreadyPresent = 0;

    for (const item of wanted) {
      const label = `${item.albumTitle} — ${item.artistName}`;
      const result =
        item.itemType === "SONG"
          ? await resolveSong(spotify, item.albumTitle, item.artistName)
          : await resolveAlbum(spotify, item.albumTitle, item.artistName);

      if (result.uris.length === 0) {
        missing.push(label);
        continue;
      }

      matched.push({
        label,
        matchedAs: result.matchedAs ?? label,
        trackCount: result.uris.length,
      });

      for (const uri of result.uris) {
        if (existing.has(uri)) {
          alreadyPresent++;
        } else if (!queued.has(uri)) {
          queued.add(uri);
          toAdd.push(uri);
        }
      }
    }

    if (toAdd.length > 0) await addTracks(spotify, playlist.id, toAdd);

    revalidatePath("/library");

    const parts = [`Added ${toAdd.length} track${toAdd.length === 1 ? "" : "s"}`];
    if (alreadyPresent > 0) parts.push(`${alreadyPresent} already there`);
    if (missing.length > 0) parts.push(`${missing.length} not found on Spotify`);

    return {
      ok: true,
      message: parts.join(" · "),
      playlistUrl: playlist.url,
      matched,
      missing,
      added: toAdd.length,
      alreadyPresent,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return { ok: false, message: `Spotify export failed: ${detail}`, ...empty };
  }
}

export async function disconnectSpotify(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await unlinkAccount(session.user.id);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { spotifyPlaylistId: null },
  });
  revalidatePath("/library");
}
