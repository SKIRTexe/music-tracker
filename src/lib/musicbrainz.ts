import { prisma } from "@/lib/prisma";

const MB_BASE = "https://musicbrainz.org/ws/2";
// MusicBrainz requires a descriptive User-Agent with real contact info, and blocks
// clients that send a fake one. Set MB_CONTACT in your env to your email or site URL.
const USER_AGENT = `Recordcrate/1.0 ( ${process.env.MB_CONTACT ?? "https://github.com/SKIRTexe/music-tracker"} )`;

// MusicBrainz asks anonymous clients to average no more than one request per second.
// Going faster gets the whole IP blocked, which is what an outage looks like from here.
const MB_REQUEST_GAP_MS = 1100;

// ── Two-level cache ───────────────────────────────────────────────────────────
// L1 is in-process and free to read, but on Vercel it dies with each serverless
// instance — a repeat search would pay the full multi-second cost again. L2 is a
// Postgres table shared by every instance, so a query stays fast once anyone has
// run it.
const mbCache = new Map<string, { data: unknown; expires: number }>();
const MB_TTL = 60 * 60 * 1000; // 1 hour in memory
const MB_DB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in Postgres

async function readPersistentCache(url: string): Promise<unknown | undefined> {
  try {
    const row = await prisma.mbCache.findUnique({ where: { url } });
    if (!row || row.expiresAt.getTime() < Date.now()) return undefined;
    return JSON.parse(row.body);
  } catch {
    // A cache miss must never break a search.
    return undefined;
  }
}

function writePersistentCache(url: string, data: unknown): void {
  const body = JSON.stringify(data);
  // Postgres has a 1GB limit per field, but there's no reason to store huge blobs.
  if (body.length > 2_000_000) return;
  const expiresAt = new Date(Date.now() + MB_DB_TTL_MS);
  // Deliberately not awaited — the response shouldn't wait on the cache write.
  void prisma.mbCache
    .upsert({
      where: { url },
      create: { url, body, expiresAt },
      update: { body, expiresAt },
    })
    .catch(() => {});
}

// ── In-flight deduplication — concurrent requests for the same URL share one promise ──
const mbInFlight = new Map<string, Promise<unknown>>();

// ── Priority request queue ────────────────────────────────────────────────────
// High-priority: direct mbid lookups and anything a user is actively waiting on.
// Low-priority:  background enrichment.
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
    const idx = mbPendingQueue.findIndex((t) => t.priority === "high");
    const task = mbPendingQueue.splice(idx !== -1 ? idx : 0, 1)[0];
    try {
      task.resolve(await task.fn(task.priority));
    } catch (err) {
      task.reject(err);
    }
    if (mbPendingQueue.length > 0) {
      await new Promise<void>((r) => setTimeout(r, MB_REQUEST_GAP_MS));
    }
  }
  mbWorkerRunning = false;
}

function enqueue<T>(
  fn: (priority: "high" | "low") => Promise<T>,
  priority: "high" | "low" = "low"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    mbPendingQueue.push({
      fn: fn as (p: "high" | "low") => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      priority,
    });
    if (!mbWorkerRunning) mbWorker();
  });
}

// High-priority: 2 attempts, 5s timeout. Low-priority: 1 attempt, 3s — fail fast
// so a slow background request can't block the queue.
async function mbFetchRaw(urlStr: string, priority: "high" | "low"): Promise<unknown> {
  const maxAttempts = priority === "high" ? 2 : 1;
  const timeoutMs = priority === "high" ? 5000 : 3000;
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

export function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes("MusicBrainz 404");
}

export async function mbFetch(
  path: string,
  params: Record<string, string> = {},
  callerPriority: "high" | "low" = "low"
) {
  const url = new URL(`${MB_BASE}${path}`);
  url.searchParams.set("fmt", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const urlStr = url.toString();

  const cached = mbCache.get(urlStr);
  if (cached && cached.expires > Date.now()) return cached.data;

  // If an identical request is already queued, share its promise. This is what lets
  // the three streamed search sections reuse one underlying request instead of
  // each paying for its own.
  const existing = mbInFlight.get(urlStr);
  if (existing) return existing;

  const persisted = await readPersistentCache(urlStr);
  if (persisted !== undefined) {
    mbCache.set(urlStr, { data: persisted, expires: Date.now() + MB_TTL });
    return persisted;
  }

  const isDirectLookup = /^\/(release|release-group|artist)\/[0-9a-f-]{36}$/.test(path);
  const priority = isDirectLookup ? "high" : callerPriority;

  const promise = enqueue((p) => mbFetchRaw(urlStr, p), priority)
    .then((data) => {
      mbCache.set(urlStr, { data, expires: Date.now() + MB_TTL });
      writePersistentCache(urlStr, data);
      mbInFlight.delete(urlStr);
      return data;
    })
    .catch((err) => {
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

export interface MBTrack {
  /** Track id — unique to this pressing, so not usable as a library key. */
  id: string;
  number: string;
  title: string;
  length?: number;
  /**
   * The underlying recording id. This is what song search returns, so rating a
   * track here and rating the same song from search hit the same library row
   * rather than creating duplicates.
   */
  recordingId?: string;
}

/** Raw track as MusicBrainz returns it under `inc=recordings`. */
interface MBTrackRaw {
  id: string;
  number: string;
  title: string;
  length?: number;
  recording?: { id: string; title?: string; length?: number };
}

export interface ArtistDetail {
  id: string;
  name: string;
  disambiguation?: string;
  kind?: string;
  country?: string;
  /** Formation/active years, where MusicBrainz has them. */
  beganYear?: string;
  endedYear?: string;
  genres: MBGenre[];
}

/**
 * Artist lookup. Uses `inc=genres` rather than tags — genres are MusicBrainz's
 * curated list, so this avoids the demographic noise ("british", "male vocalist")
 * that raw tags carry.
 */
export async function getArtistDetail(mbid: string): Promise<ArtistDetail> {
  const data = (await mbFetch(`/artist/${mbid}`, { inc: "genres" })) as {
    id: string;
    name: string;
    disambiguation?: string;
    type?: string;
    country?: string;
    "life-span"?: { begin?: string; end?: string };
    genres?: MBGenre[];
  };

  const span = data["life-span"];
  return {
    id: data.id,
    name: data.name,
    disambiguation: data.disambiguation || undefined,
    kind: data.type,
    country: data.country,
    beganYear: span?.begin?.slice(0, 4),
    endedYear: span?.end?.slice(0, 4),
    // Most-used genres first.
    genres: [...(data.genres ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
  };
}

export interface AlbumDetail {
  id: string;
  title: string;
  artistName: string;
  artistMbid?: string;
  year: string | null;
  genres: MBGenre[];
  tracks: MBTrack[];
  coverArtUrl: string | null;
}

interface MBReleaseLike {
  id: string;
  title: string;
  date?: string;
  status?: string;
  genres?: MBGenre[];
  "artist-credit"?: Array<{ artist: { id: string; name: string } }>;
  media?: Array<{ tracks?: MBTrackRaw[] }>;
}

interface MBReleaseGroupDetail {
  id: string;
  title: string;
  "first-release-date"?: string;
  genres?: MBGenre[];
  "artist-credit"?: Array<{ artist: { id: string; name: string } }>;
  releases?: MBReleaseLike[];
}

/** Official releases with a date first — that's the pressing with the best tracklist. */
function pickRelease(releases: MBReleaseLike[]): MBReleaseLike | undefined {
  const scored = [...releases].sort((a, b) => {
    const officialA = a.status === "Official" ? 0 : 1;
    const officialB = b.status === "Official" ? 0 : 1;
    if (officialA !== officialB) return officialA - officialB;
    return (a.date ?? "9999").localeCompare(b.date ?? "9999");
  });
  return scored[0];
}

function tracksOf(release: MBReleaseLike | undefined): MBTrack[] {
  const raw = release?.media?.flatMap((m) => m.tracks ?? []) ?? [];
  return raw.map((t) => ({
    id: t.id,
    number: t.number,
    // A track's title can differ from its recording's; the track title is what's
    // printed on this release, so prefer it.
    title: t.title || t.recording?.title || "",
    length: t.length ?? t.recording?.length,
    recordingId: t.recording?.id,
  }));
}

/**
 * Load an album by release-group id (what search returns) or by release id (what a
 * song's parent album link uses). Tries release-group first and falls back to release.
 */
export async function getAlbumDetail(mbid: string): Promise<AlbumDetail> {
  try {
    const rg = (await mbFetch(`/release-group/${mbid}`, {
      inc: "artist-credits+genres+releases",
    })) as MBReleaseGroupDetail;

    const credit = rg["artist-credit"]?.[0]?.artist;
    const chosen = pickRelease(rg.releases ?? []);

    // The release-group lookup doesn't include tracks, so fetch the chosen pressing.
    let tracks: MBTrack[] = [];
    if (chosen) {
      try {
        const release = (await mbFetch(`/release/${chosen.id}`, {
          inc: "recordings",
        })) as MBReleaseLike;
        tracks = tracksOf(release);
      } catch {
        // Tracklist is optional — the page still works without it.
      }
    }

    return {
      id: rg.id,
      title: rg.title,
      artistName: credit?.name ?? "Unknown Artist",
      artistMbid: credit?.id,
      year: rg["first-release-date"]?.slice(0, 4) ?? null,
      genres: rg.genres ?? [],
      tracks,
      coverArtUrl: `https://coverartarchive.org/release-group/${rg.id}/front-500`,
    };
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  // Not a release-group — treat it as a release id.
  const release = (await mbFetch(`/release/${mbid}`, {
    inc: "artist-credits+genres+recordings",
  })) as MBReleaseLike;

  const credit = release["artist-credit"]?.[0]?.artist;
  return {
    id: release.id,
    title: release.title,
    artistName: credit?.name ?? "Unknown Artist",
    artistMbid: credit?.id,
    year: release.date?.slice(0, 4) ?? null,
    genres: release.genres ?? [],
    tracks: tracksOf(release),
    coverArtUrl: `https://coverartarchive.org/release/${release.id}/front-500`,
  };
}
