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
export { PAGE_SIZE as SEARCH_PAGE_SIZE };

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
  /**
   * Albums only. Both are already in the discography payload, and both exist so
   * an artist page can be re-sorted without a second request: `year` alone
   * cannot separate two records from the same year, and track count is the only
   * honest measure of length here — real durations would cost one tracklist
   * fetch per album.
   */
  totalTracks?: number;
  releaseDate?: string;
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
  /// Which disc, on releases that have more than one. Spotify always sends it,
  /// so a single-disc album is simply every track on disc 1 — the *client*
  /// decides whether that is worth showing.
  disc?: number;
}

export interface AlbumDetail {
  id: string;
  title: string;
  artistName: string;
  artistId?: string;
  year: string | null;
  /// The full release date where Spotify gives one. `year` alone hides the month,
  /// which is the interesting part on anything recent.
  releaseDate: string | null;
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

async function api<T>(path: string, opts: { fresh?: boolean } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await getAppToken()}` },
    // Spotify results barely change; let Next reuse them briefly across requests.
    // The retry below must opt out, or it is handed the very response it is
    // retrying because of.
    ...(opts.fresh ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
  });

  if (res.status === 404) throw new CatalogNotFound(path);

  /**
   * A cached entry revalidates with the `Authorization` header it was *created*
   * with. App tokens last an hour, so any cached path that outlives its token
   * starts returning 401 — and the 401 is then cached in its place, so it does not
   * recover on its own. Presents as the whole catalogue dying an hour into an
   * uptime, search included, while a fresh token works fine by hand.
   */
  if (res.status === 401 && !opts.fresh) {
    appToken = null;
    return api<T>(path, { fresh: true });
  }

  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((r) => setTimeout(r, Math.min(wait, 5) * 1000));
    return api<T>(path, opts);
  }

  if (!res.ok) throw new Error(`Spotify ${path} failed: ${res.status}`);
  return res.json();
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
  disc_number?: number;
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
    totalTracks: a.total_tracks,
    releaseDate: a.release_date,
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
    disc: t.disc_number ?? 1,
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
        disc: t.disc_number ?? 1,
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
    releaseDate: a.release_date ?? null,
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

// ── Discover ──────────────────────────────────────────────────────────────────

export interface GenreResults {
  albums: SearchItem[];
  /** Artists from the genre artist search. Often empty — see below. */
  artists: ArtistItem[];
  /** Artists of the matched tracks, without images. The fallback for the row. */
  trackArtists: { id: string; name: string }[];
}

/**
 * Albums and artists for one genre, for the landing page's Discover rows.
 *
 * Everything here is shaped by what Spotify will still answer, all of it verified
 * against the live API rather than the docs:
 *
 * - **Album search with `genre:` returns zero results, always.** Not "ignores the
 *   filter" — an empty page, for every genre tried. So albums come from the tracks
 *   the genre matched, deduped, with anything that is not `album_type: "album"`
 *   dropped, because a genre track search is mostly singles.
 * - **Artist search with `genre:` works for some genres and not others.**
 *   `indie rock` gives Arctic Monkeys and Tame Impala; `alternative r&b` and
 *   `singer-songwriter` give nothing at all. Spotify withdrew artist genres, and
 *   whatever survives in the search index is uneven. So the track artists come back
 *   too, as the fallback that works for every genre.
 * - **`/artists?ids=` is 403** for this app, so those fallback artists can only be
 *   hydrated one at a time. `artistsByIds` does that, and it is why the row prefers
 *   the free artists from this response.
 */
export async function discoverByGenre(
  genre: string,
  opts: { offset?: number } = {}
): Promise<GenreResults> {
  const params = new URLSearchParams({
    // Quoted for the same Lucene reason the playlist matcher needs it: unquoted,
    // `genre:hip hop` binds only "hip" to the field and matches nothing.
    q: `genre:"${genre.replace(/"/g, "")}"`,
    type: "artist,track",
    limit: String(PAGE_SIZE),
    offset: String(opts.offset ?? 0),
  });

  try {
    const data = await api<{
      tracks?: { items: SpTrack[] };
      artists?: { items: SpArtist[] };
    }>(`/search?${params.toString()}`);

    const tracks = (data.tracks?.items ?? []).filter(Boolean);

    const albums: SearchItem[] = [];
    const seenAlbum = new Set<string>();
    for (const track of tracks) {
      const album = track.album;
      if (!album?.artists?.length || album.album_type !== "album") continue;
      if (seenAlbum.has(album.id)) continue;
      seenAlbum.add(album.id);
      albums.push(albumToItem(album));
    }

    const seenArtist = new Set<string>();
    const trackArtists: { id: string; name: string }[] = [];
    for (const track of tracks) {
      for (const artist of track.artists ?? []) {
        if (!artist?.id || seenArtist.has(artist.id)) continue;
        seenArtist.add(artist.id);
        trackArtists.push({ id: artist.id, name: artist.name });
      }
    }

    const artists = (data.artists?.items ?? []).filter(Boolean).map(artistToItem);
    if (tracks.length === 0) {
      // Not an error, so nothing above would notice: the row would just be absent.
      console.warn(`Spotify discover: genre "${genre}" returned no tracks`);
    }

    return { albums, artists, trackArtists };
  } catch (err) {
    // A dead suggestion row is not worth failing the landing page over.
    console.error("Spotify discover failed:", err instanceof Error ? err.message : err);
    return { albums: [], artists: [], trackArtists: [] };
  }
}

/**
 * Full artist records for ids that arrived without images.
 *
 * One request each, because the batch endpoint `/artists?ids=` answers 403 for this
 * app. Callers must therefore keep the list to what they will actually display.
 * Failures drop out rather than failing the set.
 */
export async function artistsByIds(ids: string[]): Promise<ArtistItem[]> {
  const settled = await Promise.allSettled(ids.map((id) => api<SpArtist>(`/artists/${id}`)));
  return settled
    .filter((r): r is PromiseFulfilledResult<SpArtist> => r.status === "fulfilled")
    .map((r) => artistToItem(r.value));
}
