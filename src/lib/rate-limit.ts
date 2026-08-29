import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Rate limiting for the endpoints where abuse is cheap and damaging.
 *
 * There was none at all before this, which is not a theoretical gap: an account
 * could be created on production with one unauthenticated request, and the
 * sign-in endpoint would check passwords as fast as anyone cared to send them.
 *
 * Two limiters, because the two kinds of endpoint have opposite economics.
 *
 * `rateLimit` is backed by the database. That costs a round trip, which is only
 * worth paying where a single request is expensive — checking a bcrypt hash,
 * creating a row, deleting an account. It has to be in the database because the
 * API runs on serverless functions: a counter in module scope is per-instance
 * and dies with the instance, so several instances each let the whole quota
 * through and a cold start forgives everyone. That is the appearance of a rate
 * limit rather than one.
 *
 * `memoryLimit` is the opposite trade. Catalogue reads are frequent and cheap,
 * and a database round trip on every search would cost more than the abuse it
 * prevents — especially given this app has already exhausted its connection
 * pool once. It is per-instance and leaky by construction; it exists to stop
 * one client hammering the Spotify quota, not to be exact.
 */

export interface RateResult {
  ok: boolean;
  /** Seconds until the window resets. Only meaningful when `ok` is false. */
  retryAfter: number;
}

/**
 * Who to count against.
 *
 * Vercel sets `x-forwarded-for`, and the client cannot forge the value the
 * proxy appends — but it *can* prepend to it, so only the last hop is
 * trustworthy... except Vercel puts the real client first and does not append.
 * `x-real-ip` is set by the platform and not client-controllable, so it is
 * preferred where present.
 *
 * A request with no usable address falls into one shared bucket rather than
 * being waved through: an attacker who can strip both headers should get the
 * strictest treatment, not the loosest.
 */
export function clientKey(req: Request, scope: string): string {
  const real = req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const who = real || forwarded || "unknown";
  return `${scope}:${who}`;
}

/**
 * Count a hit against `key`, in one statement.
 *
 * Read-then-write would let two concurrent requests both read the same count
 * and both decide they were under the limit, which is precisely the situation
 * a brute-force attempt creates. The upsert increments inside an active window
 * and restarts the count outside one, atomically, so the row is never wrong.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<RateResult> {
  const now = new Date();
  const resets = new Date(now.getTime() + windowMs);

  try {
    const rows = await prisma.$queryRaw<{ hits: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "hits", "resetAt")
      VALUES (${key}, 1, ${resets})
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN "RateLimit"."resetAt" > ${now}
                      THEN "RateLimit"."hits" + 1 ELSE 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" > ${now}
                         THEN "RateLimit"."resetAt" ELSE ${resets} END
      RETURNING "hits", "resetAt"
    `;

    const row = rows[0];
    if (!row) return { ok: true, retryAfter: 0 };

    const retryAfter = Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000));
    return { ok: row.hits <= max, retryAfter };
  } catch (err) {
    // Fail open, loudly. A limiter that takes the whole API down when the
    // database hiccups is a worse outage than the abuse it was guarding.
    console.error("rate limit:", err instanceof Error ? err.message : err);
    return { ok: true, retryAfter: 0 };
  }
}

/** The 429 to send when a limit is hit. */
export function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

// ── In-memory, for cheap and frequent endpoints ──────────────────────────────

const buckets = new Map<string, { hits: number; resetAt: number }>();

/**
 * Per-instance counter. Leaky by design — see the note at the top.
 *
 * The map is swept whenever it grows past a few thousand keys, so a long-lived
 * instance under a spray of distinct addresses cannot grow it without bound.
 */
export function memoryLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();

  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }

  const found = buckets.get(key);
  if (!found || found.resetAt <= now) {
    buckets.set(key, { hits: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  found.hits += 1;
  return {
    ok: found.hits <= max,
    retryAfter: Math.max(1, Math.ceil((found.resetAt - now) / 1000)),
  };
}
