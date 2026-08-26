import { NextResponse } from "next/server";
import { getDiscover } from "@/lib/discover";
import { getExistingEntries } from "@/lib/library";
import { userIdFromRequest } from "@/lib/mobile-auth";
import { catalogConfigured } from "@/lib/catalog";

/**
 * The landing page's two suggestion rows: albums to hear, artists to look at.
 *
 * Auth is optional, as on the website — signed out you get the default seeds
 * rather than nothing. `personal` says which it was, so the app can explain why
 * the rows look the way they do instead of presenting a cold list as if it knew
 * something about you.
 *
 * Cheap by construction: seeds come from `AlbumLog.genres`, which is denormalised
 * precisely so this needs no catalogue call, and the Spotify searches behind it
 * are shared across every user seeded from the same genre. Keep it that way —
 * this is a row you scroll past, not a feature worth a request budget.
 */
export const GET = async (req: Request) => {
  if (!catalogConfigured()) {
    return NextResponse.json({ error: "catalog_unconfigured" }, { status: 503 });
  }

  const userId = (await userIdFromRequest(req)) ?? undefined;
  const discover = await getDiscover(userId);

  // Already-saved albums are filtered out by `getDiscover`, but an album can be
  // saved from this very row and the app should show that without a refetch.
  const existing = await getExistingEntries(userId, discover.albums.map((a) => a.id));

  return NextResponse.json({ ...discover, existing: Object.fromEntries(existing) });
};
