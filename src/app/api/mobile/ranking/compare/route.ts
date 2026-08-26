import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { parseLibraryItem } from "@/lib/library-write";
import { rateByComparisonFor } from "@/lib/ranking-flow";
import { BUCKETS, type Bucket } from "@/lib/ranking";

/**
 * Place an item where the comparisons landed. Returns the derived score.
 *
 * `tiedWithId` + `tieSide` mark a "too close to call" answer that the follow-up
 * questions resolved to one side of that row. The item is anchored just above or
 * just below it — close, but not the same number, because a tie is a claim about
 * the size of a difference rather than about there being none.
 */
export const POST = authed(async (req, userId) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const item = body ? parseLibraryItem(body) : null;
  const bucket = body?.bucket;
  const insertIndex = body?.insertIndex;
  const tiedWithId = typeof body?.tiedWithId === "string" ? body.tiedWithId : undefined;
  const tieSide =
    body?.tieSide === "ABOVE" || body?.tieSide === "BELOW" ? body.tieSide : undefined;

  if (
    !item ||
    typeof bucket !== "string" ||
    !(BUCKETS as readonly string[]).includes(bucket) ||
    typeof insertIndex !== "number" ||
    !Number.isInteger(insertIndex) ||
    insertIndex < 0
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const rating = await rateByComparisonFor(
    userId, item, bucket as Bucket, insertIndex, tiedWithId, tieSide
  );
  return NextResponse.json({ rating });
});
