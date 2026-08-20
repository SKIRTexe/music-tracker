// Shared server-side artwork cache.
// Module-level Maps persist for the lifetime of the server process —
// each unique album/artist is looked up once ever, then served from memory.

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function remember(key: string, promise: Promise<string | null>): Promise<string | null> {
  inFlight.set(key, promise);
  return promise
    .then((url) => { cache.set(key, url); return url; })
    .catch(() => null) // don't cache network errors — allow retry
    .finally(() => inFlight.delete(key));
}

export async function resolveAlbumArtwork(title: string, artist: string, mbid?: string): Promise<string | null> {
  const key = `album:${title.toLowerCase().trim()}|${artist.toLowerCase().trim()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  if (inFlight.has(key)) return inFlight.get(key)!;

  return remember(key, (async () => {
    // Try iTunes first
    const q = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&entity=album&limit=5`,
      { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const data = await res.json();
      const tl = title.toLowerCase();
      const match =
        data.results?.find((r: { collectionName?: string }) =>
          r.collectionName?.toLowerCase().includes(tl)
        ) ?? data.results?.[0];
      const url = (match?.artworkUrl100 as string | undefined)?.replace("100x100bb", "600x600bb");
      if (url) return url;
    }

    // Fall back to Cover Art Archive API when iTunes has nothing
    if (mbid) {
      try {
        const caaRes = await fetch(
          `https://coverartarchive.org/release/${mbid}`,
          { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(5000) }
        );
        if (caaRes.ok) {
          const caaData = await caaRes.json();
          const front = caaData.images?.find((img: { front?: boolean; image?: string }) => img.front) ?? caaData.images?.[0];
          if (front?.image) return front.image as string;
        }
      } catch {
        // CAA also unavailable — return null
      }
    }

    return null;
  })());
}

/** Artist photo, via the artwork of one of their albums on the iTunes CDN. */
export async function resolveArtistArtwork(artist: string): Promise<string | null> {
  const key = `artist:${artist.toLowerCase().trim()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  if (inFlight.has(key)) return inFlight.get(key)!;

  return remember(key, (async () => {
    const q = encodeURIComponent(artist);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&entity=album&attribute=artistTerm&limit=3`,
      { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const match =
      data.results?.find((r: { artistName?: string }) =>
        r.artistName?.toLowerCase() === artist.toLowerCase()
      ) ?? data.results?.[0];
    return (match?.artworkUrl100 as string | undefined)?.replace("100x100bb", "600x600bb") ?? null;
  })());
}
