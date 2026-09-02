import { prisma } from "@/lib/prisma";

/**
 * Lyrics, from LRCLIB.
 *
 * Free, no key, no signup, and it returns both plain text and a timestamped
 * LRC version. The alternatives do not work for this: Genius's API returns
 * metadata and a link but never the words, and Musixmatch's free tier returns
 * about a third of a song. Scraping either is against their terms.
 *
 * It is community-sourced, so coverage is uneven — a well-known record is
 * almost always there, an obscure pressing often is not. A miss is ordinary and
 * is cached as such, so the same absent track is not looked up on every visit.
 */

const API = "https://lrclib.net/api/get";
const TIMEOUT_MS = 4_000;

/** Lyrics do not change. A month is short only because the *absence* of them can. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Lyrics {
  plain: string | null;
  /** LRC format: `[mm:ss.xx] line`, timed against the full track. */
  synced: string | null;
  /** Whoever LRCLIB matched, so a wrong match is visible rather than silent. */
  matchedTitle: string | null;
  matchedArtist: string | null;
}

const MISS: Lyrics = { plain: null, synced: null, matchedTitle: null, matchedArtist: null };

export async function getLyrics(params: {
  artist: string;
  track: string;
  album?: string;
  /** Seconds. LRCLIB uses it to disambiguate versions of the same song. */
  duration?: number;
}): Promise<Lyrics> {
  const query = new URLSearchParams({
    artist_name: params.artist,
    track_name: params.track,
  });
  if (params.album) query.set("album_name", params.album);
  if (params.duration) query.set("duration", String(Math.round(params.duration)));

  const url = `${API}?${query.toString()}`;

  try {
    const hit = await prisma.mbCache.findUnique({ where: { url } });
    if (hit && hit.expiresAt > new Date()) return JSON.parse(hit.body) as Lyrics;
  } catch {
    // A cache read failing is not a reason to skip the lookup.
  }

  let result: Lyrics = MISS;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        // LRCLIB asks callers to identify themselves. The same courtesy
        // MusicBrainz requires, and the reason this app has MB_CONTACT set.
        "User-Agent": `Recordcrate (${process.env.MB_CONTACT ?? "https://github.com/SKIRTexe"})`,
      },
    });
    // 404 is the ordinary "no lyrics for this", not a failure.
    if (res.ok) {
      const body = (await res.json()) as {
        plainLyrics?: string | null;
        syncedLyrics?: string | null;
        trackName?: string;
        artistName?: string;
      };
      result = {
        plain: body.plainLyrics?.trim() || null,
        synced: body.syncedLyrics?.trim() || null,
        matchedTitle: body.trackName ?? null,
        matchedArtist: body.artistName ?? null,
      };
    }
  } catch {
    // Slow or unreachable. Cached as a miss below, which is right: a lyric
    // sheet that sometimes appears is worse than one that consistently does not.
    return MISS;
  }

  try {
    await prisma.mbCache.upsert({
      where: { url },
      create: { url, body: JSON.stringify(result), expiresAt: new Date(Date.now() + TTL_MS) },
      update: { body: JSON.stringify(result), expiresAt: new Date(Date.now() + TTL_MS) },
    });
  } catch {
    // Losing the cache write only costs a repeat lookup.
  }

  return result;
}
