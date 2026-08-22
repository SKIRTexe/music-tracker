"use server";

import { auth } from "@/lib/auth";
import { enrichBacklog } from "@/lib/enrich";
import { getDashboard, type Dashboard, type Grain } from "@/lib/stats";

/**
 * Read-only entry points for the stats data, so the dashboard page can be built
 * later without touching the collection code.
 *
 * Everything here is scoped to the signed-in user. `stats.ts` also supports an
 * app-wide roll-up by omitting the id, but that is not exposed through an action:
 * it would let any account read everyone else's listening.
 */

export async function myStats(
  opts: { days?: number; grain?: Grain } = {}
): Promise<Dashboard | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getDashboard(session.user.id, opts);
}

/**
 * Fill in genres and runtimes for rows saved before tracking existed.
 *
 * Batched at 25 because each row costs a Spotify call (plus one per artist not yet
 * cached). Returns how many it processed, so a caller can loop until it returns 0.
 */
export async function backfillMyLibrary(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) return 0;
  return enrichBacklog(session.user.id, 25);
}
