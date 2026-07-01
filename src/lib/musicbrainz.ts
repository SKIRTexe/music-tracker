const MB_BASE = "https://musicbrainz.org/ws/2";
const CAA_BASE = "https://coverartarchive.org";
const USER_AGENT = "Recordcrate/0.1 (contact@example.com)";

// ── In-process cache (survives hot-reloads in dev, avoids rate-limit hammering) ──
const mbCache = new Map<string, { data: unknown; expires: number }>();
const MB_TTL = 60 * 60 * 1000; // 1 hour

// ── In-flight deduplication — concurrent requests for the same URL share one promise ──
const mbInFlight = new Map<string, Promise<unknown>>();

// ── Priority request queue ────────────────────────────────────────────────────
// High-priority: direct mbid lookups (/release/<uuid>, /artist/<uuid>)
// Low-priority:  search/tag queries (genre carousels, featured, similar)
// High-priority tasks are always pulled from the front of the queue first.
interface QueueTask {
  fn: (priority: "high" | "low") => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  priority: "high" | "low";
}

const mbPendingQueue: QueueTask[] = [];
let mbWorkerRunning = false;

async function mbWorker() {
  mbWorkerRunning = true;
  while (mbPendingQueue.length > 0) {
    // Pick next high-priority task, or fall back to the first task
    const idx = mbPendingQueue.findIndex((t) => t.priority === "high");
    const task = mbPendingQueue.splice(idx !== -1 ? idx : 0, 1)[0];
    try {
      task.resolve(await task.fn(task.priority));
    } catch (err) {
      task.reject(err);
    }
    if (mbPendingQueue.length > 0) {
      await new Promise<void>((r) => setTimeout(r, 50)); // 50ms gap between requests
    }
  }
  mbWorkerRunning = false;
}

function enqueue<T>(fn: (priority: "high" | "low") => Promise<T>, priority: "high" | "low" = "low"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    mbPendingQueue.push({ fn: fn as (p: "high" | "low") => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject, priority });
    if (!mbWorkerRunning) mbWorker();
  });
}

// High-priority: 2 attempts, 4s timeout — max ~5s per request
// Low-priority:  1 attempt,  3s timeout — max ~3s, fail fast to unblock queue
async function mbFetchRaw(urlStr: string, priority: "high" | "low"): Promise<unknown> {
  const maxAttempts = priority === "high" ? 2 : 1;
  const timeoutMs  = priority === "high" ? 4000 : 3000;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(urlStr, {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 503 || res.status === 429) {
        lastErr = new Error(`MusicBrainz rate limited: ${res.status}`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (res.status === 404) throw new Error(`MusicBrainz 404: ${urlStr}`);
      if (!res.ok) throw new Error(`MusicBrainz error: ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err instanceof Error && /MusicBrainz (404|error)/.test(err.message)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

async function mbFetch(path: string, params: Record<string, string> = {}, callerPriority: "high" | "low" = "low") {
  const url = new URL(`${MB_BASE}${path}`);
  url.searchParams.set("fmt", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const urlStr = url.toString();

  // Cache hit — return immediately
  const cached = mbCache.get(urlStr);
  if (cached && cached.expires > Date.now()) return cached.data;

  // In-flight dedup — if another request is already queued for this URL, share it
  const existing = mbInFlight.get(urlStr);
  if (existing) return existing;

  // Direct mbid lookups always high-priority; otherwise use caller's preference
  const isDirectLookup = /^\/(release|artist)\/[0-9a-f-]{36}$/.test(path);
  const priority = isDirectLookup ? "high" : callerPriority;

  const promise = enqueue((p) => mbFetchRaw(urlStr, p), priority).then((data) => {
    mbCache.set(urlStr, { data, expires: Date.now() + MB_TTL });
    mbInFlight.delete(urlStr);
    return data;
  }).catch((err) => {
    mbInFlight.delete(urlStr);
    throw err;
  });

  mbInFlight.set(urlStr, promise);
  return promise;
}

// ── Types ───────────────────────────────────────────────────────────────────────

export interface MBGenre {
  id: string;
  name: string;
  count: number;
}

export interface MBAlbum {
  id: string;
  title: string;
  date?: string;
  country?: string;
  "artist-credit"?: Array<{ artist: { id: string; name: string } }>;
  coverUrl?: string;
  genres?: MBGenre[];
  releaseType?: "album" | "single";
}

export interface MBArtist {
  id: string;
  name: string;
  disambiguation?: string;
  country?: string;
  area?: { id: string; name: string };
  "begin-area"?: { id: string; name: string };
  "life-span"?: { begin?: string; end?: string; ended?: boolean };
  relations?: MBArtistRelation[];
  genres?: MBGenre[];
  imageUrl?: string; // pre-resolved iTunes CDN URL
}

export interface MBArtistRelation {
  type: string;
  direction: string;
  attributes: string[];
  begin?: string;
  end?: string;
  artist: { id: string; name: string; disambiguation?: string };
}

export interface MBTrack {
  id: string;
  number: string;
  title: string;
  length?: number;
}

// ── Queries ─────────────────────────────────────────────────────────────────────

export async function searchTags(query: string, limit = 6): Promise<{ name: string }[]> {
  try {
    const data = await mbFetch("/tag", { query, limit: String(limit) }, "high");
    return (data as { tags?: { name: string }[] }).tags ?? [];
  } catch { return []; }
}

export async function searchAlbums(query: string, limit = 20): Promise<MBAlbum[]> {
  try {
    // Quote multi-word terms so Lucene parses them as phrases
    const term = /\s/.test(query) ? `"${query}"` : query;
    const data = await mbFetch(
      "/release",
      { query: `(release:${term} OR artist:${term}) AND primarytype:Album`, limit: String(limit) },
      "high"
    );
    return (data as { releases?: MBAlbum[] }).releases ?? [];
  } catch { return []; }
}

export async function searchArtists(query: string, limit = 20): Promise<MBArtist[]> {
  try {
    const data = await mbFetch("/artist", { query, limit: String(limit) }, "high");
    return (data as { artists?: MBArtist[] }).artists ?? [];
  } catch { return []; }
}

export async function getGenreAlbums(tag: string, limit = 16, priority: "high" | "low" = "low", releaseType: "album" | "single" = "album"): Promise<MBAlbum[]> {
  const primaryType = releaseType === "single" ? "Single" : "Album";
  try {
    const data = await mbFetch("/release", {
      query: `tag:${tag} AND primarytype:${primaryType}`,
      limit: String(limit),
    }, priority);
    const seen = new Set<string>();
    return ((data as { releases?: MBAlbum[] }).releases ?? [])
      .filter((r) => { const k = r.title.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((r) => ({ ...r, releaseType }));
  } catch { return []; }
}

export async function getDecadeAlbums(
  startYear: number,
  endYear: number,
  genre?: string,
  limit = 20,
  priority: "high" | "low" = "low",
): Promise<MBAlbum[]> {
  const genrePart = genre ? ` AND tag:${genre}` : "";
  try {
    const data = await mbFetch("/release", {
      query: `date:[${startYear}-01-01 TO ${endYear}-12-31] AND primarytype:Album${genrePart}`,
      limit: String(limit),
    }, priority);
    const seen = new Set<string>();
    return ((data as { releases?: MBAlbum[] }).releases ?? [])
      .filter((r) => { const k = r.title.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((r) => ({ ...r, releaseType: "album" as const }));
  } catch { return []; }
}

export async function getGenreArtists(tag: string, limit = 16, priority: "high" | "low" = "low"): Promise<MBArtist[]> {
  try {
    const data = await mbFetch("/artist", {
      query: `tag:${tag} AND type:Group`,
      limit: String(limit),
    }, priority);
    const seen = new Set<string>();
    return ((data as { artists?: MBArtist[] }).artists ?? [])
      .filter((a) => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
  } catch { return []; }
}

export async function getLocationAlbums(
  slug: string,
  isCountry: boolean,
  genre?: string,
  limit = 20,
  priority: "high" | "low" = "low"
): Promise<MBAlbum[]> {
  try {
    // Step 1: find artists native to this location.
    // For countries, use the artist `country` ISO field (reliable nationality).
    // For cities, use the artist `area` field.
    // This result is cached by mbFetch, so all genre carousels share one lookup.
    const artistQuery = isCountry
      ? `country:${slug} AND (type:Group OR type:Person)`
      : `area:"${slug}" AND (type:Group OR type:Person)`;
    const artistData = await mbFetch("/artist", { query: artistQuery, limit: "20" }, priority);
    const artists = (artistData as { artists?: { id: string }[] }).artists ?? [];
    if (artists.length === 0) return [];

    // Step 2: fetch albums by those artists, optionally filtered by genre.
    const aridPart = artists.map((a) => `arid:${a.id}`).join(" OR ");
    const genrePart = genre ? ` AND tag:${genre}` : "";
    const query = `(${aridPart}) AND primarytype:Album${genrePart}`;
    const data = await mbFetch("/release", { query, limit: String(limit) }, priority);
    const seen = new Set<string>();
    return ((data as { releases?: MBAlbum[] }).releases ?? [])
      .filter((r) => { const k = r.title.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  } catch { return []; }
}

export async function getLocationArtists(
  slug: string,
  isCountry: boolean,
  limit = 20,
  priority: "high" | "low" = "low"
): Promise<MBArtist[]> {
  try {
    const query = isCountry
      ? `country:${slug} AND (type:Group OR type:Person)`
      : `area:"${slug}" AND (type:Group OR type:Person)`;
    const data = await mbFetch("/artist", { query, limit: String(limit) }, priority);
    return (data as { artists?: MBArtist[] }).artists ?? [];
  } catch { return []; }
}

// Known music genre tags — used to filter out demographic/descriptor tags
// (e.g. "british", "male vocalist", "influential") from artist tag lists.
const GENRE_WHITELIST = new Set([
  "rock","pop","jazz","electronic","hip-hop","hip hop","soul","folk","metal",
  "classical","country","blues","r&b","reggae","punk","alternative","indie",
  "dance","funk","gospel","latin","ambient","experimental","world music",
  "new wave","post-rock","grunge","heavy metal","death metal","black metal",
  "thrash metal","progressive rock","psychedelic rock","hard rock","soft rock",
  "synth-pop","house","techno","drum and bass","dubstep","trip-hop","lo-fi",
  "emo","post-punk","noise rock","bossa nova","samba","afrobeat","flamenco",
  "k-pop","j-pop","baroque","opera","bluegrass","country rock","jazz fusion",
  "soul jazz","neo soul","garage rock","indie rock","indie pop","art rock",
  "post-metal","doom metal","power metal","glam rock","disco","club",
  "minimal","trance","electro","breakbeat","jungle","grime","trap","drill",
]);

const TAG_LABEL: Record<string, string> = {
  "hip-hop": "Hip-Hop", "hip hop": "Hip-Hop", "r&b": "R&B",
  "k-pop": "K-Pop", "j-pop": "J-Pop", "lo-fi": "Lo-Fi",
  "post-rock": "Post-Rock", "post-punk": "Post-Punk", "post-metal": "Post-Metal",
  "new wave": "New Wave", "world music": "World Music", "bossa nova": "Bossa Nova",
  "neo soul": "Neo Soul", "soul jazz": "Soul Jazz", "jazz fusion": "Jazz Fusion",
  "art rock": "Art Rock", "indie rock": "Indie Rock", "indie pop": "Indie Pop",
  "garage rock": "Garage Rock", "noise rock": "Noise Rock", "hard rock": "Hard Rock",
  "soft rock": "Soft Rock", "glam rock": "Glam Rock", "country rock": "Country Rock",
  "psychedelic rock": "Psychedelic Rock", "progressive rock": "Progressive Rock",
  "heavy metal": "Heavy Metal", "death metal": "Death Metal", "black metal": "Black Metal",
  "thrash metal": "Thrash Metal", "doom metal": "Doom Metal", "power metal": "Power Metal",
  "synth-pop": "Synth-Pop", "drum and bass": "Drum & Bass",
};

function genreLabel(tag: string): string {
  return TAG_LABEL[tag] ?? tag.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getLocationTopGenres(
  slug: string,
  isCountry: boolean,
  limit = 8,
  priority: "high" | "low" = "low"
): Promise<{ label: string; tag: string }[]> {
  try {
    // Same artist query as getLocationAlbums/getLocationArtists — cached by mbFetch.
    const artistQuery = isCountry
      ? `country:${slug} AND (type:Group OR type:Person)`
      : `area:"${slug}" AND (type:Group OR type:Person)`;
    const data = await mbFetch("/artist", { query: artistQuery, limit: "25" }, priority);
    const artists = (data as {
      artists?: Array<{ tags?: { name: string; count: number }[] }>
    }).artists ?? [];

    // Aggregate tag counts across all returned artists.
    const counts = new Map<string, number>();
    for (const artist of artists) {
      for (const tag of artist.tags ?? []) {
        const name = tag.name.toLowerCase();
        if (GENRE_WHITELIST.has(name)) {
          counts.set(name, (counts.get(name) ?? 0) + tag.count);
        }
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => ({ label: genreLabel(tag), tag }));
  } catch { return []; }
}

export async function searchAlbumsByArtists(
  artistIds: string[],
  query: string,
  limit = 20,
  priority: "high" | "low" = "low"
): Promise<MBAlbum[]> {
  if (artistIds.length === 0) return [];
  try {
    const aridPart = artistIds.map((id) => `arid:${id}`).join(" OR ");
    const term = /\s/.test(query) ? `"${query}"` : query;
    const data = await mbFetch("/release", {
      query: `(${aridPart}) AND (release:${term} OR artist:${term}) AND primarytype:Album`,
      limit: String(limit),
    }, priority);
    return (data as { releases?: MBAlbum[] }).releases ?? [];
  } catch { return []; }
}

export async function getFeaturedAlbums(limit = 16): Promise<MBAlbum[]> {
  try {
    const data = await mbFetch("/release", {
      query: `tag:essential AND primarytype:Album`,
      limit: String(limit),
    });
    const seen = new Set<string>();
    return ((data as { releases?: MBAlbum[] }).releases ?? [])
      .filter((r) => { const k = r.title.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  } catch { return []; }
}

export async function getFeaturedArtists(limit = 16): Promise<MBArtist[]> {
  try {
    const data = await mbFetch("/artist", {
      query: `tag:essential AND (type:Group OR type:Person)`,
      limit: String(limit),
    });
    const seen = new Set<string>();
    return ((data as { artists?: MBArtist[] }).artists ?? [])
      .filter((a) => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
  } catch { return []; }
}

export async function getSimilarArtists(
  tags: string[],
  excludeMbid: string,
  limit = 12
): Promise<MBArtist[]> {
  if (tags.length === 0) return [];
  try {
    const topTags = tags.slice(0, 5);

    // Query each tag separately so we can rank by how many tags overlap
    const perTagResults = await Promise.all(
      topTags.map((tag) =>
        mbFetch("/artist", {
          query: `tag:${tag} AND (type:Group OR type:Person)`,
          limit: "25",
        })
          .then((data) => (data as { artists?: MBArtist[] }).artists ?? [])
          .catch(() => [] as MBArtist[])
      )
    );

    // Score each artist by number of matching tags — more overlap = more similar
    const scoreMap = new Map<string, { artist: MBArtist; score: number }>();
    for (const results of perTagResults) {
      for (const artist of results) {
        if (artist.id === excludeMbid) continue;
        const entry = scoreMap.get(artist.id);
        if (entry) {
          entry.score += 1;
        } else {
          scoreMap.set(artist.id, { artist, score: 1 });
        }
      }
    }

    return [...scoreMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((e) => e.artist);
  } catch { return []; }
}

export async function getAlbum(
  mbid: string
): Promise<MBAlbum & { media?: { tracks: MBTrack[] }[] }> {
  return mbFetch(`/release/${mbid}`, {
    inc: "artist-credits+recordings+genres",
  }) as Promise<MBAlbum & { media?: { tracks: MBTrack[] }[] }>;
}

export async function getArtist(artistMbid: string): Promise<MBArtist> {
  return mbFetch(`/artist/${artistMbid}`, { inc: "artist-rels+genres" }) as Promise<MBArtist>;
}

export async function getArtistAlbums(artistMbid: string, limit = 25, releaseType: "album" | "single" = "album"): Promise<MBAlbum[]> {
  try {
    const data = await mbFetch("/release", {
      artist: artistMbid,
      limit: "100", // fetch max so dedup has enough to work with
      type: releaseType,
      inc: "artist-credits",
    }, "high");
    const releases = (data as { releases?: MBAlbum[] }).releases ?? [];
    // MusicBrainz returns one entry per pressing/edition — deduplicate by title
    const seen = new Set<string>();
    return releases
      .filter((r) => {
        const key = r.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((r) => ({ ...r, releaseType }));
  } catch { return []; }
}

export async function getAlbumImages(mbid: string): Promise<string[]> {
  try {
    const res = await fetch(`${CAA_BASE}/release/${mbid}`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.images ?? [])
      .slice(0, 8)
      .map((img: { thumbnails?: { "500"?: string }; image: string }) =>
        img.thumbnails?.["500"] ?? img.image
      );
  } catch { return []; }
}

export async function getCoverArtUrl(mbid: string): Promise<string | null> {
  try {
    const res = await fetch(`${CAA_BASE}/release/${mbid}`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const front = data.images?.find((img: { front: boolean; image: string }) => img.front);
    return front?.image ?? data.images?.[0]?.image ?? null;
  } catch { return null; }
}
