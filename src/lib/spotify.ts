import { prisma } from "@/lib/prisma";

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

/**
 * Creating a playlist needs a private playlist to write to and read back (so a
 * re-export can skip what's already there). Album expansion only needs reads.
 */
export const SPOTIFY_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "playlist-read-private",
].join(" ");

export function spotifyConfigured(): boolean {
  return !!(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_CLIENT_SECRET &&
    process.env.SPOTIFY_REDIRECT_URI
  );
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `${ACCOUNTS}/authorize?${params.toString()}`;
}

function basicAuth(): string {
  const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return Buffer.from(raw).toString("base64");
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Exchange the one-time code from the callback for tokens, and store them. */
export async function linkAccount(userId: string, code: string): Promise<void> {
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    })
  );

  const me = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  if (!me.ok) throw new Error(`Spotify /me failed: ${me.status}`);
  const profile = (await me.json()) as { id: string };

  const data = {
    userId,
    type: "oauth",
    provider: "spotify",
    providerAccountId: profile.id,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_at: Math.floor(Date.now() / 1000) + token.expires_in,
    scope: token.scope ?? SPOTIFY_SCOPES,
    token_type: "Bearer",
  };

  await prisma.account.upsert({
    where: { provider_providerAccountId: { provider: "spotify", providerAccountId: profile.id } },
    create: data,
    update: data,
  });
}

export interface SpotifySession {
  accessToken: string;
  spotifyUserId: string;
}

/**
 * A usable access token for this user, refreshing it if it has expired. Returns
 * null when the user has never linked Spotify.
 */
export async function getSession(userId: string): Promise<SpotifySession | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "spotify" },
  });
  if (!account?.access_token) return null;

  const stillValid = (account.expires_at ?? 0) > Math.floor(Date.now() / 1000) + 60;
  if (stillValid) {
    return { accessToken: account.access_token, spotifyUserId: account.providerAccountId };
  }
  if (!account.refresh_token) return null;

  const refreshed = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    })
  );

  await prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: "spotify",
        providerAccountId: account.providerAccountId,
      },
    },
    data: {
      access_token: refreshed.access_token,
      // Spotify only sometimes returns a new refresh token; keep the old otherwise.
      refresh_token: refreshed.refresh_token ?? account.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    },
  });

  return { accessToken: refreshed.access_token, spotifyUserId: account.providerAccountId };
}

export async function unlinkAccount(userId: string): Promise<void> {
  await prisma.account.deleteMany({ where: { userId, provider: "spotify" } });
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function api<T>(
  session: SpotifySession,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  // Spotify asks callers to wait the advertised number of seconds on a 429.
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? "2");
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return api<T>(session, path, init);
  }
  if (!res.ok) {
    throw new Error(`Spotify ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Guard against confidently adding the wrong record on a loose text match. */
function artistMatches(candidate: string, wanted: string): boolean {
  const c = normalize(candidate);
  const w = normalize(wanted);
  if (!w) return true;
  return c === w || c.includes(w) || w.includes(c);
}

interface SpotifyTrack {
  uri: string;
  name: string;
  artists: { name: string }[];
}

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { name: string }[];
  total_tracks: number;
}

/**
 * A field filter value, quoted. The quotes are not optional for multi-word values:
 * `album:Led Zeppelin artist:Led Zeppelin` returns zero results, because only the
 * first word binds to the field and the rest become loose terms, while
 * `album:"Led Zeppelin" artist:"Led Zeppelin"` finds the album immediately.
 */
function quote(s: string): string {
  return `"${s.replace(/["']/g, " ").trim()}"`;
}

/** The album's tracks, in order, as playlist-addable URIs. */
async function albumTrackUris(session: SpotifySession, albumId: string): Promise<string[]> {
  const uris: string[] = [];
  let url: string | null = `/albums/${albumId}/tracks?limit=50`;
  while (url) {
    const page: { items: { uri: string }[]; next: string | null } = await api(session, url);
    uris.push(...page.items.map((t) => t.uri));
    url = page.next;
  }
  return uris;
}

export interface ResolveResult {
  uris: string[];
  /** What we matched, for the report shown to the user. */
  matchedAs?: string;
}

/** Find an album on Spotify and expand it to all of its track URIs. */
export async function resolveAlbum(
  session: SpotifySession,
  title: string,
  artist: string
): Promise<ResolveResult> {
  const q = `album:${quote(title)} artist:${quote(artist)}`;
  const found = await api<{ albums: { items: SpotifyAlbum[] } }>(
    session,
    `/search?q=${encodeURIComponent(q)}&type=album&limit=5`
  );
  const album =
    found.albums.items.find(
      (a) => normalize(a.name) === normalize(title) && artistMatches(a.artists[0]?.name ?? "", artist)
    ) ?? found.albums.items.find((a) => artistMatches(a.artists[0]?.name ?? "", artist));

  if (!album) return { uris: [] };
  return {
    uris: await albumTrackUris(session, album.id),
    matchedAs: `${album.name} — ${album.artists[0]?.name ?? "?"} (${album.total_tracks} tracks)`,
  };
}

/** Find a single song on Spotify. */
export async function resolveSong(
  session: SpotifySession,
  title: string,
  artist: string
): Promise<ResolveResult> {
  const q = `track:${quote(title)} artist:${quote(artist)}`;
  const found = await api<{ tracks: { items: SpotifyTrack[] } }>(
    session,
    `/search?q=${encodeURIComponent(q)}&type=track&limit=5`
  );
  const track =
    found.tracks.items.find(
      (t) => normalize(t.name) === normalize(title) && artistMatches(t.artists[0]?.name ?? "", artist)
    ) ?? found.tracks.items.find((t) => artistMatches(t.artists[0]?.name ?? "", artist));

  if (!track) return { uris: [] };
  return {
    uris: [track.uri],
    matchedAs: `${track.name} — ${track.artists[0]?.name ?? "?"}`,
  };
}

// ── Playlist ───────────────────────────────────────────────────────────────────

const PLAYLIST_NAME = "Recordcrate — Want to Listen";

/** The saved playlist if it still exists, otherwise a newly created one. */
export async function ensurePlaylist(
  session: SpotifySession,
  existingId: string | null
): Promise<{ id: string; url: string; created: boolean }> {
  if (existingId) {
    try {
      const pl = await api<{ id: string; external_urls: { spotify: string } }>(
        session,
        `/playlists/${existingId}`
      );
      return { id: pl.id, url: pl.external_urls.spotify, created: false };
    } catch {
      // Deleted or unfollowed on Spotify's side — fall through and make a new one.
    }
  }

  // Must be /me/playlists, not /users/{id}/playlists. Spotify now returns a bare
  // 403 Forbidden for the user-scoped path — with either the legacy username from
  // /me `id` or the newer `account_id` — even with playlist-modify-private granted
  // and reads working fine.
  const created = await api<{ id: string; external_urls: { spotify: string } }>(
    session,
    `/me/playlists`,
    {
      method: "POST",
      body: JSON.stringify({
        name: PLAYLIST_NAME,
        public: false,
        description: "Albums and songs I want to listen to, exported from Recordcrate.",
      }),
    }
  );
  return { id: created.id, url: created.external_urls.spotify, created: true };
}

/**
 * URIs already in the playlist, so a re-export doesn't duplicate them.
 *
 * Must use `/items`, not `/tracks`. Spotify's March 2026 migration replaced the
 * `/playlists/{id}/tracks` sub-resource (which also covers podcast episodes now),
 * and Development Mode apps get a bare 403 Forbidden on the old path — while
 * `/playlists/{id}` itself still returns 200, which makes it look like a
 * permissions problem rather than a moved endpoint. The response shape changed
 * too: `items[].track` became `items[].item`.
 */
export async function playlistTrackUris(
  session: SpotifySession,
  playlistId: string
): Promise<Set<string>> {
  const uris = new Set<string>();
  let url: string | null = `/playlists/${playlistId}/items?limit=100&fields=${encodeURIComponent(
    "items(item(uri)),next"
  )}`;
  while (url) {
    const page: { items: { item: { uri: string } | null }[]; next: string | null } =
      await api(session, url);
    for (const entry of page.items) {
      if (entry.item?.uri) uris.add(entry.item.uri);
    }
    url = page.next;
  }
  return uris;
}

export async function addTracks(
  session: SpotifySession,
  playlistId: string,
  uris: string[]
): Promise<void> {
  // Spotify accepts at most 100 URIs per request.
  for (let i = 0; i < uris.length; i += 100) {
    await api(session, `/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
}
