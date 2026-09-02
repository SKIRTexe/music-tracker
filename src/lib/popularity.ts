import { popularityKey } from "@/lib/popularity-key";
import { prisma } from "@/lib/prisma";

/**
 * How much people actually listen to something, from Deezer.
 *
 * Spotify used to answer this and no longer does: `popularity` was withdrawn
 * alongside artist `genres` and `followers`, and as of 2026 it is absent from
 * track *and* album objects too — not empty, absent. Verified against the live
 * API. So the catalogue this app is built on can no longer say whether a record
 * is one people play.
 *
 * Deezer can, needs no credentials, and — the part that makes it affordable —
 * answers in batches:
 *
 *   /album/{id}/tracks    every track's rank in one request
 *   /artist/{id}/albums   every album's fan count in one request
 *
 * That is what decides where this appears. An album page costs two requests and
 * a discography costs two, so both are cheap enough to do inline. Search is not:
 * it would be one lookup per result, so it stays out. Popularity is context for
 * something you are already looking at, not a column in a list.
 *
 * **Two numbers, and they mean different things.** `fans` is an absolute count
 * and comparable across albums, which is what makes an artist's discography
 * readable at a glance. `rank` is only meaningful *relative to other tracks*, so
 * it is sent raw and the client compares within one album rather than pretending
 * 597,984 means something on its own.
 *
 * None of this is a rating. It says what people play, not what is good — a
 * distinction worth keeping in the copy, because the two diverge exactly where
 * it matters most.
 */

const API = "https://api.deezer.com";

/** Deezer asks for ~50 requests per 5 seconds; nothing here comes close. */
const TIMEOUT_MS = 6_000;

/**
 * Cached for a week. These numbers move slowly, and a stale fan count is a far
 * better outcome than a page that waits on a third party to render.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a page will wait for popularity before rendering without it.
 *
 * This is decoration on a page that is already useful, and it depends on a third
 * party the app does not control. A cold lookup that runs long must not hold the
 * response — the client reports any timeout as "can't reach the server", so a
 * slow Deezer presents as an outage of *this* app, which is both wrong and the
 * most alarming possible way to say "no fan count today".
 */
const DEADLINE_MS = 2_500;

export const NO_POPULARITY: AlbumPopularity = { fans: null, tracks: {}, previews: {} };

/**
 * Resolve `work`, or give up and return `fallback`.
 *
 * The abandoned promise is deliberately *not* cancelled: it keeps running to
 * populate the cache, so the visit that waited is the only one that misses out.
 * Callers hand it to `after()` so serverless does not freeze it mid-flight.
 */
export function withDeadline<T>(work: Promise<T>, fallback: T, ms = DEADLINE_MS): Promise<T> {
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export interface AlbumPopularity {
  /** Deezer fans for the album. Comparable between albums. */
  fans: number | null;
  /** Track rank keyed by normalised title. Only meaningful within one album. */
  tracks: Record<string, number>;
  /**
   * Thirty-second preview audio, keyed by normalised title.
   *
   * Deezer's, because Spotify no longer offers it: `preview_url` comes back
   * null for apps registered after they withdrew it, which was verified against
   * this app's own credentials rather than assumed. Deezer serves an MP3 with
   * no key and no auth, from the same album response the ranks come from — so
   * this costs nothing beyond a slightly larger cached body.
   *
   * The clips are what a preview endpoint is for, but they are Deezer's to
   * serve and could stop at any time. Everything treats a missing preview as
   * ordinary.
   */
  previews: Record<string, string>;
}

/** Lowercase, strip punctuation — the same shape as `songKey`, and for the same
 *  reason: "Exit Music (For A Film)" must match across two catalogues. */
const key = popularityKey;

/**
 * A cached GET.
 *
 * Reuses the `MbCache` table, which is a plain url → body → expiry store despite
 * its name — it was built for MusicBrainz, but nothing about it is specific to
 * it, and a second identical table would be worse than a slightly narrow name.
 */
/**
 * Some responses must never be cached.
 *
 * Deezer's preview URLs are signed and expire: a clip fetched now returns a
 * 479 KB MP3, and the same URL out of a day-old cache returns 403. Storing them
 * for a week produced a tracklist where every play button was silently dead —
 * which looked like a bug in the player, not in the cache.
 *
 * So the tracklist is always fetched live. It costs about 250ms and one request
 * to an unmetered endpoint, which is the price of the buttons working.
 */
function cacheable(path: string): boolean {
  return !path.includes("/tracks");
}

async function cachedGet<T>(path: string): Promise<T | null> {
  const url = `${API}${path}`;
  const useCache = cacheable(path);

  if (useCache) {
    try {
      const hit = await prisma.mbCache.findUnique({ where: { url } });
      if (hit && hit.expiresAt > new Date()) return JSON.parse(hit.body) as T;
    } catch {
      // A cache read failing is not a reason to skip the lookup.
    }
  }

  let body: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    body = await res.text();
  } catch {
    // Deezer being slow or down must never fail the page it decorates.
    return null;
  }

  const parsed = JSON.parse(body) as T & { error?: unknown };
  // Deezer answers 200 with an `error` object rather than an HTTP status.
  if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) return null;

  if (useCache) {
    try {
      const expiresAt = new Date(Date.now() + TTL_MS);
      await prisma.mbCache.upsert({
        where: { url },
        create: { url, body, expiresAt },
        update: { body, expiresAt },
      });
    } catch {
      // Losing the cache write only costs a repeat lookup.
    }
  }

  return parsed as T;
}

interface DeezerSearch<T> { data?: T[] }
interface DeezerAlbum { id: number; title: string; fans?: number; nb_tracks?: number; record_type?: string }
interface DeezerTrack { title: string; rank?: number; preview?: string }
interface DeezerArtist { id: number; name: string; nb_fan?: number }

/**
 * Find the Deezer album that matches an artist and title.
 *
 * Title alone is not enough, and taking the first hit is actively wrong. A
 * modern record is released as a run of singles under the *same name* as the
 * album, so searching "Stick Season" returns five one-track releases before the
 * fourteen-track album — all exact title matches. Picking the first gave a
 * tracklist of one, so exactly one song on the album got a play bar and the
 * other thirteen silently got none.
 *
 * `expectedTracks` is the Spotify album's own count, which settles it: prefer
 * the candidate whose length is closest, and break remaining ties on the longest,
 * since a deluxe edition still carries the standard tracks a page needs.
 */
async function findAlbum(
  artist: string,
  title: string,
  expectedTracks?: number
): Promise<DeezerAlbum | null> {
  const query = encodeURIComponent(`artist:"${artist.replace(/"/g, "")}" album:"${title.replace(/"/g, "")}"`);
  const found = await cachedGet<DeezerSearch<DeezerAlbum>>(`/search/album?q=${query}&limit=25`);
  const items = found?.data ?? [];
  if (items.length === 0) return null;

  const exact = items.filter((a) => key(a.title) === key(title));
  const pool = exact.length > 0 ? exact : items;

  return [...pool].sort((a, b) => {
    const aTracks = a.nb_tracks ?? 0;
    const bTracks = b.nb_tracks ?? 0;
    if (expectedTracks) {
      const diff = Math.abs(aTracks - expectedTracks) - Math.abs(bTracks - expectedTracks);
      if (diff !== 0) return diff;
    }
    // An album beats a single of the same name even when no count was given.
    const rank = (x: DeezerAlbum) => (x.record_type === "album" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return bTracks - aTracks;
  })[0];
}

/**
 * Fans for an album, plus every track's rank — two requests, both cached.
 *
 * Returns nulls rather than throwing on a miss. Matching is by text across two
 * catalogues, so obscure pressings simply will not resolve, and an album page
 * that renders without popularity is correct behaviour rather than an error.
 */
export async function albumPopularity(
  artist: string,
  title: string,
  expectedTracks?: number
): Promise<AlbumPopularity> {
  const empty: AlbumPopularity = { fans: null, tracks: {}, previews: {} };

  const album = await findAlbum(artist, title, expectedTracks);
  if (!album) return empty;

  const detail = await cachedGet<DeezerAlbum>(`/album/${album.id}`);
  const tracks = await cachedGet<DeezerSearch<DeezerTrack>>(`/album/${album.id}/tracks?limit=100`);

  const ranks: Record<string, number> = {};
  const previews: Record<string, string> = {};
  for (const track of tracks?.data ?? []) {
    if (!track.title) continue;
    if (typeof track.rank === "number") ranks[key(track.title)] = track.rank;
    // Only https. These end up in an audio player, and an http URL would be
    // blocked by App Transport Security anyway.
    if (typeof track.preview === "string" && track.preview.startsWith("https://")) {
      previews[key(track.title)] = track.preview;
    }
  }

  return { fans: detail?.fans ?? album.fans ?? null, tracks: ranks, previews };
}

/**
 * Fan counts across an artist's discography, keyed by normalised album title.
 *
 * This is the one that answers "which of their records should I actually hear":
 * one request returns every album with its fans, so a whole discography can be
 * ranked without a lookup per row.
 */
/**
 * The Deezer artist behind a name.
 *
 * Split out because two features need it and both need the same guard: an exact
 * name match is not enough, and taking the first hit is worse.
 */
async function findArtist(artist: string): Promise<DeezerArtist | null> {
  const query = encodeURIComponent(artist);
  const found = await cachedGet<DeezerSearch<DeezerArtist>>(`/search/artist?q=${query}&limit=25`);
  const candidates = (found?.data ?? []).filter((a) => key(a.name) === key(artist));
  return candidates.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0] ?? null;
}

/** An artist Deezer thinks sounds like one you already know. */
export interface RelatedArtist {
  name: string;
  fans: number;
}

/**
 * Artists similar to this one.
 *
 * The signal the catalogue cannot provide: Spotify withdrew
 * `/artists/{id}/related-artists` in November 2024, which is why suggestions had
 * been falling back to genre search — and why a library of Radiohead and Kendrick
 * Lamar was being offered David Guetta, since "electronic" is what a broad genre
 * seed resolves to.
 *
 * One request per artist, cached for a week, and the response already carries
 * follower counts, so ranking needs nothing further.
 */
export async function relatedArtists(artist: string): Promise<RelatedArtist[]> {
  const match = await findArtist(artist);
  if (!match) return [];

  const related = await cachedGet<DeezerSearch<DeezerArtist>>(`/artist/${match.id}/related?limit=25`);
  return (related?.data ?? [])
    .filter((a) => a.name && key(a.name) !== key(artist))
    .map((a) => ({ name: a.name, fans: a.nb_fan ?? 0 }));
}

export async function artistAlbumPopularity(artist: string): Promise<Record<string, number>> {
  const query = encodeURIComponent(artist);
  const found = await cachedGet<DeezerSearch<DeezerArtist>>(`/search/artist?q=${query}&limit=25`);

  /*
   * An exact name match is not enough, and assuming the first hit is worse.
   * Searching "Radiohead" returns a soundalike with 492 followers *ahead* of the
   * band — same name, exact match, wrong artist — and its (empty) discography
   * then silently attaches no numbers to anything. The same trap the catalogue
   * hit with MusicBrainz, where a hardcore band called "Beatles HC" hijacked the
   * query.
   *
   * Following count is the tiebreak, because that is the one signal an impostor
   * cannot fake: pick the most-followed of the exact matches.
   */
  const candidates = (found?.data ?? []).filter((a) => key(a.name) === key(artist));
  const match = candidates.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
  if (!match) return {};

  const albums = await cachedGet<DeezerSearch<DeezerAlbum>>(`/artist/${match.id}/albums?limit=100`);

  const out: Record<string, number> = {};
  for (const album of albums?.data ?? []) {
    if (typeof album.fans !== "number" || !album.title) continue;
    const k = key(album.title);
    // Deluxe and remastered editions repeat a title; keep the most-followed.
    out[k] = Math.max(out[k] ?? 0, album.fans);
  }
  return out;
}
