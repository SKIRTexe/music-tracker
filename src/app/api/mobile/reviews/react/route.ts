import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { react } from "@/lib/reviews";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";

/**
 * Like or dislike a review. Sending the reaction you already hold removes it,
 * so one endpoint covers press and un-press.
 *
 * Refuses anything the caller cannot read: reacting to a review is only
 * possible for people it was shared with.
 */
export const POST = authed(async (req, userId) => {
  const limit = await rateLimit(clientKey(req, "react"), 120, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  let body: { reviewId?: string; value?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.reviewId || (body.value !== 1 && body.value !== -1)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await react({ reviewId: body.reviewId, userId, value: body.value });
  if (!result) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  return NextResponse.json(result);
});
