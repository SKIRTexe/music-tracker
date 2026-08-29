import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Bearer-token auth for the iOS client.
 *
 * The website signs in with NextAuth, whose session is an encrypted cookie. A
 * native app has no cookie jar worth relying on and no browser to run the OAuth
 * redirect in, so it gets its own token instead: the same credentials, checked
 * against the same `User.password` hash, exchanged for a JWT it sends as
 * `Authorization: Bearer`.
 *
 * Signed with `AUTH_SECRET` — the same secret NextAuth uses — because there is no
 * reason for a second one, and a second one is a second thing to forget to set on
 * Vercel. The tokens are *not* interchangeable with NextAuth's: different
 * algorithm and different claims, so neither will validate the other's. That is
 * intended. This is a parallel path, not a way into the session.
 *
 * Long-lived (90 days) on purpose. A native app that logs you out every fortnight
 * is a native app you stop opening, and the token carries nothing but a user id
 * and the token version it was minted at.
 *
 * That version is what makes a 90-day token safe to hand out. The token is
 * stateless, so without it there was no way to end a session early: a stolen one
 * stayed valid for three months, and the only lever was rotating `AUTH_SECRET`,
 * which signs out every user on the website too. Bumping `User.tokenVersion`
 * invalidates one person's tokens and nobody else's.
 */

const ISSUER = "recordcrate";
const AUDIENCE = "recordcrate-ios";
const TTL = "90d";

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  // Guarded loudly rather than defaulted: a signing key that quietly falls back to
  // a constant would accept every forged token ever minted against that constant.
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

export async function issueToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  return new SignJWT({ ver: user?.tokenVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret());
}

/** The user id a request carries, or null if it carries none that verifies. */
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;

  try {
    const { payload } = await jwtVerify(header.slice(7).trim(), secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string") return null;

    // The signature only proves the token was minted here, not that it is still
    // wanted. One indexed lookup by primary key is the price of being able to
    // end a session at all.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });
    // A deleted account fails here too: no row, no user id.
    if (!user) return null;
    // Tokens minted before this predate the version claim; treating a missing
    // claim as 0 keeps every existing sign-in working rather than logging the
    // whole userbase out on deploy.
    const version = typeof payload.ver === "number" ? payload.ver : 0;
    if (version !== user.tokenVersion) return null;

    return payload.sub;
  } catch {
    // Expired, forged, or signed with a rotated secret — all the same answer here.
    return null;
  }
}

/**
 * End every mobile session this user has.
 *
 * Used by "sign out everywhere" and by account deletion — though deletion no
 * longer strictly needs it, since a token whose subject has no row is rejected
 * anyway. Belt and braces: the two paths should not both have to be right.
 */
export async function revokeTokens(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

/** Check a login. Returns the user, or null for both "no such email" and "wrong
 *  password" — distinguishing them tells an attacker which addresses exist. */
export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, password: true },
  });
  if (!user?.password) return null;
  if (!(await bcrypt.compare(password, user.password))) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Turn a thrown error into something a 500 can carry.
 *
 * The code only — `P1001`, `P2024` — never the message, which can contain a
 * connection string. Without it a failure is an opaque 500 and the only way to
 * tell "cannot reach the database" from "the pool is exhausted" is to guess,
 * which is exactly the position this left us in.
 */
export function failureCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "unknown";
}

export type Handler = (req: Request, userId: string) => Promise<Response>;

/**
 * Wraps a route handler so it only runs with a verified user id.
 *
 * The server actions redirect to /login when signed out. A native client cannot
 * follow a redirect to an HTML page and would see a 200 full of markup, so this
 * answers 401 and lets the app decide to show its own sign-in.
 */
export function authed(handler: Handler) {
  return async (req: Request): Promise<Response> => {
    const userId = await userIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    try {
      return await handler(req, userId);
    } catch (err) {
      console.error("mobile api:", err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: "server_error", code: failureCode(err) },
        { status: 500 }
      );
    }
  };
}

// ── Spotify linking ───────────────────────────────────────────────────────────

/**
 * The OAuth `state` for a link started from the app.
 *
 * The website's flow proves the callback belongs to the browser that started it
 * with an httpOnly cookie. The app has no cookie jar in that browser — the
 * consent screen opens in a system web view — so the state itself carries the
 * proof: a short-lived JWT naming the user, signed with the same secret. An
 * attacker cannot mint one, which is the property the cookie was providing.
 *
 * Ten minutes, because that is how long someone takes to log into Spotify and
 * press Agree, and a link token is a bearer credential for attaching an account.
 *
 * A separate audience from the session token, so a stolen link state cannot be
 * replayed as a session and a session token cannot be spent as a link state.
 */
const LINK_AUDIENCE = "recordcrate-ios-link";

export async function issueLinkState(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(LINK_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

/** The user a link state names, or null if it isn't one we issued. */
export async function verifyLinkState(state: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(state, secret(), {
      issuer: ISSUER,
      audience: LINK_AUDIENCE,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
