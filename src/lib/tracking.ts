import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The write side of tracking: every library action becomes one LibraryEvent, plus
 * an update to the lifecycle stamps on the row itself.
 *
 * Two rules hold this together.
 *
 * **Tracking never breaks the action it observes.** Every function here swallows
 * its own errors. A failed analytics write must not lose a rating, so the worst
 * case is a gap in the history, logged to the server console.
 *
 * **One user action, one event, carrying every delta.** Rating an album that was
 * in Want to Listen moves both its rating and its status, and that is a single
 * RATED event with `fromStatus: "WANT"` and `toStatus: "LISTENED"` — not two rows.
 * So "when did things get listened to" filters on `toStatus`, never on `type`.
 */

export type EventType = "ADDED" | "STATUS_CHANGED" | "RATED" | "RERATED" | "REMOVED";

export const WANT = "WANT";
export const LISTENED = "LISTENED";

/** Snapshotted onto the event, so its history survives the row being deleted. */
export type TrackedItem = {
  mbid: string;
  itemType: string;
  title: string;
  artistName: string;
  artistId?: string | null;
  releaseYear?: number | null;
  genres?: string[];
};

/** The row as it was before the action, or null when the action created it. */
export type PriorState = {
  status: string;
  rating: number | null;
  wantedAt: Date | null;
} | null;

const DAY_MS = 86_400_000;

/**
 * Which event a change amounts to, or null when nothing actually changed.
 *
 * Re-tapping the status an item already has is a no-op in the UI, and logging it
 * would put phantom "activity" in the timeline.
 */
function classify(
  before: PriorState,
  after: { status: string; rating: number | null }
): EventType | null {
  if (!before) return "ADDED";

  const ratingChanged = after.rating !== null && after.rating !== before.rating;
  if (ratingChanged) return before.rating === null ? "RATED" : "RERATED";
  if (after.status !== before.status) return "STATUS_CHANGED";
  return null;
}

/**
 * Record a change to a library row: the event, and the row's own lifecycle stamps.
 *
 * Called from `after()` so the tap stays instant, which is safe because `before`
 * is captured by the caller *before* it writes. Nothing here reads state that the
 * action has already moved on from.
 */
export async function trackChange(params: {
  userId: string;
  logId: string;
  item: TrackedItem;
  before: PriorState;
  after: { status: string; rating: number | null };
}): Promise<void> {
  const { userId, logId, item, before, after } = params;
  try {
    const type = classify(before, after);
    if (!type) return;

    const now = new Date();
    const leftWant = before?.status === WANT && after.status !== WANT;

    await prisma.libraryEvent.create({
      data: {
        userId,
        type,
        logId,
        mbid: item.mbid,
        itemType: item.itemType,
        title: item.title,
        artistName: item.artistName,
        artistId: item.artistId ?? null,
        releaseYear: item.releaseYear ?? null,
        genres: item.genres ?? [],
        fromStatus: before?.status ?? null,
        toStatus: after.status,
        fromRating: before?.rating ?? null,
        toRating: after.rating,
        // Only meaningful on the event that ended the wait.
        waitDays:
          leftWant && before?.wantedAt
            ? (now.getTime() - before.wantedAt.getTime()) / DAY_MS
            : null,
        createdAt: now,
      },
    });

    await stampLifecycle(logId, after, type, now);
  } catch (err) {
    console.error("trackChange failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Move the row's lifecycle stamps forward.
 *
 * Written as one UPDATE with COALESCE rather than read-then-write: `wantedAt` and
 * `listenedAt` mean *first* time, and two rapid taps racing on a read would each
 * see null and each claim to be the first.
 */
async function stampLifecycle(
  logId: string,
  after: { status: string; rating: number | null },
  type: EventType,
  now: Date
): Promise<void> {
  const sets: Prisma.Sql[] = [];

  if (after.status === WANT) sets.push(Prisma.sql`"wantedAt" = COALESCE("wantedAt", ${now})`);
  if (after.status === LISTENED) sets.push(Prisma.sql`"listenedAt" = COALESCE("listenedAt", ${now})`);
  if (type === "RATED" || type === "RERATED") {
    sets.push(Prisma.sql`"firstRatedAt" = COALESCE("firstRatedAt", ${now})`);
    sets.push(Prisma.sql`"lastRatedAt" = ${now}`);
    sets.push(Prisma.sql`"ratingCount" = "ratingCount" + 1`);
  }
  if (sets.length === 0) return;

  await prisma.$executeRaw`
    UPDATE "AlbumLog" SET ${Prisma.join(sets, ", ")} WHERE "id" = ${logId}
  `;
}

/**
 * Record a removal. The row is already gone by now, so everything the event needs
 * has to come from the caller's snapshot of it.
 */
export async function trackRemoval(params: {
  userId: string;
  item: TrackedItem;
  before: { status: string; rating: number | null; wantedAt: Date | null };
}): Promise<void> {
  const { userId, item, before } = params;
  try {
    const now = new Date();
    await prisma.libraryEvent.create({
      data: {
        userId,
        type: "REMOVED",
        mbid: item.mbid,
        itemType: item.itemType,
        title: item.title,
        artistName: item.artistName,
        artistId: item.artistId ?? null,
        releaseYear: item.releaseYear ?? null,
        genres: item.genres ?? [],
        fromStatus: before.status,
        toStatus: null,
        fromRating: before.rating,
        toRating: null,
        waitDays:
          before.status === WANT && before.wantedAt
            ? (now.getTime() - before.wantedAt.getTime()) / DAY_MS
            : null,
        createdAt: now,
      },
    });
  } catch (err) {
    console.error("trackRemoval failed:", err instanceof Error ? err.message : err);
  }
}
