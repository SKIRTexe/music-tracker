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

function refresh() {
  revalidatePath("/library");
  revalidatePath("/");
}

/** Add an item to the library, or move an existing one to a new status. */
export async function saveToLibrary(item: LibraryItemInput, status: string) {
  const userId = await requireUserId();

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
  const clamped = Math.min(10, Math.max(0, rating));

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

export async function removeFromLibrary(mbid: string) {
  const userId = await requireUserId();

  await prisma.albumLog.deleteMany({
    where: { userId, mbid },
  });

  refresh();
}
