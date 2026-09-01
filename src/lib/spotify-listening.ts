import { prisma } from "@/lib/prisma";
import { getSession, api } from "@/lib/spotify";
import type { SearchItem } from "@/lib/catalog";

/**
 * Albums you have actually listened to but never rated.
 *
 * The best recommendation this app can make is not a guess: it is a record the
 * person has already played and simply never got round to scoring. Genre
 * inference is what you do when you know nothing about someone. This is what
 * you do when they have handed you their listening.
 *
 * **Top tracks, not recently-played.** `/me/player/recently-played` holds the
 * last 50 plays and nothing older, so it is dominated by whatever happened to
 * be on this morning. `/me/top/tracks` is Spotify's own ranking over months,
 * which is the question being asked — what does this person actually listen to.
 *
 * Tracks rather than `/me/top/artists`, because an artist is not a thing you
 * rate here. Grouping tracks by their album gives both the album and a measure
 * of how much of it they play.
 */

/** Albums whose whole reason for existing is one song. */
const MIN_TRACKS = 4;

/**
 * A refresh token carries the scopes it was granted at authorisation.
 * `user-top-read` was added after the first accounts linked, so those tokens
 * cannot read this no matter how many times it is retried — and Spotify answers
 * with a 403 that means nothing to a user. Checking the stored scope lets the
 * UI say "reconnect Spotify" instead, which is the only thing that fixes it.
 */
export async function hasListeningScope(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "spotify" },
    select: { scope: true },
  });
  return !!account?.scope?.includes("user-top-read");
}

interface TopTrack {
  album: {
    id: string;
    name: string;
    album_type: string;
    total_tracks: number;
    release_date: string | null;
    images: { url: string; width: number | null }[];
    artists: { id: string; name: string }[];
  };
}

/**
 * Two windows, merged.
 *
 * `medium_term` is roughly the last six months and is the stable picture;
 * `short_term` is the last four weeks and is what someone is on right now. A
 * record that appears in both is the strongest candidate there is, so hits are
 * summed rather than deduplicated away.
 */
const WINDOWS = [
  { range: "medium_term", weight: 1 },
  { range: "short_term", weight: 1.5 },
] as const;

export async function albumsFromListening(
  userId: string,
  limit = 12
): Promise<SearchItem[]> {
  const session = await getSession(userId);
  if (!session) return [];
  if (!(await hasListeningScope(userId))) return [];

  const scores = new Map<string, { score: number; album: TopTrack["album"] }>();

  for (const { range, weight } of WINDOWS) {
    let page: { items: TopTrack[] };
    try {
      page = await api(session, `/me/top/tracks?time_range=${range}&limit=50`);
    } catch (err) {
      // One window failing should not lose the other. A brand-new Spotify
      // account legitimately has no top tracks and answers with an empty list,
      // but a revoked grant throws here.
      console.error("spotify listening:", err instanceof Error ? err.message : err);
      continue;
    }

    page.items?.forEach((track, index) => {
      const album = track.album;
      if (!album?.id) return;
      // Singles and compilations are not things you sit down and rate.
      if (album.album_type !== "album") return;
      if ((album.total_tracks ?? 0) < MIN_TRACKS) return;

      // Rank matters: a track at position 1 says more than one at 50.
      const rankWeight = 1 - index / 60;
      const found = scores.get(album.id);
      if (found) found.score += weight * rankWeight;
      else scores.set(album.id, { score: weight * rankWeight, album });
    });
  }

  if (scores.size === 0) return [];

  // Anything already rated is not a suggestion — it is the thing this is trying
  // to produce. Saved-but-unrated stays in: those are the best candidates of
  // all, since the person already meant to get to them.
  const rated = await prisma.albumLog.findMany({
    where: { userId, rating: { not: null } },
    select: { mbid: true },
  });
  const alreadyRated = new Set(rated.map((r) => r.mbid));

  return [...scores.values()]
    .filter(({ album }) => !alreadyRated.has(album.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ album }) => ({
      id: album.id,
      itemType: "ALBUM" as const,
      title: album.name,
      artistName: album.artists?.[0]?.name ?? "Unknown",
      artistId: album.artists?.[0]?.id ?? null,
      year: album.release_date ? album.release_date.slice(0, 4) : null,
      coverArtUrl:
        [...(album.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null,
      detailId: album.id,
      totalTracks: album.total_tracks,
      releaseDate: album.release_date ?? undefined,
    }));
}
