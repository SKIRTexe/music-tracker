import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import {
  profileByHandle, canViewLibrary, friendState,
  validateHandle, normaliseHandle, cleanInitials,
} from "@/lib/social";
import { reviewsForUser } from "@/lib/reviews";

/**
 * A profile: your own, or someone else's by `?handle=`.
 *
 * Ratings come back only when `canViewLibrary` allows it — the same single gate
 * the website uses, rather than a second copy of the rule that could disagree
 * with it.
 */
export const GET = authed(async (req, userId) => {
  const handle = new URL(req.url).searchParams.get("handle");

  if (!handle) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, handle: true, name: true, bio: true, initials: true, isPublic: true },
    });
    return NextResponse.json({ profile: me, isSelf: true, state: "self", rated: [] });
  }

  const profile = await profileByHandle(handle);
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [visible, state] = await Promise.all([
    canViewLibrary(userId, profile.id),
    friendState(userId, profile.id),
  ]);

  const SHELF = {
    mbid: true, itemType: true, albumTitle: true,
    artistName: true, coverUrl: true, rating: true,
  } as const;

  // All three lists in one request: the profile is three swipeable pages, and
  // fetching each as it is swiped to would make the second and third feel slower
  // than the first for no reason.
  const [rated, wantToListen, reviews] = visible
    ? await Promise.all([
        prisma.albumLog.findMany({
          where: { userId: profile.id, rating: { not: null } },
          orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
          take: 60,
          select: SHELF,
        }),
        prisma.albumLog.findMany({
          where: { userId: profile.id, status: "WANT" },
          orderBy: { addedAt: "desc" },
          take: 60,
          select: SHELF,
        }),
        reviewsForUser(profile.id, userId),
      ])
    : [[], [], []];

  return NextResponse.json({
    profile, isSelf: state === "self", state, visible,
    rated, wantToListen, reviews,
  });
});

/** Update your own profile. The handle is the only field that can be refused. */
export const PATCH = authed(async (req, userId) => {
  let body: { handle?: string; name?: string; bio?: string; initials?: string; isPublic?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.handle !== undefined) {
    const handle = normaliseHandle(body.handle);
    const problem = await validateHandle(handle, userId);
    if (problem) return NextResponse.json({ error: problem }, { status: 422 });
    data.handle = handle;
  }
  if (body.name !== undefined) data.name = body.name.trim() || null;
  if (body.bio !== undefined) data.bio = body.bio.trim() || null;
  if (body.initials !== undefined) data.initials = cleanInitials(body.initials) || null;
  if (body.isPublic !== undefined) data.isPublic = !!body.isPublic;

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, handle: true, name: true, bio: true, initials: true, isPublic: true },
  });
  return NextResponse.json({ profile: updated });
});
