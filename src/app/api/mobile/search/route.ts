import { NextResponse } from "next/server";
import { search, catalogConfigured } from "@/lib/catalog";
import { getExistingEntries, getSavedSongs, songKey } from "@/lib/library";
import { userIdFromRequest } from "@/lib/mobile-auth";

/**
 * Search, with each result already carrying what the user has done with it.
 *
 * The website resolves that on the server so a card renders its status without a
 * second request; the app gets the same treatment for a stronger reason — a phone
 * on cellular pays real latency for a follow-up round trip, and a grid of cards
 * that pop from "add" to "8.4" a second after they appear looks broken.
 *
 * Auth is optional here, exactly as on the site: browsing works signed out, and an
 * anonymous request simply gets no `existing` block.
 */
export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type"); // albums | songs | artists | null = all
  const limit = Math.min(Number(url.searchParams.get("limit")) || 24, 40);

  if (!catalogConfigured()) {
    return NextResponse.json({ error: "catalog_unconfigured" }, { status: 503 });
  }
  if (!q) {
    return NextResponse.json({ albums: [], songs: [], artists: [], existing: {} });
  }

  const results = await search(q, {
    albums: !type || type === "albums",
    songs: !type || type === "songs",
    artists: !type || type === "artists",
    limit,
  });

  const userId = (await userIdFromRequest(req)) ?? undefined;

  // Songs are matched by title+artist, not by id: one studio song has a different
  // track id on every release it appears on, so an id lookup would show a song you
  // rated last week as unsaved when it turns up under a different pressing.
  const [byId, songs] = await Promise.all([
    getExistingEntries(userId, results.albums.map((a) => a.id)),
    getSavedSongs(userId),
  ]);

  const existing: Record<string, { status: string; rating: number | null }> = {};
  for (const [id, entry] of byId) existing[id] = entry;
  for (const song of results.songs) {
    const saved = songs.get(songKey(song.title, song.artistName));
    if (saved) existing[song.id] = saved;
  }

  return NextResponse.json({ ...results, existing });
};
