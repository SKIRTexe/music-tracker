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
 * is a native app you stop opening, and the token carries nothing but a user id.
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
  return new SignJWT({})
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
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    // Expired, forged, or signed with a rotated secret — all the same answer here.
    return null;
  }
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
      return NextResponse.json({ error: "server_error" }, { status: 500 });
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
