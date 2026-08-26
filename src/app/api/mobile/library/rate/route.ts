import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { parseLibraryItem, rateItemFor } from "@/lib/library-write";
import { prisma } from "@/lib/prisma";

/**
 * Rate an item 0–10. Rating implies listening, so this also moves it to Listened.
 *
 * The comparison ladder is deliberately not reachable from here yet. It is not a
 * different endpoint for the same thing — it is a different interaction, several
 * screens of it, and wiring the app's slider into `rateByNumber` would start
 * building a ladder for someone who never turned the feature on.
 */
export const POST = authed(async (req, userId) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const item = parseLibraryItem(body);
  const rating = body.rating;
  if (!item || typeof rating !== "number" || Number.isNaN(rating)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const stored = await rateItemFor(userId, item, rating);

  // Both fields are read back rather than echoed. The rating is the clamped and
  // rounded value, so the app never shows a number the database disagrees with —
  // and for a song the id may not be the one that was sent, because the write
  // lands on whatever row already holds that title and artist.
  const row = await prisma.albumLog.findFirst({
    where:
      item.itemType === "SONG"
        ? { userId, itemType: "SONG", albumTitle: item.title, artistName: item.artistName }
        : { userId, mbid: item.mbid },
    select: { mbid: true, status: true, rating: true },
  });

  return NextResponse.json(row ?? { mbid: item.mbid, status: "LISTENED", rating: stored });
});
