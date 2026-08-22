/**
 * MusicBrainz, back for one job only: genres.
 *
 * It was removed as the *catalogue* because it is slow and capped at roughly one
 * request per second, which made a search take seventeen seconds. None of that
 * applies here. This is the only source of genre data left — Spotify's artist
 * object no longer returns `genres` at all, the field is simply absent from the
 * payload — and it is used on a completely different profile:
 *
 * - **Never on a page load.** Only from `after()`, via `enrichRow`.
 * - **Once per artist, ever.** Results are cached in `ArtistMeta`, so a library
 *   with thirty Radiohead albums costs two requests in total, not sixty.
 *
 * So the rate limit is not a constraint worth engineering around — it just needs
 * to be respected, which `MB_REQUEST_GAP_MS` below does.
 *
 * MusicBrainz genres also come with vote counts, which Spotify's flat list never
 * had, so the top few are genuinely the artist's main genres rather than whatever
 * order the API felt like.
 */

import { prisma } from "@/lib/prisma";

const API = "https://musicbrainz.org/ws/2";

/**
 * Anonymous clients get roughly one request per second, and exceeding it gets the
 * IP blocked — which presents as `TypeError: fetch failed` rather than an HTTP
 * error, so it looks exactly like an outage. Do not lower this.
 */
const MB_REQUEST_GAP_MS = 1100;

/** Genres change rarely, and a wrong genre is not an outage. Cache hard. */
const CACHE_TTL_MS = 30 * 86_400_000;

/** How many genres to keep per artist, highest-voted first. */
const MAX_GENRES = 5;

/**
 * MusicBrainz also blocks fake User-Agents, so `MB_CONTACT` must be real contact
 * info. Without it, requests are not attempted at all rather than sent under a
 * User-Agent that could get the deployment banned.
 */
function userAgent(): string | null {
  const contact = process.env.MB_CONTACT;
  if (!contact) return null;
  return `Recordcrate/1.0 ( ${contact} )`;
}

export function genresConfigured(): boolean {
  return userAgent() !== null;
}

// ── Request queue ─────────────────────────────────────────────────────────────

/**
 * Every request is chained onto the last, one gap apart. A queue rather than a
 * timestamp check because enrichment runs several lookups back to back, and two
 * concurrent `after()` callbacks would otherwise each see "last request was ages
 * ago" and fire together.
 */
let tail: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  // Keeps the chain alive regardless of individual failures.
  tail = result.then(
    () => new Promise((r) => setTimeout(r, MB_REQUEST_GAP_MS)),
    () => new Promise((r) => setTimeout(r, MB_REQUEST_GAP_MS))
  );
  return result;
}

/**
 * A GET against MusicBrainz, cached in `MbCache` across serverless instances.
 *
 * The table already existed for this purpose. On Vercel the in-process cache dies
 * with each lambda, so without a shared cache the "once per artist" claim above
 * would be once per artist *per instance*.
 */
async function mb<T>(path: string): Promise<T | null> {
  const agent = userAgent();
  if (!agent) return null;

  const url = `${API}${path}`;

  const cached = await prisma.mbCache
    .findUnique({ where: { url } })
    .catch(() => null);
  if (cached && cached.expiresAt > new Date()) {
    return JSON.parse(cached.body) as T;
  }

  const body = await enqueue(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": agent, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${path}`);
    return res.text();
  });

  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await prisma.mbCache
    .upsert({
      where: { url },
      create: { url, body, expiresAt },
      update: { body, expiresAt },
    })
    .catch(() => {});

  return JSON.parse(body) as T;
}

// ── Genres ────────────────────────────────────────────────────────────────────

type MbSearch = { artists?: { id: string; name: string; score?: number }[] };
type MbArtist = { genres?: { name: string; count?: number }[] };

/**
 * Genres for an artist, by name.
 *
 * Two requests: a search to turn the name into an id, then a lookup for the
 * genres. Names are quoted because MusicBrainz search is Lucene — unquoted,
 * `artist:Kacey Musgraves` binds only the first word to the field and matches
 * anything called "Kacey", which is the same trap the Spotify search hit.
 *
 * **Returns `null` when the question could not be asked** — no `MB_CONTACT`, a
 * network failure, an HTTP error — as distinct from `[]`, which means
 * MusicBrainz was asked and genuinely has no genres for this artist. Callers
 * must not cache `null`. Collapsing the two is how an unset environment variable
 * turns into every artist being permanently genre-less: the empty answer gets
 * cached, and nothing ever asks again.
 */
export async function artistGenresByName(name: string): Promise<string[] | null> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  if (!genresConfigured()) return null;

  try {
    const escaped = trimmed.replace(/["\\]/g, "\\$&");
    const query = encodeURIComponent(`artist:"${escaped}"`);
    const found = await mb<MbSearch>(`/artist?query=${query}&fmt=json&limit=1`);
    if (!found) return null;

    // Searched successfully, and MusicBrainz has no such artist. A real answer.
    const id = found.artists?.[0]?.id;
    if (!id) return [];

    const artist = await mb<MbArtist>(`/artist/${id}?inc=genres&fmt=json`);
    if (!artist) return null;

    return [...(artist.genres ?? [])]
      // Vote count first, then alphabetically so equal-vote genres keep a stable
      // order between runs.
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name))
      .slice(0, MAX_GENRES)
      .map((g) => g.name.toLowerCase());
  } catch (err) {
    console.error(
      "MusicBrainz genre lookup failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
