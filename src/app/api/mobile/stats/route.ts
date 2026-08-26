import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/mobile-auth";
import { getDashboard, type Grain } from "@/lib/stats";
import { STATS_MODULES } from "@/lib/stats-modules";

/**
 * The whole dashboard in one call, as `/stats` gets it.
 *
 * The range scopes the Activity series only, which is why it is a parameter of
 * this request rather than something the client filters afterwards: everything
 * else is a snapshot of the library as it stands and has no time dimension to
 * filter on. The grain is chosen here rather than sent, so the app cannot ask for
 * 365 daily buckets and render 365 columns four pixels wide.
 */
const RANGES: Record<string, { days: number; grain: Grain; label: string }> = {
  "30": { days: 30, grain: "day", label: "30 days" },
  "90": { days: 90, grain: "day", label: "90 days" },
  "365": { days: 365, grain: "month", label: "1 year" },
  all: { days: 36_500, grain: "month", label: "All time" },
};

export const GET = authed(async (req, userId) => {
  const requested = new URL(req.url).searchParams.get("range") ?? "90";
  const range = RANGES[requested] ?? RANGES["90"];

  const [dashboard, user] = await Promise.all([
    getDashboard(userId, { days: range.days, grain: range.grain }),
    prisma.user.findUnique({ where: { id: userId }, select: { statsHidden: true } }),
  ]);

  // The stored list is the *hidden* one, so a module added later shows up for
  // everyone by default rather than being invisible to every existing account.
  // The app applies it the same way the page does; sending the registry too means
  // a module added here doesn't need an app release to appear.
  return NextResponse.json({
    ...dashboard,
    range: { key: requested in RANGES ? requested : "90", label: range.label, grain: range.grain },
    hidden: user?.statsHidden ?? [],
    modules: STATS_MODULES,
  });
});
