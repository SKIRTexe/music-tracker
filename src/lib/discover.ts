/**
 * The landing page's two suggestion rows: albums to hear, artists to look at.
 *
 * Deliberately cheap. Suggestions are seeded from genres the library *already*
 * has — `AlbumLog.genres` is denormalised precisely so a genre breakdown needs no
 * catalogue call — and turned into results by two Spotify searches, which the
 * catalogue's fetch cache shares across every user seeded from the same genre.
 * So the whole feature is one database query and, in the common case, no live
 * request at all.
 *
 * Nothing here is personalised beyond that: there is no recommendation endpoint
 * to call. Spotify withdrew `/recommendations` and `/artists/{id}/related-artists`
 * in November 2024, so genre search is what is left.
 */

import { prisma } from "@/lib/prisma";
import {
  discoverByGenre,
  artistsByIds,
  SEARCH_PAGE_SIZE,
  type ArtistItem,
  type GenreResults,
  type SearchItem,
} from "@/lib/catalog";

const ALBUMS_SHOWN = 6;
const ARTISTS_SHOWN = 6;

/** Two seeds, interleaved, so a row is not all one sound. */
const SEEDS = 2;

/** How many genres the daily rotation draws those two from. */
const SEED_POOL = 6;

/** A genre held by a single item is an accident of one artist, not a taste. */
const MIN_ITEMS = 2;

/**
 * How many seeds are tried before settling on the two used. A genre Spotify covers
 * badly is only detectable by asking, so candidates are fetched in parallel and the
 * duds discarded.
 */
const CANDIDATES = 3;

/**
 * A genre whose artist search returns fewer than this is one Spotify barely indexes,
 * and its tracks are long-tail junk. Measured: the genres that work return 5–10
 * artists, the ones that do not return 0–1.
 */
const ARTIST_QUALITY_MIN = 3;

/** Ratings at or below this are not an endorsement, so they seed nothing. */
const NEUTRAL_RATING = 5;

/**
 * Seeds for an account with no genres yet — a new one, or rows the background
 * enrichment has not reached. Broad on purpose: these are shown cold, and a
 * narrow genre reads as a strange thing to be handed by an app that knows
 * nothing about you yet.
 */
const DEFAULT_SEEDS = [
  "indie rock",
  "hip hop",
  "jazz",
  "soul",
  "dream pop",
  "post-punk",
  "electronic",
  "folk",
];

export interface Discover {
  albums: SearchItem[];
  artists: ArtistItem[];
  /** What the rows were seeded from, so the page can say why they are there. */
  genres: string[];
  /** Whether those genres came from the user's library or from the defaults. */
  personal: boolean;
}

const EMPTY: Discover = { albums: [], artists: [], genres: [], personal: false };

/**
 * Days since the epoch. The rows turn over daily rather than on every load —
 * suggestions that reshuffle while you are looking at them read as noise, and a
 * stable day also means the catalogue cache is actually hit.
 */
function today(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/** `count` items starting at `start`, wrapping — the daily rotation. */
function rotate<T>(list: T[], start: number, count: number): T[] {
  return Array.from({ length: Math.min(count, list.length) }, (_, i) =>
    list[(start + i) % list.length]
  );
}

/** One from each list in turn, so neither seed genre owns the front of the row. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

/**
 * Interleave, drop anything unwanted or sharing a `key` with something already
 * taken, stop at `limit`.
 *
 * The key is not always the id. A genre track search returns many tracks by the
 * same popular artist and each one maps to a *different* album, so keying albums
 * by id gives six distinct rows that are three Laufey records — a row that reads
 * as one artist rather than a genre.
 */
function take<T>(
  lists: T[][],
  keep: (item: T) => boolean,
  key: (item: T) => string,
  limit: number
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of interleave(lists)) {
    const k = key(item);
    if (seen.has(k) || !keep(item)) continue;
    seen.add(k);
    out.push(item);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * The genres worth searching, best first.
 *
 * Support-weighted, and deliberately so — an earlier version preferred a library's
 * *distinctive* genres over its broad ones, on the theory that `genre:"rock"` is too
 * generic to discover anything. Measured against the live API it is the reverse:
 * Spotify indexes broad genres well and narrow ones barely at all. `indie rock`
 * returns Arctic Monkeys and Tame Impala; `piano rock` and `singer-songwriter`
 * return a long tail of knockoff uploads. Rating is the weight rather than the
 * ranking, so a genre you rate highly rises among genres you own comparably much of.
 *
 * The seed still has to survive the quality gate in `getDiscover`, because library
 * support does not predict Spotify's coverage.
 */
function rankSeeds(rows: { genres: string[]; rating: number | null }[]): string[] {
  const stat = new Map<string, { n: number; rated: number; sum: number }>();
  for (const row of rows) {
    for (const genre of row.genres) {
      const e = stat.get(genre) ?? { n: 0, rated: 0, sum: 0 };
      e.n++;
      if (row.rating != null) {
        e.rated++;
        e.sum += row.rating;
      }
      stat.set(genre, e);
    }
  }

  return [...stat.entries()]
    .filter(([, e]) => e.n >= MIN_ITEMS)
    .map(([genre, e]) => {
      // A genre with nothing rated yet still counts, mildly: a library that is all
      // Want to Listen deserves suggestions too.
      const average = e.rated > 0 ? e.sum / e.rated : NEUTRAL_RATING + 1;
      return { genre, score: Math.max(0, average - NEUTRAL_RATING) * e.n };
    })
    .filter((seed) => seed.score > 0)
    .sort((a, b) => b.score - a.score || a.genre.localeCompare(b.genre))
    .slice(0, SEED_POOL)
    .map((seed) => seed.genre);
}

export async function getDiscover(userId?: string): Promise<Discover> {
  // One pass over the library covers both jobs: what to seed from, and what to
  // leave out because it is already saved.
  const saved = userId
    ? await prisma.albumLog.findMany({
        where: { userId },
        select: { mbid: true, genres: true, rating: true, artistMbid: true, artistName: true },
      })
    : [];

  const top = rankSeeds(saved);
  const personal = top.length > 0;
  const candidates = personal
    ? rotate(top, today() % top.length, CANDIDATES)
    : rotate(DEFAULT_SEEDS, today() % DEFAULT_SEEDS.length, CANDIDATES);

  // Keep a genre you always have and you would still see the same six albums for
  // ever, so the window into it moves too.
  const offset = (today() % 3) * SEARCH_PAGE_SIZE;

  const savedAlbums = new Set(saved.map((r) => r.mbid));
  const savedArtists = new Set(
    saved.flatMap((r) => [r.artistMbid, r.artistName.toLowerCase()].filter(Boolean) as string[])
  );

  // Keyed by artist, so the row is six artists rather than one artist six times.
  const pickAlbums = (rs: GenreResults[]) =>
    take(
      rs.map((r) => r.albums),
      (a) => !savedAlbums.has(a.id),
      (a) => (a.artistId ?? a.artistName).toLowerCase(),
      ALBUMS_SHOWN
    );

  // Fetched in parallel rather than tried in turn, so the gate costs one extra
  // request rather than a second round-trip.
  const tried = await Promise.all(
    candidates.map(async (genre) => ({ genre, res: await discoverByGenre(genre, { offset }) }))
  );
  const good = tried.filter((t) => t.res.artists.length >= ARTIST_QUALITY_MIN);
  const chosen = (good.length >= SEEDS ? good : [...good, ...tried.filter((t) => !good.includes(t))])
    .slice(0, SEEDS);

  const genres = chosen.map((c) => c.genre);
  let results = chosen.map((c) => c.res);
  let albums = pickAlbums(results);

  // A narrow genre is nearly all singles — "piano rock" yields one album per ten
  // tracks — so one page cannot fill the row. Paged only when it comes up short,
  // rather than always, because the common case should stay at one request each.
  if (albums.length < ALBUMS_SHOWN) {
    const more = await Promise.all(
      genres.map((g) => discoverByGenre(g, { offset: offset + SEARCH_PAGE_SIZE }))
    );
    results = results.map((r, i) => ({
      albums: [...r.albums, ...more[i].albums],
      artists: [...r.artists, ...more[i].artists],
      trackArtists: [...r.trackArtists, ...more[i].trackArtists],
    }));
    albums = pickAlbums(results);
  }

  // An artist already in the library is not a discovery — you know them. Nor is
  // one whose record is sitting in the row directly above.
  const shownAbove = new Set(
    albums.flatMap((a) => [a.artistId, a.artistName.toLowerCase()].filter(Boolean) as string[])
  );
  const wanted = (id: string, name: string) =>
    !savedArtists.has(id) &&
    !savedArtists.has(name.toLowerCase()) &&
    !shownAbove.has(id) &&
    !shownAbove.has(name.toLowerCase());

  // Free, but empty for a good half of genres — Spotify withdrew artist genres and
  // the search index went with them for anything but the common names.
  let artists = take(
    results.map((r) => r.artists),
    (a) => wanted(a.id, a.name),
    (a) => a.id,
    ARTISTS_SHOWN
  );

  // Fall back to the artists behind the matched tracks, which every genre has. They
  // arrive without images, and the batch endpoint is 403, so only the few actually
  // being shown are hydrated.
  if (artists.length < ARTISTS_SHOWN) {
    const have = new Set(artists.map((a) => a.id));
    const fill = take(
      results.map((r) => r.trackArtists),
      (a) => wanted(a.id, a.name) && !have.has(a.id),
      (a) => a.id,
      ARTISTS_SHOWN - artists.length
    );
    artists = [...artists, ...(await artistsByIds(fill.map((a) => a.id)))];
  }

  if (albums.length === 0 && artists.length === 0) return EMPTY;
  return { albums, artists, genres, personal };
}
