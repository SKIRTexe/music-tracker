"use server";

import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { syncItemAdded, syncItemRemoved } from "@/lib/playlist-sync";

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

function refresh() {
  revalidatePath("/library");
  revalidatePath("/");
}

/**
 * Mirror a Want to Listen change into the Spotify playlist, in the background.
 *
 * `after()` runs this once the response has been sent, so tapping a status keeps
 * feeling instant even when the item is a 71-track box set. Only transitions in and
 * out of Want to Listen matter — a rating change or a move between the other
 * statuses doesn't affect the playlist.
 */
function queuePlaylistSync(
  userId: string,
  item: { mbid: string; itemType: string },
  wasWanted: boolean,
  isWanted: boolean
): void {
  if (wasWanted === isWanted) return;
  after(async () => {
    if (isWanted) await syncItemAdded(userId, item.mbid, item.itemType);
    else await syncItemRemoved(userId, item.mbid);
  });
}

/** Add an item to the library, or move an existing one to a new status. */
export async function saveToLibrary(item: LibraryItemInput, status: string) {
  const userId = await requireUserId();

  const existingSongId = await findExistingSongId(userId, item);
  const previous = existingSongId
    ? await prisma.albumLog.findUnique({ where: { id: existingSongId }, select: { status: true, mbid: true } })
    : await prisma.albumLog.findUnique({
        where: { userId_mbid: { userId, mbid: item.mbid } },
        select: { status: true, mbid: true },
      });

  if (existingSongId) {
    await prisma.albumLog.update({
      where: { id: existingSongId },
      data: { status, coverUrl: item.coverUrl ?? undefined },
    });
  } else {
    await prisma.albumLog.upsert({
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
    });
  }

  // The stored row may use a different id than the card that was tapped.
  const syncMbid = previous?.mbid ?? item.mbid;
  queuePlaylistSync(userId, { mbid: syncMbid, itemType: item.itemType }, previous?.status === WANT, status === WANT);

  refresh();
}

/** Rate an item 0–10. Rating something implies you listened to it. */
export async function rateItem(item: LibraryItemInput, rating: number) {
  const userId = await requireUserId();
  // Ratings are 0–10 to one decimal. Rounded here so a stray float from the client
  // can't store 7.300000000000001.
  const clamped = Math.round(Math.min(10, Math.max(0, rating)) * 10) / 10;

  const existingSongId = await findExistingSongId(userId, item);
  const previous = existingSongId
    ? await prisma.albumLog.findUnique({ where: { id: existingSongId }, select: { status: true, mbid: true } })
    : await prisma.albumLog.findUnique({
        where: { userId_mbid: { userId, mbid: item.mbid } },
        select: { status: true, mbid: true },
      });

  if (existingSongId) {
    await prisma.albumLog.update({
      where: { id: existingSongId },
      data: { rating: clamped, status: "LISTENED", coverUrl: item.coverUrl ?? undefined },
    });
  } else {
    await prisma.albumLog.upsert({
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
    });
  }

  // Rating always lands on Listened, so anything that was wanted leaves the playlist.
  const syncMbid = previous?.mbid ?? item.mbid;
  queuePlaylistSync(userId, { mbid: syncMbid, itemType: item.itemType }, previous?.status === WANT, false);

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

  const existing = await prisma.albumLog.findFirst({
    where: song
      ? { userId, OR: [{ mbid }, { itemType: "SONG", albumTitle: song.title, artistName: song.artistName }] }
      : { userId, mbid },
    select: { status: true, mbid: true, itemType: true },
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
    queuePlaylistSync(userId, { mbid: existing.mbid, itemType: existing.itemType }, existing.status === WANT, false);
  }

  refresh();
}
