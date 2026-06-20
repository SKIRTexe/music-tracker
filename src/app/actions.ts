"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function addToLibrary(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const mbid = formData.get("mbid") as string;
  const albumTitle = formData.get("albumTitle") as string;
  const artistName = formData.get("artistName") as string;
  const status = formData.get("status") as string;
  const releaseYearStr = formData.get("releaseYear") as string | null;
  const releaseYear = releaseYearStr ? parseInt(releaseYearStr) : null;

  await prisma.albumLog.upsert({
    where: { userId_mbid: { userId: session.user.id, mbid } },
    create: { userId: session.user.id, mbid, albumTitle, artistName, status, releaseYear },
    update: { status },
  });

  revalidatePath("/library");
}

export async function updateStatus(mbid: string, status: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await prisma.albumLog.update({
    where: { userId_mbid: { userId: session.user.id, mbid } },
    data: { status },
  });

  revalidatePath("/library");
}

export async function addAlbumToLibrary(
  mbid: string,
  albumTitle: string,
  artistName: string,
  status: string,
  releaseYear?: number,
  coverUrl?: string,
  artistMbid?: string
) {
  const session = await auth();
  if (!session?.user?.id) return;

  await prisma.albumLog.upsert({
    where: { userId_mbid: { userId: session.user.id, mbid } },
    create: {
      userId: session.user.id,
      mbid,
      albumTitle,
      artistName,
      status,
      releaseYear: releaseYear ?? null,
      coverUrl: coverUrl ?? null,
      artistMbid: artistMbid ?? null,
    },
    update: { status, coverUrl: coverUrl ?? undefined, artistMbid: artistMbid ?? undefined },
  });

  revalidatePath("/library");
}

export async function rateAlbumAction(
  mbid: string,
  albumTitle: string,
  artistName: string,
  rating: number,
  releaseYear?: number,
  coverUrl?: string,
  artistMbid?: string
) {
  const session = await auth();
  if (!session?.user?.id) return;

  await prisma.albumLog.upsert({
    where: { userId_mbid: { userId: session.user.id, mbid } },
    create: {
      userId: session.user.id,
      mbid,
      albumTitle,
      artistName,
      status: "LISTENED",
      rating,
      releaseYear: releaseYear ?? null,
      coverUrl: coverUrl ?? null,
      artistMbid: artistMbid ?? null,
    },
    update: { rating, status: "LISTENED", coverUrl: coverUrl ?? undefined, artistMbid: artistMbid ?? undefined },
  });

  revalidatePath("/library");
}

export async function removeFromLibrary(mbid: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await prisma.albumLog.delete({
    where: { userId_mbid: { userId: session.user.id, mbid } },
  });

  revalidatePath("/library");
}

export async function toggleFavoriteGenre(tag: string) {
  const session = await auth();
  if (!session?.user?.id) return;

  const existing = await prisma.favoriteGenre.findUnique({
    where: { userId_tag: { userId: session.user.id, tag } },
  });

  if (existing) {
    await prisma.favoriteGenre.delete({
      where: { userId_tag: { userId: session.user.id, tag } },
    });
  } else {
    await prisma.favoriteGenre.create({
      data: { userId: session.user.id, tag },
    });
  }

  revalidatePath("/");
}
