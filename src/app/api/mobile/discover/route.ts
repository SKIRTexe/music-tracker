import { NextResponse } from "next/server";
import { communityRatings } from "@/lib/social";
import { clientKey, memoryLimit, tooMany } from "@/lib/rate-limit";
import { getDiscover } from "@/lib/discover";
import { albumsFromListening } from "@/lib/spotify-listening";
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
  // These are open proxies onto Spotify's quota — no sign-in required, because
  // browsing the catalogue without an account is the point. The in-memory
  // limiter is per-instance and therefore leaky, which is the right trade here:
  // a database round trip on every search would cost more than the abuse it
  // prevents, and this app has exhausted its connection pool before. It exists
  // to stop one client hammering the quota, not to be exact.
  const gate = memoryLimit(clientKey(req, "discover"), 60, 60_000);
  if (!gate.ok) return tooMany(gate.retryAfter);

  if (!catalogConfigured()) {
    return NextResponse.json({ error: "catalog_unconfigured" }, { status: 503 });
  }

  const userId = (await userIdFromRequest(req)) ?? undefined;

  // Albums the user has actually played but never rated. Empty for anyone who
  // has not linked Spotify, or whose link predates the `user-top-read` scope —
  // the app shows the row only when there is something in it, so no signed-out
  // or unlinked user sees an explanation they did not ask for.
  const [discover, listening] = await Promise.all([
    getDiscover(userId),
    userId ? albumsFromListening(userId) : Promise.resolve([]),
  ]);

  // Already-saved albums are filtered out by `getDiscover`, but an album can be
  // saved from this very row and the app should show that without a refetch.
  const existing = await getExistingEntries(
    userId,
    [...discover.albums, ...listening].map((a) => a.id)
  );

  // Public averages for everything on screen: one indexed groupBy for the page
  // rather than a query per card.
  const community = Object.fromEntries(
    await communityRatings([...discover.albums, ...listening].map((a) => a.id))
  );

  return NextResponse.json({
    ...discover,
    listening,
    existing: Object.fromEntries(existing),
    community,
  });
};
