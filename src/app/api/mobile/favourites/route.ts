import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { toggleFavourite, MAX_FAVOURITES } from "@/lib/collections";

/**
 * Mark a track as a favourite on an album, or unmark it. One endpoint, because
 * the same tap does both.
 *
 * The whole list comes back rather than an acknowledgement, so the tracklist can
 * redraw every heart from one answer instead of guessing which ones changed when
 * positions were renumbered.
 */
export const POST = authed(async (req, userId) => {
  let body: { mbid?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.mbid || !body.title) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await toggleFavourite({ userId, mbid: body.mbid, title: body.title });
  if ("error" in result) {
    return NextResponse.json({ error: result.error, max: MAX_FAVOURITES }, { status: 409 });
  }
  return NextResponse.json(result);
});
