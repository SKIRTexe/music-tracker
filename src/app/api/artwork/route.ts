import { NextRequest, NextResponse } from "next/server";

// In-process cache — persists for the lifetime of the server process.
// Key = lowercase artist name, value = URL or null (null = "checked, nothing found").
// This prevents burst-firing iTunes for every card on every page load.
const cache = new Map<string, string | null>();
// Track in-flight requests so concurrent calls for the same artist share one fetch.
const inFlight = new Map<string, Promise<string | null>>();

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchArtistImage(artist: string): Promise<string | null> {
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
}

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist") ?? "";
  const key = artist.toLowerCase().trim();
  if (!key) return NextResponse.json({ url: null });

  // Cache hit
  if (cache.has(key)) {
    return NextResponse.json(
      { url: cache.get(key) ?? null },
      { headers: { "Cache-Control": "public, max-age=2592000" } }
    );
  }

  // Deduplicate concurrent requests for the same artist
  let promise = inFlight.get(key);
  if (!promise) {
    promise = fetchArtistImage(key)
      .then((url) => { cache.set(key, url); return url; })
      .catch(() => { return null; }) // don't cache errors — allow retry
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }

  const url = await promise;
  return NextResponse.json(
    { url },
    { headers: { "Cache-Control": "public, max-age=2592000" } }
  );
}
