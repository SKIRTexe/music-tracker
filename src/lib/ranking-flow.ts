import { prisma } from "@/lib/prisma";
import {
  BANDS,
  BUCKETS,
  BUCKET_LABELS,
  bucketItems,
  ensureSeeded,
  placeItem,
  rankingState,
  slotForScore,
  type Bucket,
  type LadderItem,
} from "@/lib/ranking";
import {
  findExistingSongId,
  loadPrior,
  queueBackground,
  upsertForRanking,
  type LibraryItemInput,
} from "@/lib/library-write";

/**
 * The comparison-rating flow, taking an explicit `userId`.
 *
 * Split out of `src/app/actions.ts` for the same reason the library writes were:
 * the iOS client authenticates with a bearer token and has no session to resolve,
 * and this is the last thing that should exist twice. The ladder's correctness
 * rests on a set of rules that are only right in one place by accident — the seed
 * direction, the re-score ordering, the fact that a typed score is written
 * *before* the recompute — so there is one implementation and both clients call it.
 */

export type TieSide = "ABOVE" | "BELOW";

/**
 * The most a pair called "too close to call" may differ by.
 *
 * A tie is not a claim of equality — it is a claim that the difference is small.
 * Writing them as the same number says something the user did not, and makes two
 * distinct records indistinguishable in every list that sorts by score.
 */
const TIE_DELTA = 0.3;

/**
 * A score just above or just below a neighbour's, without crossing it.
 *
 * Capped twice: at `TIE_DELTA`, and at *half the gap* to whatever sits on that
 * side. The second cap is what stops a tie leapfrogging a record it was never
 * compared against — in a tightly packed bucket the neighbours can be a tenth
 * apart, and a flat ±0.3 would reorder the ladder behind the user's back.
 *
 * Returns null when the neighbour has no score to sit beside, so the caller can
 * fall back to an ordinary placement.
 */
async function scoreBesideNeighbour(
  userId: string,
  itemType: string,
  bucket: Bucket,
  neighbourId: string,
  side: TieSide
): Promise<number | null> {
  const items = await bucketItems(userId, itemType, bucket);
  const index = items.findIndex((i) => i.id === neighbourId);
  if (index === -1) return null;

  const anchor = items[index].rating;
  if (anchor == null) return null;

  const band = BANDS[bucket];
  if (side === "ABOVE") {
    const above = (index > 0 ? items[index - 1].rating : null) ?? band.high;
    return round1(Math.min(anchor + TIE_DELTA, (anchor + above) / 2, band.high));
  }
  const below = (index < items.length - 1 ? items[index + 1].rating : null) ?? band.low;
  return round1(Math.max(anchor - TIE_DELTA, (anchor + below) / 2, band.low));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Everything the comparison flow needs to run entirely on the client. */
export type ComparisonSetup = {
  active: boolean;
  /** How many more items must be rated before comparisons begin. */
  needed: number;
  buckets: { bucket: Bucket; label: string; items: LadderItem[] }[];
};

/**
 * The candidate lists, sent in one go.
 *
 * The binary search then runs entirely in the client: no round trip per question,
 * so answering feels instant. A stale list costs nothing — the final placement is
 * resolved and re-scored on the server regardless.
 */
export async function comparisonSetupFor(
  userId: string,
  item: LibraryItemInput
): Promise<ComparisonSetup> {
  const state = await rankingState(userId, item.itemType);
  if (!state.active) return { active: false, needed: state.needed, buckets: [] };

  await ensureSeeded(userId, item.itemType);

  // The item being rated must not appear in its own comparison list.
  const existingSongId = await findExistingSongId(userId, item);
  const self =
    existingSongId ??
    (
      await prisma.albumLog.findUnique({
        where: { userId_mbid: { userId, mbid: item.mbid } },
        select: { id: true },
      })
    )?.id;

  const buckets = [];
  for (const bucket of BUCKETS) {
    buckets.push({
      bucket,
      label: BUCKET_LABELS[bucket],
      items: await bucketItems(userId, item.itemType, bucket, self ?? undefined),
    });
  }
  return { active: true, needed: 0, buckets };
}

/**
 * Rate by where the comparisons landed. Returns the derived score.
 *
 * `insertIndex` is the slot in the bucket the client's binary search arrived at,
 * 0 being the top. The server re-resolves and re-scores from it, so a client
 * working from a slightly stale list still produces a correct ladder.
 */
export async function rateByComparisonFor(
  userId: string,
  item: LibraryItemInput,
  bucket: Bucket,
  insertIndex: number,
  /**
   * Set when the user answered "too close to call" against this ladder row.
   *
   * The tie is resolved into a *score*, not just a position: the item is anchored
   * to whatever that row is currently rated, so the two read the same. Placing it
   * adjacent and letting the score float would not survive the next recompute —
   * derivation spreads a run of floating items evenly across the gap between
   * anchors, so two "equal" records could easily end up a point apart, which is
   * precisely what the user said was wrong.
   *
   * The id is resolved server-side rather than trusting a rating sent by the
   * client, whose candidate list may be minutes stale.
   */
  tiedWithId?: string,
  /**
   * Which side of that row the extra questions put it on.
   *
   * A tie says "about here", not "exactly this" — so the score lands a little
   * above or below its neighbour rather than on top of it.
   */
  tieSide?: TieSide
): Promise<number | null> {
  const existingSongId = await findExistingSongId(userId, item);
  const prior = await loadPrior(userId, item, existingSongId);
  const row = await upsertForRanking(userId, item, existingSongId);

  await ensureSeeded(userId, item.itemType);

  const tieScore =
    tiedWithId && tieSide
      ? await scoreBesideNeighbour(userId, item.itemType, bucket, tiedWithId, tieSide)
      : null;

  const rating = await placeItem({
    userId,
    logId: row.id,
    itemType: item.itemType,
    bucket,
    insertIndex,
    // A tie target that cannot be scored degrades to an ordinary placement
    // rather than anchoring to nothing.
    source: tieScore != null ? "TIED" : "COMPARISON",
    ...(tieScore != null ? { exactScore: tieScore } : {}),
  });

  queueBackground({
    userId,
    logId: row.id,
    item,
    prior,
    next: { status: "LISTENED", rating },
    syncMbid: prior?.mbid ?? item.mbid,
  });

  return rating;
}

/**
 * Override with a number, while ranking is on.
 *
 * The number is not stored as the score — it picks the slot. The item slides to
 * where it out-scores everything below it and the bucket is re-derived from
 * there, so the order and the scores can never disagree. The score shown may
 * therefore land a decimal off what was typed; the position is the real opinion.
 */
export async function rateByNumberFor(
  userId: string,
  item: LibraryItemInput,
  score: number
): Promise<number | null> {
  const clamped = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  const existingSongId = await findExistingSongId(userId, item);
  const prior = await loadPrior(userId, item, existingSongId);
  const row = await upsertForRanking(userId, item, existingSongId);

  await ensureSeeded(userId, item.itemType);
  const slot = await slotForScore(userId, item.itemType, row.id, clamped);
  const rating = await placeItem({
    userId,
    logId: row.id,
    itemType: item.itemType,
    bucket: slot.bucket,
    insertIndex: slot.insertIndex,
    source: "MANUAL",
    // Kept exactly, and anchors the derived scores on either side of it.
    exactScore: clamped,
  });

  queueBackground({
    userId,
    logId: row.id,
    item,
    prior,
    next: { status: "LISTENED", rating },
    syncMbid: prior?.mbid ?? item.mbid,
  });

  return rating;
}

/**
 * Turn comparison rating on or off.
 *
 * Enabling seeds the ladder from whatever is already rated, so existing opinions
 * become the starting order rather than being thrown away. Not destructive:
 * scores descend with position, so rebuilding from scores reproduces the order it
 * came from.
 */
export async function setRankingEnabledFor(userId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { rankingEnabled: enabled } });
  if (enabled) {
    await ensureSeeded(userId, "ALBUM", true);
    await ensureSeeded(userId, "SONG", true);
  }
}

/** Whether comparison rating applies, without the candidate payload. */
export async function rankingModeFor(
  userId: string,
  itemType: string
): Promise<{ enabled: boolean; active: boolean; needed: number }> {
  const state = await rankingState(userId, itemType);
  return { enabled: state.enabled, active: state.active, needed: state.needed };
}
