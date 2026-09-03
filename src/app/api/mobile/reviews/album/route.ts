import { NextResponse } from "next/server";
import { userIdFromRequest } from "@/lib/mobile-auth";
import { reviewsForAlbum, isReviewSort } from "@/lib/reviews";
import { clientKey, memoryLimit, tooMany } from "@/lib/rate-limit";

/**
 * Every review of one album, for the full-page view.
 *
 * The album endpoint already returns a first page of these; this exists so the
 * dedicated screen can ask for more without also refetching the tracklist,
 * the popularity lookup and the community average.
 */
export const GET = async (req: Request) => {
  const gate = memoryLimit(clientKey(req, "album-reviews"), 90, 60_000);
  if (!gate.ok) return tooMany(gate.retryAfter);

  const params = new URL(req.url).searchParams;
  const mbid = params.get("mbid");
  if (!mbid) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const requested = params.get("sort") ?? "popular";
  const sort = isReviewSort(requested) ? requested : "popular";

  const viewerId = await userIdFromRequest(req);
  return NextResponse.json({
    reviews: await reviewsForAlbum(mbid, viewerId, 100, sort),
    sort,
  });
};
