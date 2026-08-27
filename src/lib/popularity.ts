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

export interface AlbumPopularity {
  /** Deezer fans for the album. Comparable between albums. */
  fans: number | null;
  /** Track rank keyed by normalised title. Only meaningful within one album. */
  tracks: Record<string, number>;
}

/** Lowercase, strip punctuation — the same shape as `songKey`, and for the same
 *  reason: "Exit Music (For A Film)" must match across two catalogues. */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A cached GET.
 *
 * Reuses the `MbCache` table, which is a plain url → body → expiry store despite
 * its name — it was built for MusicBrainz, but nothing about it is specific to
 * it, and a second identical table would be worse than a slightly narrow name.
 */
async function cachedGet<T>(path: string): Promise<T | null> {
  const url = `${API}${path}`;

  try {
    const hit = await prisma.mbCache.findUnique({ where: { url } });
    if (hit && hit.expiresAt > new Date()) return JSON.parse(hit.body) as T;
  } catch {
    // A cache read failing is not a reason to skip the lookup.
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

  return parsed as T;
}

interface DeezerSearch<T> { data?: T[] }
interface DeezerAlbum { id: number; title: string; fans?: number }
interface DeezerTrack { title: string; rank?: number }
interface DeezerArtist { id: number; name: string; nb_fan?: number }

/** Find the Deezer album that matches an artist and title. */
async function findAlbum(artist: string, title: string): Promise<DeezerAlbum | null> {
  const query = encodeURIComponent(`artist:"${artist.replace(/"/g, "")}" album:"${title.replace(/"/g, "")}"`);
  const found = await cachedGet<DeezerSearch<DeezerAlbum>>(`/search/album?q=${query}&limit=5`);
  const items = found?.data ?? [];
  if (items.length === 0) return null;

  // Prefer an exact title match; Deezer will happily return a deluxe edition or
  // a tribute record for a loose query.
  return items.find((a) => key(a.title) === key(title)) ?? items[0];
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
  title: string
): Promise<AlbumPopularity> {
  const empty: AlbumPopularity = { fans: null, tracks: {} };

  const album = await findAlbum(artist, title);
  if (!album) return empty;

  const detail = await cachedGet<DeezerAlbum>(`/album/${album.id}`);
  const tracks = await cachedGet<DeezerSearch<DeezerTrack>>(`/album/${album.id}/tracks?limit=100`);

  const ranks: Record<string, number> = {};
  for (const track of tracks?.data ?? []) {
    if (typeof track.rank === "number" && track.title) ranks[key(track.title)] = track.rank;
  }

  return { fans: detail?.fans ?? album.fans ?? null, tracks: ranks };
}

/**
 * Fan counts across an artist's discography, keyed by normalised album title.
 *
 * This is the one that answers "which of their records should I actually hear":
 * one request returns every album with its fans, so a whole discography can be
 * ranked without a lookup per row.
 */
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
