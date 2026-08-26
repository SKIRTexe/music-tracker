import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { parseLibraryItem } from "@/lib/library-write";
import { rateByNumberFor } from "@/lib/ranking-flow";

/**
 * Type a score while ranking is on.
 *
 * The number is kept exactly, but it also *moves* the item to the matching place
 * in the ladder — a direct write would leave a score its position disagrees with,
 * which is the one thing the model exists to prevent. The returned rating is
 * therefore what to display, not what was sent.
 */
export const POST = authed(async (req, userId) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const item = body ? parseLibraryItem(body) : null;
  const score = body?.score;

  if (!item || typeof score !== "number" || Number.isNaN(score)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  return NextResponse.json({ rating: await rateByNumberFor(userId, item, score) });
});
