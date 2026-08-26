import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/mobile-auth";
import { parseLibraryItem, saveToLibraryFor } from "@/lib/library-write";
import { isStatus } from "@/lib/statuses";

/**
 * The whole library, newest first.
 *
 * Unpaged on purpose. The filters and the five sorts are the point of the screen
 * and every one of them is a property of the *whole* library, so a paged client
 * would have to fetch all of it to sort by rating anyway — and then hold two
 * inconsistent ideas of what it has. These rows are small; a thousand of them is
 * a couple of hundred kilobytes once, cached by the client thereafter.
 */
export const GET = authed(async (_req, userId) => {
  const entries = await prisma.albumLog.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    select: {
      id: true,
      mbid: true,
      itemType: true,
      albumTitle: true,
      artistName: true,
      parentAlbum: true,
      releaseYear: true,
      status: true,
      rating: true,
      coverUrl: true,
      addedAt: true,
    },
  });

  return NextResponse.json({ entries });
});

/** Add an item, or move one already saved to a different status. */
export const POST = authed(async (req, userId) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const item = parseLibraryItem(body);
  const status = body.status;
  if (!item || typeof status !== "string" || !isStatus(status)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  await saveToLibraryFor(userId, item, status);

  // Read back rather than echoing the request: for a song, the write may have
  // landed on a row saved under a different id, and the app needs the id its
  // library actually holds.
  const row = await prisma.albumLog.findFirst({
    where:
      item.itemType === "SONG"
        ? { userId, itemType: "SONG", albumTitle: item.title, artistName: item.artistName }
        : { userId, mbid: item.mbid },
    select: { mbid: true, status: true, rating: true },
  });

  return NextResponse.json(row ?? { mbid: item.mbid, status, rating: null });
});
