import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The read side of tracking: every metric, computed on demand.
 *
 * Nothing here is pre-aggregated. A personal library is thousands of rows at the
 * very outside, so a handful of indexed aggregate queries beats maintaining daily
 * rollup tables that can drift out of step with the events they summarise. If this
 * ever gets slow, cache the *output* of `getDashboard` — don't denormalise further.
 *
 * Two data sources, and which one to use is not a matter of taste:
 *
 * - **`AlbumLog`** answers "what is true now" — how many albums, what they average,
 *   which genres are in the library.
 * - **`LibraryEvent`** answers "what happened, and when" — every timeseries,
 *   anything about a *former* state, and anything about items since deleted.
 *
 * Asking one of them the other's question gives a wrong answer rather than a slow
 * one: `AlbumLog` has no memory of a rating you changed, and the event log counts
 * an item you added and deleted twice over.
 *
 * Every function takes an optional `userId`. Omitting it aggregates across all
 * users, which is what an operator dashboard wants; passing it scopes to one
 * person, which is what their own stats page wants.
 */

// ── Query helpers ─────────────────────────────────────────────────────────────

/** Scope predicate, for queries that already have a WHERE. */
function only(userId?: string): Prisma.Sql {
  return userId ? Prisma.sql`AND "userId" = ${userId}` : Prisma.empty;
}

/** Raw counts arrive as BigInt, and BigInt does not survive JSON. */
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const opt = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/** Round to 2dp for display; averages otherwise print 7.333333333333333. */
const round2 = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 100) / 100;

const HOUR_MS = 3_600_000;

export type Grain = "day" | "week" | "month";

/** Whitelisted before it reaches `Prisma.raw`, which does not escape. */
function grainSql(grain: Grain): Prisma.Sql {
  const allowed: Record<Grain, string> = { day: "day", week: "week", month: "month" };
  return Prisma.raw(`'${allowed[grain] ?? "day"}'`);
}

// ── Library totals ────────────────────────────────────────────────────────────

export type LibraryTotals = {
  items: number;
  albums: number;
  songs: number;
  byStatus: { want: number; listened: number };
  rated: number;
  unrated: number;
  /** Share of the library that has a rating, 0–1. */
  ratedShare: number | null;
  distinctArtists: number;
  distinctGenres: number;
  /** Tracks across the library, albums counted as their whole tracklist. */
  tracks: number;
  hours: number | null;
  /** Rows still awaiting genre/runtime enrichment — see `enrichBacklog`. */
  pendingEnrichment: number;
};

export async function getLibraryTotals(userId?: string): Promise<LibraryTotals> {
  const [row] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*)                                            AS items,
      COUNT(*) FILTER (WHERE "itemType" = 'ALBUM')        AS albums,
      COUNT(*) FILTER (WHERE "itemType" = 'SONG')         AS songs,
      COUNT(*) FILTER (WHERE "status" = 'WANT')           AS want,
      COUNT(*) FILTER (WHERE "status" = 'LISTENED')       AS listened,
      COUNT("rating")                                     AS rated,
      COUNT(DISTINCT "artistName")                        AS artists,
      COALESCE(SUM("trackCount"), 0)                      AS tracks,
      COALESCE(SUM("durationMs"), 0)                      AS duration,
      COUNT(*) FILTER (WHERE "enrichedAt" IS NULL)        AS pending
    FROM "AlbumLog"
    WHERE 1 = 1 ${only(userId)}
  `;

  const [genreRow] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT COUNT(DISTINCT g) AS genres
    FROM "AlbumLog", UNNEST("genres") AS g
    WHERE 1 = 1 ${only(userId)}
  `;

  const items = num(row?.items);
  const rated = num(row?.rated);
  const duration = num(row?.duration);

  return {
    items,
    albums: num(row?.albums),
    songs: num(row?.songs),
    byStatus: {
      want: num(row?.want),
      listened: num(row?.listened),
    },
    rated,
    unrated: items - rated,
    ratedShare: items > 0 ? round2(rated / items) : null,
    distinctArtists: num(row?.artists),
    distinctGenres: num(genreRow?.genres),
    tracks: num(row?.tracks),
    hours: duration > 0 ? round2(duration / HOUR_MS) : null,
    pendingEnrichment: num(row?.pending),
  };
}

// ── Ratings ───────────────────────────────────────────────────────────────────

export type RatingStats = {
  count: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  /** Population standard deviation — how harsh/generous the spread is. */
  spread: number | null;
  averageAlbum: number | null;
  averageSong: number | null;
  /** One bucket per whole point, 0–10, so a histogram needs no client-side binning. */
  distribution: { bucket: number; count: number }[];
  /** Items whose rating has been changed at least once. */
  reratedItems: number;
  /** Mean signed change on a re-rate: positive means opinions warm over time. */
  averageRerateDelta: number | null;
};

export async function getRatingStats(userId?: string): Promise<RatingStats> {
  const [row] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT("rating")                                              AS n,
      AVG("rating")                                                AS avg,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "rating")         AS median,
      MIN("rating")                                                AS min,
      MAX("rating")                                                AS max,
      STDDEV_POP("rating")                                         AS spread,
      AVG("rating") FILTER (WHERE "itemType" = 'ALBUM')            AS avg_album,
      AVG("rating") FILTER (WHERE "itemType" = 'SONG')             AS avg_song,
      COUNT(*) FILTER (WHERE "ratingCount" > 1)                    AS rerated
    FROM "AlbumLog"
    WHERE "rating" IS NOT NULL ${only(userId)}
  `;

  const buckets = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT FLOOR("rating")::int AS bucket, COUNT(*) AS count
    FROM "AlbumLog"
    WHERE "rating" IS NOT NULL ${only(userId)}
    GROUP BY 1
    ORDER BY 1
  `;

  // The delta needs the *previous* rating, which only the event log still holds.
  const [delta] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT AVG("toRating" - "fromRating") AS avg_delta
    FROM "LibraryEvent"
    WHERE "type" = 'RERATED' AND "fromRating" IS NOT NULL ${only(userId)}
  `;

  const counted = new Map(buckets.map((b) => [num(b.bucket), num(b.count)]));

  return {
    count: num(row?.n),
    average: round2(opt(row?.avg)),
    median: round2(opt(row?.median)),
    min: opt(row?.min),
    max: opt(row?.max),
    spread: round2(opt(row?.spread)),
    averageAlbum: round2(opt(row?.avg_album)),
    averageSong: round2(opt(row?.avg_song)),
    // Emitted for every bucket, including empty ones, so bars don't shift about.
    distribution: Array.from({ length: 11 }, (_, i) => ({
      bucket: i,
      count: counted.get(i) ?? 0,
    })),
    reratedItems: num(row?.rerated),
    averageRerateDelta: round2(opt(delta?.avg_delta)),
  };
}

/** Highest and lowest rated items. */
export async function getRatingExtremes(userId?: string, limit = 10) {
  const where = { rating: { not: null }, ...(userId ? { userId } : {}) };
  const select = {
    mbid: true,
    itemType: true,
    albumTitle: true,
    artistName: true,
    rating: true,
    coverUrl: true,
    releaseYear: true,
  } as const;

  const [highest, lowest] = await Promise.all([
    prisma.albumLog.findMany({ where, select, orderBy: { rating: "desc" }, take: limit }),
    prisma.albumLog.findMany({ where, select, orderBy: { rating: "asc" }, take: limit }),
  ]);
  return { highest, lowest };
}

// ── Genres ────────────────────────────────────────────────────────────────────

export type GenreStat = {
  genre: string;
  items: number;
  rated: number;
  average: number | null;
  /** Share of the library carrying this genre, 0–1. Genres overlap, so these sum past 1. */
  share: number | null;
};

/**
 * Per-genre counts and averages.
 *
 * An item carries every genre its artist does — Spotify gives Radiohead five —
 * so an item counts once per genre and the shares deliberately sum to more than 1.
 * `minItems` keeps a genre held by one album out of a "best genre" ranking.
 */
export async function getGenreStats(
  userId?: string,
  opts: { minItems?: number; limit?: number } = {}
): Promise<{ byCount: GenreStat[]; byRating: GenreStat[]; unclassified: number }> {
  const { minItems = 1, limit = 40 } = opts;

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT g AS genre, COUNT(*) AS items, COUNT("rating") AS rated, AVG("rating") AS avg
    FROM "AlbumLog", UNNEST("genres") AS g
    WHERE 1 = 1 ${only(userId)}
    GROUP BY g
    HAVING COUNT(*) >= ${minItems}
    ORDER BY COUNT(*) DESC, g ASC
    LIMIT ${limit}
  `;

  const [totals] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*) AS items,
      COUNT(*) FILTER (WHERE "genres" IS NULL OR CARDINALITY("genres") = 0) AS unclassified
    FROM "AlbumLog"
    WHERE 1 = 1 ${only(userId)}
  `;
  const total = num(totals?.items);

  const mapped: GenreStat[] = rows.map((r) => ({
    genre: String(r.genre),
    items: num(r.items),
    rated: num(r.rated),
    average: round2(opt(r.avg)),
    share: total > 0 ? round2(num(r.items) / total) : null,
  }));

  return {
    byCount: mapped,
    // Only genres with a rating can be ranked by one.
    byRating: [...mapped]
      .filter((g) => g.average !== null)
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
    unclassified: num(totals?.unclassified),
  };
}

// ── Artists ───────────────────────────────────────────────────────────────────

export type ArtistStat = {
  artistName: string;
  artistId: string | null;
  items: number;
  rated: number;
  average: number | null;
};

/** Grouped by name, not id: rows saved before Spotify have no artist id. */
export async function getArtistStats(
  userId?: string,
  opts: { minItems?: number; limit?: number } = {}
): Promise<ArtistStat[]> {
  const { minItems = 1, limit = 25 } = opts;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      "artistName",
      MAX("artistMbid") AS artist_id,
      COUNT(*)          AS items,
      COUNT("rating")   AS rated,
      AVG("rating")     AS avg
    FROM "AlbumLog"
    WHERE 1 = 1 ${only(userId)}
    GROUP BY "artistName"
    HAVING COUNT(*) >= ${minItems}
    ORDER BY COUNT(*) DESC, AVG("rating") DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    artistName: String(r.artistName),
    artistId: r.artist_id ? String(r.artist_id) : null,
    items: num(r.items),
    rated: num(r.rated),
    average: round2(opt(r.avg)),
  }));
}

// ── Era ───────────────────────────────────────────────────────────────────────

export type EraStats = {
  averageReleaseYear: number | null;
  oldest: number | null;
  newest: number | null;
  byDecade: { decade: number; items: number; average: number | null }[];
};

export async function getEraStats(userId?: string): Promise<EraStats> {
  const [row] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT AVG("releaseYear") AS avg, MIN("releaseYear") AS oldest, MAX("releaseYear") AS newest
    FROM "AlbumLog"
    WHERE "releaseYear" IS NOT NULL ${only(userId)}
  `;

  const decades = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ("releaseYear" / 10) * 10 AS decade, COUNT(*) AS items, AVG("rating") AS avg
    FROM "AlbumLog"
    WHERE "releaseYear" IS NOT NULL ${only(userId)}
    GROUP BY 1
    ORDER BY 1
  `;

  return {
    averageReleaseYear: opt(row?.avg) === null ? null : Math.round(Number(row?.avg)),
    oldest: opt(row?.oldest),
    newest: opt(row?.newest),
    byDecade: decades.map((d) => ({
      decade: num(d.decade),
      items: num(d.items),
      average: round2(opt(d.avg)),
    })),
  };
}

// ── Activity over time ────────────────────────────────────────────────────────

export type ActivityPoint = {
  /** Start of the bucket, in UTC. */
  bucket: Date;
  added: number;
  wanted: number;
  listened: number;
  rated: number;
  removed: number;
};

/**
 * Actions per day/week/month.
 *
 * `wanted` and `listened` count *transitions into* those statuses, so an album
 * rated straight from a search result counts as a listen even though no separate
 * status tap ever happened. `added` counts only first appearances in the library.
 */
export async function getActivity(
  userId?: string,
  opts: { days?: number; grain?: Grain } = {}
): Promise<ActivityPoint[]> {
  const { days = 90, grain = "day" } = opts;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      DATE_TRUNC(${grainSql(grain)}, "createdAt")                     AS bucket,
      COUNT(*) FILTER (WHERE "type" = 'ADDED')                        AS added,
      COUNT(*) FILTER (WHERE "toStatus" = 'WANT')                     AS wanted,
      COUNT(*) FILTER (WHERE "toStatus" = 'LISTENED')                 AS listened,
      COUNT(*) FILTER (WHERE "type" IN ('RATED', 'RERATED'))          AS rated,
      COUNT(*) FILTER (WHERE "type" = 'REMOVED')                      AS removed
    FROM "LibraryEvent"
    WHERE "createdAt" >= NOW() - MAKE_INTERVAL(days => ${days}::int) ${only(userId)}
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((r) => ({
    bucket: r.bucket as Date,
    added: num(r.added),
    wanted: num(r.wanted),
    listened: num(r.listened),
    rated: num(r.rated),
    removed: num(r.removed),
  }));
}

export type HabitStats = {
  /** Counts by day of week, 0 = Sunday. UTC. */
  byWeekday: { weekday: number; count: number }[];
  /** Counts by hour, 0–23. UTC — not the user's local time. */
  byHour: { hour: number; count: number }[];
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
};

/**
 * When the user actually uses the app, and how consistently.
 *
 * Buckets are UTC. Getting local-time buckets means storing the user's timezone,
 * which nothing collects yet — so a dashboard should say UTC rather than imply a
 * "you listen at 2am" that is really 9pm in New York.
 */
export async function getHabits(userId?: string): Promise<HabitStats> {
  const [weekdays, hours, dayRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT EXTRACT(DOW FROM "createdAt")::int AS weekday, COUNT(*) AS count
      FROM "LibraryEvent" WHERE 1 = 1 ${only(userId)} GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*) AS count
      FROM "LibraryEvent" WHERE 1 = 1 ${only(userId)} GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT DISTINCT DATE_TRUNC('day', "createdAt")::date AS day
      FROM "LibraryEvent" WHERE 1 = 1 ${only(userId)} ORDER BY 1
    `,
  ]);

  const weekdayCounts = new Map(weekdays.map((r) => [num(r.weekday), num(r.count)]));
  const hourCounts = new Map(hours.map((r) => [num(r.hour), num(r.count)]));

  const days = dayRows.map((r) => new Date(r.day as Date));
  const DAY = 86_400_000;
  const asUtcDay = (d: Date) => Math.floor(d.getTime() / DAY);

  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const key = asUtcDay(d);
    run = prev !== null && key === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = key;
  }

  // A streak counts as current if the last active day was today or yesterday —
  // otherwise every streak would break at midnight UTC.
  const today = asUtcDay(new Date());
  const current = prev !== null && today - prev <= 1 ? run : 0;

  return {
    byWeekday: Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      count: weekdayCounts.get(i) ?? 0,
    })),
    byHour: Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourCounts.get(i) ?? 0,
    })),
    activeDays: days.length,
    currentStreak: current,
    longestStreak: longest,
    firstActivity: days[0] ?? null,
    lastActivity: days[days.length - 1] ?? null,
  };
}

// ── Backlog ───────────────────────────────────────────────────────────────────

export type BacklogStats = {
  /** Currently in Want to Listen. */
  size: number;
  oldestWantedAt: Date | null;
  /** Average age of what is *still* waiting, in days. */
  averageAgeDays: number | null;
  ageBuckets: { under7: number; under30: number; under90: number; over90: number };
  /** Distinct items that have ever entered Want to Listen. */
  everWanted: number;
  /** Of those, how many were later listened to. */
  converted: number;
  /** converted / everWanted, 0–1 — the share of intentions actually followed through. */
  conversionRate: number | null;
  /** Days from wanting to listening, over items that made it. */
  averageWaitDays: number | null;
  medianWaitDays: number | null;
  /** Wanted items abandoned outright. */
  removedWhileWanted: number;
};

/**
 * How the Want to Listen queue behaves: how big, how old, how much of it is
 * actually consumed.
 *
 * Conversion has to come from the event log. A row that moved from Want to
 * Listened no longer says anywhere that it was ever wanted, so counting current
 * rows would put conversion at zero for exactly the items that succeeded.
 */
export async function getBacklogStats(userId?: string): Promise<BacklogStats> {
  const [current] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*)                    AS size,
      MIN(COALESCE("wantedAt", "addedAt")) AS oldest,
      AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE("wantedAt", "addedAt"))) / 86400) AS avg_age,
      COUNT(*) FILTER (WHERE COALESCE("wantedAt", "addedAt") >  NOW() - MAKE_INTERVAL(days => 7))  AS under7,
      COUNT(*) FILTER (WHERE COALESCE("wantedAt", "addedAt") <= NOW() - MAKE_INTERVAL(days => 7)
                         AND COALESCE("wantedAt", "addedAt") >  NOW() - MAKE_INTERVAL(days => 30)) AS under30,
      COUNT(*) FILTER (WHERE COALESCE("wantedAt", "addedAt") <= NOW() - MAKE_INTERVAL(days => 30)
                         AND COALESCE("wantedAt", "addedAt") >  NOW() - MAKE_INTERVAL(days => 90)) AS under90,
      COUNT(*) FILTER (WHERE COALESCE("wantedAt", "addedAt") <= NOW() - MAKE_INTERVAL(days => 90)) AS over90
    FROM "AlbumLog"
    WHERE "status" = 'WANT' ${only(userId)}
  `;

  const [flow] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(DISTINCT "mbid") FILTER (WHERE "toStatus" = 'WANT')                       AS ever_wanted,
      COUNT(DISTINCT "mbid") FILTER (WHERE "toStatus" = 'LISTENED'
                                       AND "fromStatus" = 'WANT')                     AS converted,
      COUNT(DISTINCT "mbid") FILTER (WHERE "type" = 'REMOVED'
                                       AND "fromStatus" = 'WANT')                     AS abandoned,
      AVG("waitDays") FILTER (WHERE "toStatus" = 'LISTENED')                          AS avg_wait,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "waitDays")
        FILTER (WHERE "toStatus" = 'LISTENED')                                        AS median_wait
    FROM "LibraryEvent"
    WHERE 1 = 1 ${only(userId)}
  `;

  const everWanted = num(flow?.ever_wanted);
  const converted = num(flow?.converted);

  return {
    size: num(current?.size),
    oldestWantedAt: (current?.oldest as Date) ?? null,
    averageAgeDays: round2(opt(current?.avg_age)),
    ageBuckets: {
      under7: num(current?.under7),
      under30: num(current?.under30),
      under90: num(current?.under90),
      over90: num(current?.over90),
    },
    everWanted,
    converted,
    conversionRate: everWanted > 0 ? round2(converted / everWanted) : null,
    averageWaitDays: round2(opt(flow?.avg_wait)),
    medianWaitDays: round2(opt(flow?.median_wait)),
    removedWhileWanted: num(flow?.abandoned),
  };
}

// ── Rating drift ──────────────────────────────────────────────────────────────

export type RatingTrendPoint = { month: Date; average: number | null; count: number };

/**
 * Average rating given per month — whether the user is getting more generous.
 *
 * From the event log, so it reflects the rating *as given at the time*. The same
 * question asked of `AlbumLog` would silently rewrite history every re-rate.
 */
export async function getRatingTrend(
  userId?: string,
  opts: { months?: number } = {}
): Promise<RatingTrendPoint[]> {
  const { months = 24 } = opts;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT DATE_TRUNC('month', "createdAt") AS month, AVG("toRating") AS avg, COUNT(*) AS count
    FROM "LibraryEvent"
    WHERE "toRating" IS NOT NULL
      AND "createdAt" >= NOW() - MAKE_INTERVAL(months => ${months}::int)
      ${only(userId)}
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((r) => ({
    month: r.month as Date,
    average: round2(opt(r.avg)),
    count: num(r.count),
  }));
}

// ── Feed ──────────────────────────────────────────────────────────────────────

/** The raw history, newest first — for an activity feed or a debug view. */
export async function getRecentEvents(userId?: string, limit = 50) {
  return prisma.libraryEvent.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export type EventTotals = {
  total: number;
  added: number;
  statusChanged: number;
  rated: number;
  rerated: number;
  removed: number;
};

/** Lifetime action counts. Unlike library totals, deletions still count here. */
export async function getEventTotals(userId?: string): Promise<EventTotals> {
  const [row] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE "type" = 'ADDED')          AS added,
      COUNT(*) FILTER (WHERE "type" = 'STATUS_CHANGED') AS status_changed,
      COUNT(*) FILTER (WHERE "type" = 'RATED')          AS rated,
      COUNT(*) FILTER (WHERE "type" = 'RERATED')        AS rerated,
      COUNT(*) FILTER (WHERE "type" = 'REMOVED')        AS removed
    FROM "LibraryEvent"
    WHERE 1 = 1 ${only(userId)}
  `;
  return {
    total: num(row?.total),
    added: num(row?.added),
    statusChanged: num(row?.status_changed),
    rated: num(row?.rated),
    rerated: num(row?.rerated),
    removed: num(row?.removed),
  };
}

// ── Everything ────────────────────────────────────────────────────────────────

export type Dashboard = {
  totals: LibraryTotals;
  events: EventTotals;
  ratings: RatingStats;
  extremes: Awaited<ReturnType<typeof getRatingExtremes>>;
  genres: Awaited<ReturnType<typeof getGenreStats>>;
  artists: ArtistStat[];
  era: EraStats;
  activity: ActivityPoint[];
  habits: HabitStats;
  backlog: BacklogStats;
  ratingTrend: RatingTrendPoint[];
};

/**
 * Every metric in one call, for the dashboard page.
 *
 * Issued in parallel — they are independent aggregates over two tables, so the
 * whole set costs about as long as its slowest query.
 */
export async function getDashboard(
  userId?: string,
  opts: {
    days?: number;
    grain?: Grain;
    /** Genres held by fewer items than this are left out of the breakdown. */
    minGenreItems?: number;
  } = {}
): Promise<Dashboard> {
  const [
    totals,
    events,
    ratings,
    extremes,
    genres,
    artists,
    era,
    activity,
    habits,
    backlog,
    ratingTrend,
  ] = await Promise.all([
    getLibraryTotals(userId),
    getEventTotals(userId),
    getRatingStats(userId),
    getRatingExtremes(userId, 8),
    getGenreStats(userId, { minItems: opts.minGenreItems ?? 1, limit: 14 }),
    getArtistStats(userId, { limit: 10 }),
    getEraStats(userId),
    getActivity(userId, opts),
    getHabits(userId),
    getBacklogStats(userId),
    getRatingTrend(userId),
  ]);

  return {
    totals,
    events,
    ratings,
    extremes,
    genres,
    artists,
    era,
    activity,
    habits,
    backlog,
    ratingTrend,
  };
}
