import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { rankingModeFor, setRankingEnabledFor } from "@/lib/ranking-flow";
import { RANKING_MIN_RATED } from "@/lib/ranking";

/**
 * Whether comparison rating applies right now, per item type.
 *
 * Albums and songs are separate ladders — "is Kid A better than Karma Police" has
 * no honest answer — so this is asked per type and the two can be in different
 * states: enabled with enough albums to compare, but not yet enough songs.
 */
export const GET = authed(async (req, userId) => {
  const itemType = new URL(req.url).searchParams.get("itemType") ?? "ALBUM";
  const mode = await rankingModeFor(userId, itemType);
  return NextResponse.json({ ...mode, minRated: RANKING_MIN_RATED });
});

/**
 * Turn it on or off.
 *
 * Enabling re-seeds the ladder from current ratings, so slider ratings made while
 * it was off are absorbed rather than thrown away.
 */
export const PUT = authed(async (req, userId) => {
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  await setRankingEnabledFor(userId, body.enabled);
  return NextResponse.json({ enabled: body.enabled });
});
