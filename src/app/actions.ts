"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * The row a song should write to, if one already exists under a different id.
 *
 * MusicBrainz has a separate recording per release, so the same studio song can
 * carry many ids — song search and an album's tracklist routinely disagree about
 * which one to use. Keying on id alone would put two "Karma Police" rows in the
 * library, so a song already saved under any id is updated in place.
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

/** Add an item to the library, or move an existing one to a new status. */
export async function saveToLibrary(item: LibraryItemInput, status: string) {
  const userId = await requireUserId();

  const existingSongId = await findExistingSongId(userId, item);
  if (existingSongId) {
    await prisma.albumLog.update({
      where: { id: existingSongId },
      data: { status, coverUrl: item.coverUrl ?? undefined },
    });
    refresh();
    return;
  }

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

  refresh();
}

/** Rate an item 0–10. Rating something implies you listened to it. */
export async function rateItem(item: LibraryItemInput, rating: number) {
  const userId = await requireUserId();
  // Ratings are 0–10 to one decimal. Rounded here so a stray float from the client
  // can't store 7.300000000000001.
  const clamped = Math.round(Math.min(10, Math.max(0, rating)) * 10) / 10;

  const existingSongId = await findExistingSongId(userId, item);
  if (existingSongId) {
    await prisma.albumLog.update({
      where: { id: existingSongId },
      data: { rating: clamped, status: "LISTENED", coverUrl: item.coverUrl ?? undefined },
    });
    refresh();
    return;
  }

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

  refresh();
}

/**
 * Remove by id. For songs, also match on title+artist: the row may have been saved
 * under one of MusicBrainz's other recording ids for the same song, in which case
 * deleting by id alone would silently do nothing.
 */
export async function removeFromLibrary(
  mbid: string,
  song?: { title: string; artistName: string }
) {
  const userId = await requireUserId();

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

  refresh();
}
