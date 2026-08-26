import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/mobile-auth";

/**
 * Who the token belongs to. The app calls this on launch to decide whether a
 * stored token is still good — a 401 here is what sends it to the sign-in screen,
 * rather than discovering the problem on the first real request.
 */
export const GET = authed(async (_req, userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, rankingEnabled: true },
  });
  // The token verified but the row is gone — a deleted account. Same answer as an
  // invalid token, because the app should do the same thing.
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const counts = await prisma.albumLog.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });

  return NextResponse.json({
    ...user,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
});
