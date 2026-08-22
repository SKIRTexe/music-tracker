/**
 * The music catalogue, backed by Spotify.
 *
 * Replaced MusicBrainz, which was limited to ~1 request/second and took 1–3s per
 * response — a search needed 4–5 requests and ~17s. Spotify answers albums, songs
 * and artists in a *single* request in about half a second, includes cover art, and
 * its relevance ordering is good enough that the pile of hand-tuned ranking
 * heuristics MusicBrainz required is gone: "bohemian rhapsody" returns Queen, and
 * "karma police" returns Radiohead rather than the band of the same name.
 *
 * Browsing uses an app-level token (client credentials), so search works when
 * signed out. User-scoped playlist writes live in spotify.ts.
 */

/** Spotify rejects limit > 10 on search with 400 "Invalid limit". */
const PAGE_SIZE = 10;

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

export interface SearchItem {
  /** Spotify album id for albums, track id for songs. Also the library key. */
  id: string;
  itemType: "ALBUM" | "SONG";
  title: string;
  artistName: string;
  /** Spotify artist id. Named `artistMbid` in stored rows for historical reasons. */
  artistId?: string;
  year: string | null;
  coverArtUrl: string | null;
  /** What /album/[id] should be given, or null if there's no album to open. */
  detailId: string | null;
  /** Songs only: the album the track belongs to. */
  parentAlbum?: string;
}

export interface ArtistItem {
  id: string;
  name: string;
  /** Top genres, used in place of MusicBrainz's disambiguation text. */
  genres: string[];
  imageUrl: string | null;
}

export interface SearchResults {
  albums: SearchItem[];
  songs: SearchItem[];
  artists: ArtistItem[];
}

export interface CatalogTrack {
  id: string;
  number: string;
  title: string;
  length?: number;
}

export interface AlbumDetail {
  id: string;
  title: string;
  artistName: string;
  artistId?: string;
  year: string | null;
  genres: string[];
  tracks: CatalogTrack[];
  coverArtUrl: string | null;
  totalTracks: number;
}

export interface ArtistDetail {
  id: string;
  name: string;
  genres: string[];
  imageUrl: string | null;
  followers: number | null;
}

export class CatalogNotFound extends Error {}

// ── App token ─────────────────────────────────────────────────────────────────

let appToken: { value: string; expires: number } | null = null;

export function catalogConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expires > Date.now() + 30_000) return appToken.value;

  const creds = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(creds).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token failed: ${res.status}`);

  const body = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return appToken.value;
}

async function api<T>(path: string): Promise<T> {
  const token = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await getAppToken()}` },
    // Spotify results barely change; let Next reuse them briefly across requests.
    next: { revalidate: 300 },
  });
  if (token.status === 404) throw new CatalogNotFound(path);
  if (token.status === 429) {
    const wait = Number(token.headers.get("Retry-After") ?? "1");
    await new Promise((r) => setTimeout(r, Math.min(wait, 5) * 1000));
    return api<T>(path);
  }
  if (!token.ok) throw new Error(`Spotify ${path} failed: ${token.status}`);
  return token.json();
}

// ── Response shapes ───────────────────────────────────────────────────────────

interface SpImage { url: string; width: number | null }
interface SpArtistRef { id: string; name: string }

interface SpAlbum {
  id: string;
  name: string;
  release_date?: string;
  total_tracks: number;
  album_type?: string;
  images?: SpImage[];
  artists: SpArtistRef[];
  genres?: string[];
  tracks?: { items: SpTrack[]; next: string | null };
}

interface SpTrack {
  id: string;
  name: string;
  track_number?: number;
  duration_ms?: number;
  artists: SpArtistRef[];
  album?: SpAlbum;
}

interface SpArtist {
  id: string;
  name: string;
  genres?: string[];
  images?: SpImage[];
  followers?: { total: number };
}

/** Mid-size image where available — the first is often 640px, larger than needed. */
function pickImage(images?: SpImage[]): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return (sorted[1] ?? sorted[0]).url;
}

function albumToItem(a: SpAlbum): SearchItem {
  return {
    id: a.id,
    itemType: "ALBUM",
    title: a.name,
    artistName: a.artists[0]?.name ?? "Unknown Artist",
    artistId: a.artists[0]?.id,
    year: a.release_date ? a.release_date.slice(0, 4) : null,
    coverArtUrl: pickImage(a.images),
    detailId: a.id,
  };
}

function trackToItem(t: SpTrack): SearchItem {
  return {
    id: t.id,
    itemType: "SONG",
    title: t.name,
    artistName: t.artists[0]?.name ?? "Unknown Artist",
    artistId: t.artists[0]?.id,
    year: t.album?.release_date ? t.album.release_date.slice(0, 4) : null,
    coverArtUrl: pickImage(t.album?.images),
    detailId: t.album?.id ?? null,
    parentAlbum: t.album?.name,
  };
}

function artistToItem(a: SpArtist): ArtistItem {
  return {
    id: a.id,
    name: a.name,
    genres: a.genres ?? [],
    imageUrl: pickImage(a.images),
  };
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * One request covers all three result types. Spotify's own ordering is used as-is;
 * it already puts the canonical record first for the cases that needed manual
 * intervention before.
 */
export async function search(
  query: string,
  opts: { albums?: boolean; songs?: boolean; artists?: boolean; limit?: number } = {}
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { albums: [], songs: [], artists: [] };

  const { albums = true, songs = true, artists = true, limit = 24 } = opts;
  const types = [albums && "album", songs && "track", artists && "artist"].filter(Boolean);
  if (types.length === 0) return { albums: [], songs: [], artists: [] };

  // Spotify caps `limit` at 10 per request — asking for 11 returns
  // 400 "Invalid limit", not a clamped result. More than that needs paging by
  // offset, which is why a single-type tab costs a few requests.
  const pages = Math.min(Math.ceil(limit / PAGE_SIZE), 4);

  const out: SearchResults = { albums: [], songs: [], artists: [] };
  try {
    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        q,
        type: types.join(","),
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      const data = await api<{
        albums?: { items: SpAlbum[] };
        tracks?: { items: SpTrack[] };
        artists?: { items: SpArtist[] };
      }>(`/search?${params.toString()}`);

      out.albums.push(...(data.albums?.items ?? []).filter(Boolean).map(albumToItem));
      out.songs.push(...(data.tracks?.items ?? []).filter(Boolean).map(trackToItem));
      out.artists.push(...(data.artists?.items ?? []).filter(Boolean).map(artistToItem));

      // Ran out of results before running out of pages.
      const got =
        (data.albums?.items?.length ?? 0) +
        (data.tracks?.items?.length ?? 0) +
        (data.artists?.items?.length ?? 0);
      if (got === 0) break;
    }
    return out;
  } catch (err) {
    console.error("Spotify search failed:", err instanceof Error ? err.message : err);
    // Return whatever earlier pages produced rather than nothing.
    return out;
  }
}

// ── Album ─────────────────────────────────────────────────────────────────────

export async function getAlbum(id: string): Promise<AlbumDetail> {
  const a = await api<SpAlbum>(`/albums/${id}`);

  const tracks: CatalogTrack[] = (a.tracks?.items ?? []).map((t, i) => ({
    id: t.id,
    number: String(t.track_number ?? i + 1),
    title: t.name,
    length: t.duration_ms,
  }));

  // Albums over 50 tracks paginate; rare, but box sets exist.
  let next = a.tracks?.next ?? null;
  while (next) {
    const page = await api<{ items: SpTrack[]; next: string | null }>(
      next.replace(API, "")
    );
    for (const [i, t] of page.items.entries()) {
      tracks.push({
        id: t.id,
        number: String(t.track_number ?? tracks.length + i + 1),
        title: t.name,
        length: t.duration_ms,
      });
    }
    next = page.next;
  }

  return {
    id: a.id,
    title: a.name,
    artistName: a.artists[0]?.name ?? "Unknown Artist",
    artistId: a.artists[0]?.id,
    year: a.release_date ? a.release_date.slice(0, 4) : null,
    genres: a.genres ?? [],
    tracks,
    coverArtUrl: pickImage(a.images),
    totalTracks: a.total_tracks,
  };
}

/** Track URIs for an album, for the Spotify playlist export. */
export async function albumTrackUris(id: string): Promise<string[]> {
  const detail = await getAlbum(id);
  return detail.tracks.map((t) => `spotify:track:${t.id}`);
}

// ── Artist ────────────────────────────────────────────────────────────────────

export async function getArtist(id: string): Promise<ArtistDetail> {
  const a = await api<SpArtist>(`/artists/${id}`);
  return {
    id: a.id,
    name: a.name,
    genres: a.genres ?? [],
    imageUrl: pickImage(a.images),
    followers: a.followers?.total ?? null,
  };
}

/**
 * An artist's albums, oldest first. Singles and compilations are excluded.
 *
 * This endpoint is capped at 10 per request like search — asking for more returns
 * 400, so a full discography is paged. (Album tracks, by contrast, allow 50.)
 */
export async function artistAlbums(id: string, limit = 50): Promise<SearchItem[]> {
  try {
    const items: SpAlbum[] = [];
    const pages = Math.min(Math.ceil(limit / PAGE_SIZE), 6);
    for (let page = 0; page < pages; page++) {
      const data = await api<{ items: SpAlbum[] }>(
        `/artists/${id}/albums?include_groups=album&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      if (!data.items?.length) break;
      items.push(...data.items);
    }

    const seen = new Set<string>();
    return items
      .filter((a) => {
        // Spotify lists regional variants and remasters separately.
        const key = a.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(albumToItem)
      .sort((x, y) => (x.year ?? "9999").localeCompare(y.year ?? "9999"));
  } catch {
    return [];
  }
}

// ── Track ─────────────────────────────────────────────────────────────────────

export interface TrackDetail {
  id: string;
  title: string;
  artistName: string;
  artistId?: string;
  durationMs: number | null;
  albumId: string | null;
}

/**
 * One track. Only the tracking enrichment needs this — a saved song's runtime is
 * not on any search result, and a song has no page of its own to fetch it from.
 */
export async function getTrack(id: string): Promise<TrackDetail> {
  const t = await api<SpTrack>(`/tracks/${id}`);
  return {
    id: t.id,
    title: t.name,
    artistName: t.artists[0]?.name ?? "Unknown Artist",
    artistId: t.artists[0]?.id,
    durationMs: t.duration_ms ?? null,
    albumId: t.album?.id ?? null,
  };
}
