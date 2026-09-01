import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import {
  friendsOf, pendingRequests, requestFriend, acceptFriend, removeFriend, friendActivity,
} from "@/lib/social";

/** Your friends, who is waiting on you, and what they have rated lately. */
export const GET = authed(async (_req, userId) => {
  const [friends, requests, activity] = await Promise.all([
    friendsOf(userId),
    pendingRequests(userId),
    friendActivity(userId),
  ]);
  return NextResponse.json({ friends, requests, activity });
});

/**
 * Act on one person: add, accept, or remove.
 *
 * One endpoint with an action rather than three, because the three share their
 * whole shape and the app calls them from the same button. `remove` covers
 * declining, unfriending and withdrawing — all the same row.
 */
export const POST = authed(async (req, userId) => {
  let body: { action?: string; personId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { action, personId } = body;
  if (!personId || !action) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  switch (action) {
    case "add":
      return NextResponse.json({ outcome: await requestFriend(userId, personId) });
    case "accept":
      return NextResponse.json({ ok: await acceptFriend(userId, personId) });
    case "remove":
      return NextResponse.json({ ok: await removeFriend(userId, personId) });
    default:
      return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }
});
