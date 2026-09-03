import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { reviewsFeed } from "@/lib/reviews";

/**
 * Two lists: friends' reviews, and popular public ones.
 *
 * Deliberately not merged — a friend's review matters because of who wrote it,
 * a popular one because of how it landed, and one blended score would bury the
 * former under the latter.
 */
export const GET = authed(async (_req, userId) => {
  return NextResponse.json(await reviewsFeed(userId));
});
