"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  rateItemFor,
  removeFromLibraryFor,
  saveToLibraryFor,
  type LibraryItemInput,
} from "@/lib/library-write";
import { type Bucket } from "@/lib/ranking";
import {
  comparisonSetupFor,
  rankingModeFor,
  rateByComparisonFor,
  rateByNumberFor,
  setRankingEnabledFor,
  type ComparisonSetup,
} from "@/lib/ranking-flow";
import { knownIds } from "@/lib/stats-modules";

/**
 * The website's mutations.
 *
 * The writes themselves live in `src/lib/library-write.ts`, taking an explicit
 * user id, so the iOS client can reach the same code with a bearer token instead
 * of a session cookie. What stays here is what only a page has: resolving the
 * session, redirecting when there isn't one, and revalidating the routes the
 * change affects.
 */

// NB: types are NOT re-exported from this file. Next's "use server" transform
// emits every export *name* into a runtime ensureServerEntryExports([...]) array,
// and a type has no runtime binding — so `export type { X }` here throws
// "ReferenceError: X is not defined" when the module evaluates, killing every
// action in it. Import the types from the modules that declare them instead.

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

function refresh() {
  revalidatePath("/library");
  revalidatePath("/");
}

/** Add an item to the library, or move an existing one to a new status. */
export async function saveToLibrary(item: LibraryItemInput, status: string) {
  await saveToLibraryFor(await requireUserId(), item, status);
  refresh();
}

/** Rate an item 0–10. Rating something implies you listened to it. */
export async function rateItem(item: LibraryItemInput, rating: number) {
  await rateItemFor(await requireUserId(), item, rating);
  refresh();
}

/**
 * Remove by id. For songs, also match on title+artist: the row may have been saved
 * under a different id for the same song, in which case deleting by id alone would
 * silently do nothing.
 */
export async function removeFromLibrary(
  mbid: string,
  song?: { title: string; artistName: string }
) {
  await removeFromLibraryFor(await requireUserId(), mbid, song);
  refresh();
}

// ── Comparison ranking ────────────────────────────────────────────────────────

/**
 * Turn comparison rating on or off.
 *
 * Enabling seeds the ladder from whatever is already rated, so existing opinions
 * become the starting order rather than being thrown away.
 */
export async function setRankingEnabled(enabled: boolean): Promise<void> {
  await setRankingEnabledFor(await requireUserId(), enabled);
  refresh();
}


export async function getComparisonSetup(item: LibraryItemInput): Promise<ComparisonSetup> {
  return comparisonSetupFor(await requireUserId(), item);
}

export async function rateByComparison(
  item: LibraryItemInput,
  bucket: Bucket,
  insertIndex: number
): Promise<number | null> {
  const rating = await rateByComparisonFor(await requireUserId(), item, bucket, insertIndex);
  refresh();
  return rating;
}

export async function rateByNumber(
  item: LibraryItemInput,
  score: number
): Promise<number | null> {
  const rating = await rateByNumberFor(await requireUserId(), item, score);
  refresh();
  return rating;
}

/**
 * Whether comparison rating applies, without the candidate payload.
 *
 * Returns inactive rather than redirecting when signed out — this drives a rating
 * control that is never reachable in that state anyway.
 */
export async function rankingMode(
  itemType: string
): Promise<{ enabled: boolean; active: boolean; needed: number }> {
  const session = await auth();
  if (!session?.user?.id) return { enabled: false, active: false, needed: 0 };
  return rankingModeFor(session.user.id, itemType);
}

/**
 * Replace the set of switched-off stats modules.
 *
 * Takes the whole list rather than one toggle so the client's view is always
 * what gets stored — two switches flipped quickly can't race into a lost update.
 * Unknown ids are dropped on the way in, so a module removed from the registry
 * doesn't leave rubbish behind for ever.
 */
export async function setStatsHidden(hidden: string[]): Promise<void> {
  const userId = await requireUserId();
  const known = knownIds();
  await prisma.user.update({
    where: { id: userId },
    data: { statsHidden: [...new Set(hidden.filter((id) => known.has(id)))] },
  });
  revalidatePath("/stats");
  revalidatePath("/settings");
}
