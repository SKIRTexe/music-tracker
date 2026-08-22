"use server";

import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { syncItemAdded, syncItemRemoved } from "@/lib/playlist-sync";
import { enrichRow } from "@/lib/enrich";
import { trackChange, trackRemoval, type PriorState, type TrackedItem } from "@/lib/tracking";

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
