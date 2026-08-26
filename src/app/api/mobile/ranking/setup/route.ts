import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { parseLibraryItem } from "@/lib/library-write";
import { comparisonSetupFor } from "@/lib/ranking-flow";

/**
 * Every candidate the comparison flow could ask about, in one response.
 *
 * Sent up front so the binary search runs entirely on the device: answering a
 * question costs no request, which is what makes the flow feel like a quiz rather
 * than a form. A stale list is harmless — the final slot is re-resolved and
 * re-scored server-side, so it cannot corrupt the ladder.
 */
export const POST = authed(async (req, userId) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const item = body ? parseLibraryItem(body) : null;
  if (!item) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  return NextResponse.json(await comparisonSetupFor(userId, item));
});
