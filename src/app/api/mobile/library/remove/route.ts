import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { removeFromLibraryFor } from "@/lib/library-write";

/**
 * Remove an item.
 *
 * A POST rather than a DELETE on the item's URL, because removing a song needs its
 * title and artist as well as its id: the row may be stored under a different
 * track id for the same song, and deleting by id alone would report success and
 * change nothing.
 */
export const POST = authed(async (req, userId) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const mbid = body?.mbid;
  if (typeof mbid !== "string" || !mbid) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const title = body?.title;
  const artistName = body?.artistName;
  const song =
    body?.itemType === "SONG" && typeof title === "string" && typeof artistName === "string"
      ? { title, artistName }
      : undefined;

  await removeFromLibraryFor(userId, mbid, song);
  return NextResponse.json({ ok: true });
});
