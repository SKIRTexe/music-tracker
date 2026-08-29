import { NextResponse } from "next/server";
import { authed, failureCode } from "@/lib/mobile-auth";
import { revokeAppleAccess } from "@/lib/apple-auth";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * Delete the signed-in account and everything attached to it.
 *
 * Required by App Store review: an app that lets you create an account has to
 * let you delete it from inside the app, not by emailing someone. It is also
 * the right behaviour independently of that.
 *
 * The delete is a single row. Every table that references a user does so with
 * `onDelete: Cascade`, so the library, the events, the reviews, the playlist
 * rows, the sessions and the linked Spotify and Apple accounts all go with it —
 * one statement, inside the database, with no list here to fall out of date as
 * tables are added. What is deliberately *not* deleted is the `MbCache` and
 * `ArtistMeta` rows: those are catalogue facts about records, not about people,
 * and hold nothing that identifies anyone.
 */
export const DELETE = authed(async (req, userId) => {
  const limit = await rateLimit(clientKey(req, "delete-account"), 5, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  try {
    // Before the row goes, while the refresh token is still readable. Apple
    // requires that deleting an account also revokes the Sign in with Apple
    // grant, otherwise the app keeps appearing in the user's Apple ID settings
    // as something they are still signed in to.
    await revokeAppleAccess(userId).catch(() => {});

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("mobile delete account:", failureCode(err));
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
});
