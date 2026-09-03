import { NextResponse } from "next/server";
import { authed, userIdFromRequest } from "@/lib/mobile-auth";
import { repliesFor, addReply, deleteReply } from "@/lib/reviews";
import { clientKey, rateLimit, memoryLimit, tooMany } from "@/lib/rate-limit";

/** Replies to one review. Refuses if the caller cannot read the review. */
export const GET = async (req: Request) => {
  const gate = memoryLimit(clientKey(req, "replies"), 120, 60_000);
  if (!gate.ok) return tooMany(gate.retryAfter);

  const reviewId = new URL(req.url).searchParams.get("reviewId");
  if (!reviewId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const viewerId = await userIdFromRequest(req);
  const replies = await repliesFor(reviewId, viewerId);
  if (replies === null) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  return NextResponse.json({ replies });
};

export const POST = authed(async (req, userId) => {
  // Tighter than reactions: this is text other people read.
  const limit = await rateLimit(clientKey(req, "reply"), 20, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  let body: { reviewId?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.reviewId || typeof body.body !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await addReply({ reviewId: body.reviewId, userId, body: body.body });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "not_allowed" ? 403 : 422 }
    );
  }
  return NextResponse.json({ reply: result });
});

/** Your own reply, or any reply on your own review. */
export const DELETE = authed(async (req, userId) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ok = await deleteReply(id, userId);
  return NextResponse.json({ deleted: ok }, { status: ok ? 200 : 403 });
});
