import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/mobile-auth";
import { spotifyConfigured } from "@/lib/spotify";
import { exportWantToListenFor, disconnectSpotifyFor } from "@/lib/spotify-export";

/**
 * Whether Spotify is connected, and whether the playlist can be trusted.
 *
 * `syncFailedAt` is the point of `User.playlistSyncFailedAt`: a background sync
 * that failed silently is worse than none, because you would go on trusting a
 * stale playlist. The app shows a warning from this exactly as `/library` does.
 */
export const GET = authed(async (_req, userId) => {
  const [account, user, wantCount] = await Promise.all([
    prisma.account.findFirst({
      where: { userId, provider: "spotify" },
      select: { providerAccountId: true, scope: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { spotifyPlaylistId: true, playlistSyncFailedAt: true },
    }),
    prisma.albumLog.count({ where: { userId, status: "WANT" } }),
  ]);

  return NextResponse.json({
    configured: spotifyConfigured(),
    linked: !!account,
    /*
     * Whether this connection may read listening history.
     *
     * A refresh token carries the scopes granted when it was issued, so a link
     * made before `user-top-read` existed cannot read it and never will without
     * re-consenting. Spotify answers with a bare 403, so the app needs to be
     * told here — otherwise the only thing that fixes it, reconnecting, is the
     * one thing the user has no reason to try.
     */
    canReadListening: !!account?.scope?.includes("user-top-read"),
    playlistId: user?.spotifyPlaylistId ?? null,
    playlistUrl: user?.spotifyPlaylistId
      ? `https://open.spotify.com/playlist/${user.spotifyPlaylistId}`
      : null,
    syncFailedAt: user?.playlistSyncFailedAt ?? null,
    wantCount,
  });
});

/**
 * Run the sync.
 *
 * Slow by nature — every wanted album is a Spotify search plus a tracklist fetch
 * — and deliberately awaited rather than backgrounded, because the whole value of
 * pressing Sync by hand is being told what it did. The report comes back with the
 * items that matched and the ones that did not: unmatched items are reported, never
 * silently dropped.
 */
export const POST = authed(async (_req, userId) => {
  return NextResponse.json(await exportWantToListenFor(userId));
});

/** Disconnect, forgetting the link and everything this app put in the playlist. */
export const DELETE = authed(async (_req, userId) => {
  await disconnectSpotifyFor(userId);
  return NextResponse.json({ ok: true });
});
