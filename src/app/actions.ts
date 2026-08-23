"use server";

import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { syncItemAdded, syncItemRemoved } from "@/lib/playlist-sync";
import { enrichRow } from "@/lib/enrich";
import { trackChange, trackRemoval, type PriorState, type TrackedItem } from "@/lib/tracking";
import {
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
import { knownIds } from "@/lib/stats-modules";
import { isStatus } from "@/lib/statuses";

/** Everything needed to create a library row for an album or a song. */
export type LibraryItemInput = {
  mbid: string;
  itemType: "ALBUM" | "SONG";
  title: string;
  artistName: string;
  parentAlbum?: string;
  releaseYear?: number;
  coverUrl?: string;
  artistMbid?: string;
};

const WANT = "WANT";

/** What a change needs to know about the row as it stood beforehand. */
const PRIOR = {
  id: true,
  mbid: true,
  status: true,
  rating: true,
  wantedAt: true,
  genres: true,
} as const;

type PriorRow = {
  id: string;
  mbid: string;
  status: string;
  rating: number | null;
  wantedAt: Date | null;
  genres: string[];
};

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * The row a song should write to, if one already exists under a different id.
 *
 * MusicBrainz-era ids and Spotify track ids both vary per release, so the same song
 * can arrive under several ids. Keying on id alone would put two "Karma Police" rows
 * in the library, so a song already saved under any id is updated in place.
 */
async function findExistingSongId(
  userId: string,
  item: LibraryItemInput
): Promise<string | null> {
  if (item.itemType !== "SONG") return null;

  const existing = await prisma.albumLog.findFirst({
    where: {
      userId,
      itemType: "SONG",
      albumTitle: item.title,
      artistName: item.artistName,
    },
    select: { id: true },
  });
  return existing?.id ?? null;
}

/** The row as it stood before this action, by song key when there is one. */
async function loadPrior(
  userId: string,
  item: LibraryItemInput,
  existingSongId: string | null
): Promise<PriorRow | null> {
  return existingSongId
    ? prisma.albumLog.findUnique({ where: { id: existingSongId }, select: PRIOR })
    : prisma.albumLog.findUnique({
        where: { userId_mbid: { userId, mbid: item.mbid } },
        select: PRIOR,
      });
}

function refresh() {
  revalidatePath("/library");
  revalidatePath("/");
}

function snapshot(item: LibraryItemInput, prior: PriorRow | null): TrackedItem {
  return {
    mbid: item.mbid,
    itemType: item.itemType,
    title: item.title,
    artistName: item.artistName,
    artistId: item.artistMbid ?? null,
    releaseYear: item.releaseYear ?? null,
    // Whatever enrichment already found for this row; empty on a first save, and
    // backfilled onto the event once enrichment runs below.
    genres: prior?.genres ?? [],
  };
}

/**
 * Everything a library change triggers that the user should not wait for.
 *
 * `after()` runs this once the response has been sent, so tapping a status keeps
 * feeling instant even when the item is a 71-track box set and the change also owes
 * a Spotify write, an event row and a catalogue lookup. Nothing here is read back
 * synchronously, and the before-state is captured by the caller, so none of it
 * races the action it follows.
 */
function queueBackground(params: {
  userId: string;
  logId: string;
  item: LibraryItemInput;
  prior: PriorRow | null;
  next: { status: string; rating: number | null };
  /** The id the playlist sync should use — the stored row's, not the tapped card's. */
  syncMbid: string;
}): void {
  const { userId, logId, item, prior, next, syncMbid } = params;
  const before: PriorState = prior
    ? { status: prior.status, rating: prior.rating, wantedAt: prior.wantedAt }
    : null;

  after(async () => {
    await trackChange({ userId, logId, item: snapshot(item, prior), before, after: next });

    // Only transitions in and out of Want to Listen affect the playlist; a rating
    // change or a move between the other statuses does not.
    const wasWanted = prior?.status === WANT;
    const isWanted = next.status === WANT;
    if (wasWanted !== isWanted) {
      if (isWanted) await syncItemAdded(userId, syncMbid, item.itemType);
      else await syncItemRemoved(userId, syncMbid);
    }

    // Last of the three: the slowest, and the least urgent.
    await enrichRow(logId);
  });
}

/** Add an item to the library, or move an existing one to a new status. */
export async function saveToLibrary(item: LibraryItemInput, status: string) {
  const userId = await requireUserId();

  // A page cached from before a status was removed can still post the old value,
  // and a row holding a status the UI no longer offers is invisible in every
  // filter — in the library, reachable from nothing.
  if (!isStatus(status)) {
    throw new Error(`Unknown status: ${status}`);
  }

  const existingSongId = await findExistingSongId(userId, item);
  const prior = await loadPrior(userId, item, existingSongId);

  const row = existingSongId
    ? await prisma.albumLog.update({
        where: { id: existingSongId },
        data: { status, coverUrl: item.coverUrl ?? undefined },
        select: { id: true, rating: true },
      })
    : await prisma.albumLog.upsert({
        where: { userId_mbid: { userId, mbid: item.mbid } },
        create: {
          userId,
          mbid: item.mbid,
          itemType: item.itemType,
          albumTitle: item.title,
          artistName: item.artistName,
          parentAlbum: item.parentAlbum ?? null,
          status,
          releaseYear: item.releaseYear ?? null,
          coverUrl: item.coverUrl ?? null,
          artistMbid: item.artistMbid ?? null,
        },
        update: {
          status,
          coverUrl: item.coverUrl ?? undefined,
          artistMbid: item.artistMbid ?? undefined,
        },
        select: { id: true, rating: true },
      });

  queueBackground({
    userId,
    logId: row.id,
    item,
    prior,
    next: { status, rating: row.rating },
    // The stored row may use a different id than the card that was tapped.
    syncMbid: prior?.mbid ?? item.mbid,
  });

  refresh();
}

/** Rate an item 0–10. Rating something implies you listened to it. */
export async function rateItem(item: LibraryItemInput, rating: number) {
  const userId = await requireUserId();
  // Ratings are 0–10 to one decimal. Rounded here so a stray float from the client
  // can't store 7.300000000000001.
  const clamped = Math.round(Math.min(10, Math.max(0, rating)) * 10) / 10;

  const existingSongId = await findExistingSongId(userId, item);
  const prior = await loadPrior(userId, item, existingSongId);

  const row = existingSongId
    ? await prisma.albumLog.update({
        where: { id: existingSongId },
        data: { rating: clamped, status: "LISTENED", coverUrl: item.coverUrl ?? undefined },
        select: { id: true },
      })
    : await prisma.albumLog.upsert({
        where: { userId_mbid: { userId, mbid: item.mbid } },
        create: {
          userId,
          mbid: item.mbid,
          itemType: item.itemType,
          albumTitle: item.title,
          artistName: item.artistName,
          parentAlbum: item.parentAlbum ?? null,
          status: "LISTENED",
          rating: clamped,
          releaseYear: item.releaseYear ?? null,
          coverUrl: item.coverUrl ?? null,
          artistMbid: item.artistMbid ?? null,
        },
        update: {
          rating: clamped,
          status: "LISTENED",
          coverUrl: item.coverUrl ?? undefined,
          artistMbid: item.artistMbid ?? undefined,
        },
        select: { id: true },
      });

  // Rating always lands on Listened, so anything that was wanted leaves the playlist.
  queueBackground({
    userId,
    logId: row.id,
    item,
    prior,
    next: { status: "LISTENED", rating: clamped },
    syncMbid: prior?.mbid ?? item.mbid,
  });

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
  const userId = await requireUserId();

  // Read the whole row before deleting: afterwards, the removal event has no other
  // source for what was removed.
  const existing = await prisma.albumLog.findFirst({
    where: song
      ? { userId, OR: [{ mbid }, { itemType: "SONG", albumTitle: song.title, artistName: song.artistName }] }
      : { userId, mbid },
    select: {
      mbid: true,
      itemType: true,
      albumTitle: true,
      artistName: true,
      artistMbid: true,
      releaseYear: true,
      genres: true,
      status: true,
      rating: true,
      wantedAt: true,
    },
  });

  const deleted = await prisma.albumLog.deleteMany({ where: { userId, mbid } });

  if (deleted.count === 0 && song) {
    await prisma.albumLog.deleteMany({
      where: {
        userId,
        itemType: "SONG",
        albumTitle: song.title,
        artistName: song.artistName,
      },
    });
  }

  if (existing) {
    after(async () => {
      await trackRemoval({
        userId,
        item: {
          mbid: existing.mbid,
          itemType: existing.itemType,
          title: existing.albumTitle,
          artistName: existing.artistName,
          artistId: existing.artistMbid,
          releaseYear: existing.releaseYear,
          genres: existing.genres,
        },
        before: {
          status: existing.status,
          rating: existing.rating,
          wantedAt: existing.wantedAt,
        },
      });
      if (existing.status === WANT) await syncItemRemoved(userId, existing.mbid);
    });
  }

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
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { rankingEnabled: enabled } });
  if (enabled) {
    await ensureSeeded(userId, "ALBUM", true);
    await ensureSeeded(userId, "SONG", true);
  }
  refresh();
}

/** Everything the comparison modal needs to run the whole flow client-side. */
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
export async function getComparisonSetup(item: LibraryItemInput): Promise<ComparisonSetup> {
  const userId = await requireUserId();
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
 * Write the row this rating belongs to, without touching the score.
 *
 * Rating implies listening, exactly as the typed path does. The score is set
 * afterwards by the placement, so it is never written twice.
 */
async function upsertForRanking(
  userId: string,
  item: LibraryItemInput,
  existingSongId: string | null
): Promise<{ id: string }> {
  if (existingSongId) {
    return prisma.albumLog.update({
      where: { id: existingSongId },
      data: { status: "LISTENED", coverUrl: item.coverUrl ?? undefined },
      select: { id: true },
    });
  }
  return prisma.albumLog.upsert({
    where: { userId_mbid: { userId, mbid: item.mbid } },
    create: {
      userId,
      mbid: item.mbid,
      itemType: item.itemType,
      albumTitle: item.title,
      artistName: item.artistName,
      parentAlbum: item.parentAlbum ?? null,
      status: "LISTENED",
      releaseYear: item.releaseYear ?? null,
      coverUrl: item.coverUrl ?? null,
      artistMbid: item.artistMbid ?? null,
    },
    update: {
      status: "LISTENED",
      coverUrl: item.coverUrl ?? undefined,
      artistMbid: item.artistMbid ?? undefined,
    },
    select: { id: true },
  });
}

/**
 * Rate by where the comparisons landed. Returns the derived score.
 *
 * `insertIndex` is the slot in the bucket the client's binary search arrived at,
 * 0 being the top. The server re-resolves and re-scores from it, so a client
 * working from a slightly stale list still produces a correct ladder.
 */
export async function rateByComparison(
  item: LibraryItemInput,
  bucket: Bucket,
  insertIndex: number
): Promise<number | null> {
  const userId = await requireUserId();

  const existingSongId = await findExistingSongId(userId, item);
  const prior = await loadPrior(userId, item, existingSongId);
  const row = await upsertForRanking(userId, item, existingSongId);

  await ensureSeeded(userId, item.itemType);
  const rating = await placeItem({
    userId,
    logId: row.id,
    itemType: item.itemType,
    bucket,
    insertIndex,
    source: "COMPARISON",
  });

  queueBackground({
    userId,
    logId: row.id,
    item,
    prior,
    next: { status: "LISTENED", rating },
    syncMbid: prior?.mbid ?? item.mbid,
  });

  refresh();
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
export async function rateByNumber(
  item: LibraryItemInput,
  score: number
): Promise<number | null> {
  const userId = await requireUserId();
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

  refresh();
  return rating;
}

/**
 * Whether comparison rating applies, without the candidate payload.
 *
 * Called by the rate controls to decide which rating UI to show, so it stays
 * cheap: one user lookup and one count. Returns inactive rather than redirecting
 * when signed out — a rating control that is never reachable anyway.
 */
export async function rankingMode(
  itemType: string
): Promise<{ enabled: boolean; active: boolean; needed: number }> {
  const session = await auth();
  if (!session?.user?.id) return { enabled: false, active: false, needed: 0 };
  const state = await rankingState(session.user.id, itemType);
  return { enabled: state.enabled, active: state.active, needed: state.needed };
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
