import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { saveReview, deleteReview, isVisibility, MAX_BODY } from "@/lib/reviews";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";

/**
 * Write, replace or remove your review of an album.
 *
 * Reading them is not here — reviews come back with the album, because a page
 * that shows a record should not need a second round trip to show what people
 * said about it.
 */
export const PUT = authed(async (req, userId) => {
  // Writes are cheap but they are also user-generated text on a public
  // surface. A limit here is the difference between someone being rude and
  // someone flooding every album page.
  const limit = await rateLimit(clientKey(req, "review"), 30, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  let body: { mbid?: string; body?: string; visibility?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const visibility = body.visibility ?? "PRIVATE";
  if (!body.mbid || typeof body.body !== "string" || !isVisibility(visibility)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await saveReview({
    userId,
    mbid: body.mbid,
    body: body.body,
    visibility,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, maxLength: MAX_BODY },
      { status: result.error === "not_in_library" ? 409 : 422 }
    );
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = authed(async (req, userId) => {
  const mbid = new URL(req.url).searchParams.get("mbid");
  if (!mbid) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json({ deleted: await deleteReview(userId, mbid) });
});
