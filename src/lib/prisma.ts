import { PrismaClient } from "@prisma/client";

/**
 * The smallest client pool that survives concurrent requests.
 *
 * `connection_limit=1` is the value Supabase's serverless guide recommends, and
 * it is wrong for how this actually runs. Vercel serves several concurrent
 * invocations from one instance, so a single connection means the second
 * simultaneous query waits out `pool_timeout` and dies with **P2024** — which
 * surfaced as sign-in failing with a bare 500 after exactly 10 seconds while
 * the database itself answered the same query in under 100ms from elsewhere.
 *
 * Raising it is safe precisely because `pgbouncer=true` is set: Supabase's
 * transaction pooler is doing the real multiplexing, and Prisma's pool is only
 * client-side concurrency in front of it. Five is enough to absorb a burst
 * without a single instance hoarding connections from the shared pooler.
 */
const MIN_POOL = 5;

/**
 * Applied here rather than to the environment variable, because the right value
 * is a property of the runtime shape — serverless behind a transaction pooler —
 * not something each deployment should have to remember to set. Fixing it in one
 * place also means production cannot drift back to a value that breaks sign-in.
 */
function connectionUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const limit = Number(url.searchParams.get("connection_limit"));
    if (!Number.isFinite(limit) || limit < MIN_POOL) {
      url.searchParams.set("connection_limit", String(MIN_POOL));
    }
    return url.toString();
  } catch {
    // An unparseable URL is Prisma's problem to report, not ours to mangle.
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query"],
    datasources: { db: { url: connectionUrl() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
