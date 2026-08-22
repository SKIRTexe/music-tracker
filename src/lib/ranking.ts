import { prisma } from "@/lib/prisma";

/**
 * Comparison ranking — the Beli model.
 *
 * You never type a score. You put an item in one of three coarse buckets, answer
 * a few "which did you like more?" questions against things you've already rated,
 * and the 0–10 number is *derived* from where you landed. Comparing two records
 * you know is a question you can answer honestly; "is this a 7.4 or a 7.8" is not,
 * which is the whole point.
 *
 * **The order is the single source of truth and the score is a view of it.** Every
 * score comes from `bucket` + `rankPosition`. Nothing writes a rating directly
 * while ranking is on — not even an override, which works by moving the item to
 * the slot matching the number you typed. Two things can therefore never
 * contradict each other, because there is only one thing.
 *
 * Albums and songs are separate ladders. "Is Kid A better than Karma Police" is
 * not a question with an honest answer, and the dashboard reports album and song
 * averages separately anyway.
 */

export type Bucket = "LOVED" | "FINE" | "DISLIKED";

/** Best first. This order defines the ladder across buckets. */
export const BUCKETS: readonly Bucket[] = ["LOVED", "FINE", "DISLIKED"] as const;

export const BUCKET_LABELS: Record<Bucket, string> = {
  LOVED: "Loved it",
  FINE: "It was fine",
  DISLIKED: "Didn't like it",
};

/**
 * The score band each bucket owns.
 *
 * Bands rather than one global 0–10 scale so that adding an album you loved can
 * never drag an album you merely liked down into a different verdict. A bucket's
 * items only ever move within their own band.
 */
const BANDS: Record<Bucket, { low: number; high: number }> = {
  LOVED: { low: 6.8, high: 10 },
  FINE: { low: 3.4, high: 6.7 },
  DISLIKED: { low: 0, high: 3.3 },
};

/**
 * Comparisons only start once there are this many rated items of the same type.
 * Below it there is nothing to compare against, so rating stays a plain number
 * and those first few seed the ladder.
 *
 * Two is the floor that still asks a real question. Raise it for a better first
 * placement — a longer ladder means the binary search has more to bisect — at the
 * cost of more sliders before the feature turns on.
 */
export const RANKING_MIN_RATED = 2;

/**
 * How many items in a bucket before it uses its full band.
 *
 * With two loved albums, spreading them across the whole band would score them
 * 10.0 and 6.8 — a chasm between two records you said you loved. So a small
 * bucket uses a narrow window around the band's midpoint and widens as it fills.
 */
const FULL_SPREAD_AT = 5;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The score for position `index` (0 = best) of `count` items in a bucket. */
export function scoreFor(bucket: Bucket, index: number, count: number): number {
  const { low, high } = BANDS[bucket];
  const middle = (low + high) / 2;
  if (count <= 1) return round1(middle);

  const width = (high - low) * Math.min(1, (count - 1) / (FULL_SPREAD_AT - 1));
  const top = middle + width / 2;
  const bottom = middle - width / 2;
  return round1(top - (index * (top - bottom)) / (count - 1));
}

/** Which bucket a typed score belongs to — the override path. */
export function bucketForScore(score: number): Bucket {
  if (score <= BANDS.DISLIKED.high) return "DISLIKED";
  if (score <= BANDS.FINE.high) return "FINE";
  return "LOVED";
}

export type LadderItem = {
  id: string;
  mbid: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  bucket: Bucket;
  rating: number | null;
};

const LADDER_SELECT = {
  id: true,
  mbid: true,
  albumTitle: true,
  artistName: true,
  coverUrl: true,
  bucket: true,
  rankPosition: true,
  rating: true,
} as const;

/**
 * One bucket's items, best first.
 *
 * `excludeId` keeps the item being placed out of its own comparison list — being
 * asked whether you prefer Kid A to Kid A is not a useful question.
 */
export async function bucketItems(
  userId: string,
  itemType: string,
  bucket: Bucket,
  excludeId?: string
): Promise<LadderItem[]> {
  const rows = await prisma.albumLog.findMany({
    where: {
      userId,
      itemType,
      bucket,
      rankPosition: { not: null },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { rankPosition: "desc" },
    select: LADDER_SELECT,
  });

  return rows.map((r) => ({
    id: r.id,
    mbid: r.mbid,
    title: r.albumTitle,
    artistName: r.artistName,
    coverUrl: r.coverUrl,
    bucket: r.bucket as Bucket,
    rating: r.rating,
  }));
}

/** The whole ladder for one item type, best first across all three buckets. */
export async function getLadder(userId: string, itemType: string): Promise<LadderItem[]> {
  const out: LadderItem[] = [];
  for (const bucket of BUCKETS) out.push(...(await bucketItems(userId, itemType, bucket)));
  return out;
}

/**
 * Re-derive every score in one bucket, and renumber positions to integers.
 *
 * Renumbering is what keeps insertion safe forever: a new item goes in at the
 * midpoint between two neighbours, and without normalising, repeatedly inserting
 * into the same gap would halve it until it ran out of float precision. Doing it
 * here costs nothing, since the rows are being written anyway.
 *
 * This writes `rating` directly and deliberately logs **no** events. A score that
 * moved because a *different* album was placed above it is not an opinion change,
 * and filling the activity feed with those would drown the real ones.
 */
export async function recomputeBucket(
  userId: string,
  itemType: string,
  bucket: Bucket
): Promise<void> {
  const items = await bucketItems(userId, itemType, bucket);
  if (items.length === 0) return;

  const count = items.length;
  await prisma.$transaction(
    items.map((item, index) =>
      prisma.albumLog.update({
        where: { id: item.id },
        // Highest position is best, so the top of the list gets the largest.
        data: { rating: scoreFor(bucket, index, count), rankPosition: count - 1 - index },
      })
    )
  );
}

/**
 * Where to insert so the item sits at `insertIndex` in its bucket.
 *
 * Positions are integers after every recompute, so a midpoint always has room.
 */
function positionAt(items: LadderItem[], insertIndex: number, positions: number[]): number {
  const above = insertIndex > 0 ? positions[insertIndex - 1] : null;
  const below = insertIndex < positions.length ? positions[insertIndex] : null;

  if (above === null && below === null) return 0;
  if (above === null) return (below as number) + 1;
  if (below === null) return above - 1;
  return (above + below) / 2;
}

/**
 * Put an item at a known slot in a bucket, then re-derive that bucket's scores.
 *
 * Returns the score the item ended up with, which is the number the UI shows.
 */
export async function placeItem(params: {
  userId: string;
  logId: string;
  itemType: string;
  bucket: Bucket;
  insertIndex: number;
  source: "COMPARISON" | "MANUAL";
}): Promise<number | null> {
  const { userId, logId, itemType, bucket, insertIndex, source } = params;

  const others = await bucketItems(userId, itemType, bucket, logId);
  const positions = await prisma.albumLog
    .findMany({
      where: { userId, itemType, bucket, rankPosition: { not: null }, id: { not: logId } },
      orderBy: { rankPosition: "desc" },
      select: { rankPosition: true },
    })
    .then((rows) => rows.map((r) => r.rankPosition as number));

  const clamped = Math.max(0, Math.min(insertIndex, others.length));

  await prisma.albumLog.update({
    where: { id: logId },
    data: {
      bucket,
      rankPosition: positionAt(others, clamped, positions),
      ratingSource: source,
    },
  });

  await recomputeBucket(userId, itemType, bucket);

  const placed = await prisma.albumLog.findUnique({
    where: { id: logId },
    select: { rating: true },
  });
  return placed?.rating ?? null;
}

/**
 * The slot a typed score corresponds to — how an override finds its place.
 *
 * The item goes above everything it out-scores, so the ladder stays consistent
 * with the number the user had in mind. The score it finally shows comes from
 * that slot, so it can settle a decimal away from what was typed; the order is
 * what was actually being expressed.
 */
export async function slotForScore(
  userId: string,
  itemType: string,
  logId: string,
  score: number
): Promise<{ bucket: Bucket; insertIndex: number }> {
  const bucket = bucketForScore(score);
  const items = await bucketItems(userId, itemType, bucket, logId);
  const insertIndex = items.filter((i) => (i.rating ?? 0) > score).length;
  return { bucket, insertIndex };
}

/**
 * Give every already-rated item a place in the ladder.
 *
 * Ratings made before ranking was switched on become the starting order: bucket
 * from the band their score falls in, order within it from the score itself. So
 * turning the toggle on preserves what the user already said instead of asking
 * them to rank a library from scratch. Idempotent — only untouched rows are seeded.
 */
export async function ensureSeeded(
  userId: string,
  itemType: string,
  /**
   * Rebuild the ladder from current ratings instead of only filling gaps.
   *
   * Used when ranking is switched on, so ratings made with the slider while it
   * was off are absorbed. It is not destructive: scores descend with position, so
   * rebuilding from scores reproduces the same order it came from — while also
   * picking up anything that changed in the meantime.
   */
  reseed = false
): Promise<void> {
  if (reseed) {
    await prisma.albumLog.updateMany({
      where: { userId, itemType },
      data: { bucket: null, rankPosition: null },
    });
  }

  const unseeded = await prisma.albumLog.findMany({
    where: { userId, itemType, rating: { not: null }, rankPosition: null },
    orderBy: { rating: "desc" },
    select: { id: true, rating: true },
  });
  if (unseeded.length === 0) return;

  // Best first, each one landing below the last: positions run -1, -2, -3…, so
  // descending position is descending old rating. Iterating worst-first here
  // silently inverts the whole ladder — the highest position goes to whichever
  // row is handled first, not to the best one.
  for (const row of unseeded) {
    const bucket = bucketForScore(row.rating as number);
    const existing = await prisma.albumLog.count({
      where: { userId, itemType, bucket, rankPosition: { not: null } },
    });
    await prisma.albumLog.update({
      where: { id: row.id },
      data: { bucket, rankPosition: -existing - 1, ratingSource: "MANUAL" },
    });
  }

  for (const bucket of BUCKETS) await recomputeBucket(userId, itemType, bucket);
}

export type RankingState = {
  enabled: boolean;
  ratedCount: number;
  /** Enabled *and* past the threshold — comparisons actually run. */
  active: boolean;
  needed: number;
};

/** Whether comparison rating applies right now, for this user and item type. */
export async function rankingState(
  userId: string,
  itemType: string
): Promise<RankingState> {
  const [user, ratedCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { rankingEnabled: true } }),
    prisma.albumLog.count({ where: { userId, itemType, rating: { not: null } } }),
  ]);

  const enabled = !!user?.rankingEnabled;
  return {
    enabled,
    ratedCount,
    active: enabled && ratedCount >= RANKING_MIN_RATED,
    needed: Math.max(0, RANKING_MIN_RATED - ratedCount),
  };
}
