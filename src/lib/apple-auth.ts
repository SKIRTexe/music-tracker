import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import { prisma } from "@/lib/prisma";

/**
 * Sign in with Apple.
 *
 * The app asks Apple for an identity token and hands it here. That token is a
 * JWT signed by Apple, so verifying it needs no secret of ours at all — only
 * Apple's public keys. Which is the whole appeal: a user can sign in without
 * this service ever seeing a password.
 *
 * **What must never be skipped.** The token is public — it travels through the
 * client. Trusting its `sub` without verifying the signature, the issuer *and*
 * the audience would let anyone sign in as anyone: an identity token minted for
 * a different app is still a perfectly valid Apple token, so checking only the
 * signature authenticates the wrong thing. All three are checked below.
 *
 * **Two audiences.** The app's tokens carry the bundle id; Sign in with Apple on
 * the web carries the Services ID, which Apple requires to be a *different*
 * identifier. Both are accepted so one account works from either.
 */

const ISSUER = "https://appleid.apple.com";

/**
 * Apple's public keys, fetched and cached by `jose` and re-fetched when a token
 * arrives signed by a key id it has not seen. Apple rotates these without
 * notice, so anything that pinned them would fail on their schedule.
 */
const keys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function audiences(): string[] {
  return [process.env.APPLE_BUNDLE_ID, process.env.APPLE_SERVICES_ID].filter(
    (v): v is string => !!v
  );
}

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** Apple's relay address rather than the user's own. */
  isPrivateEmail: boolean;
}

/** Verify an identity token and pull out who it says the user is. */
export async function verifyIdentityToken(token: string): Promise<AppleIdentity | null> {
  const audience = audiences();
  if (audience.length === 0) {
    // Refuse rather than skip the check: an unset audience must not degrade into
    // "accept any Apple token", which is the exact hole described above.
    console.error("apple auth: neither APPLE_BUNDLE_ID nor APPLE_SERVICES_ID is set");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, keys, { issuer: ISSUER, audience });
    if (typeof payload.sub !== "string") return null;

    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    // Apple sends these as either booleans or the strings "true"/"false".
    const truthy = (v: unknown) => v === true || v === "true";

    return {
      sub: payload.sub,
      email,
      emailVerified: truthy(payload.email_verified),
      isPrivateEmail: truthy(payload.is_private_email),
    };
  } catch (err) {
    console.error("apple auth: token rejected —", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Find the account this Apple user maps to, creating it the first time.
 *
 * Matched on `sub`, never on email. Apple's `sub` is the stable identifier;
 * the email may be a relay address, may be hidden, and — for a user who signs
 * in with Apple after already having a password account — may match an existing
 * row. That last case is deliberately treated as *the same person*: refusing it
 * would strand them with two libraries and no way to merge them, and Apple has
 * verified the address.
 *
 * `name` arrives only on the very first authorisation, and never again. If it
 * is not captured here it is gone for good, which is why it is a parameter
 * rather than something read back from Apple later.
 */
export async function userForApple(
  identity: AppleIdentity,
  name?: string | null
): Promise<{ id: string } | null> {
  const link = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "apple", providerAccountId: identity.sub } },
    select: { userId: true },
  });
  if (link) return { id: link.userId };

  // A relay address is still unique per user per app, so it is safe as the
  // account's email. What it is not is reachable by us — see the note in the
  // deletion route about not relying on it.
  const email = identity.email;
  if (!email) return null;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  const userId =
    existing?.id ??
    (
      await prisma.user.create({
        // No password: this account has no other way in, which is correct. It
        // is nullable in the schema precisely so a provider-only user is
        // representable rather than needing a fake hash.
        data: { email, name: name?.trim() || null, emailVerified: identity.emailVerified ? new Date() : null },
        select: { id: true },
      })
    ).id;

  await prisma.account.create({
    data: { userId, provider: "apple", providerAccountId: identity.sub, type: "oauth" },
  });

  return { id: userId };
}

// ── Revocation ───────────────────────────────────────────────────────────────

/**
 * Apple requires that deleting an account also revokes the Sign in with Apple
 * token, so the app stops appearing in the user's Apple ID settings as
 * something they are still signed in to.
 *
 * This needs a client secret, which is a JWT signed with a private key from the
 * developer portal. Without those environment variables the rest of Sign in
 * with Apple still works — only revocation cannot, which is why this reports
 * rather than throws, and why the deletion route treats a failure here as
 * something to log rather than something to abort on. Deleting the user's data
 * is the part they asked for; refusing to do it because Apple's endpoint was
 * unreachable would be the wrong trade.
 */
export function revocationConfigured(): boolean {
  return !!(
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY &&
    process.env.APPLE_BUNDLE_ID
  );
}

async function clientSecret(): Promise<string> {
  // The portal hands this over as a .p8 file. Stored in an environment variable
  // its newlines are usually flattened, so they are restored here rather than
  // requiring whoever sets it to get the escaping exactly right.
  const pem = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setAudience(ISSUER)
    .setSubject(process.env.APPLE_BUNDLE_ID!)
    .setIssuedAt()
    // Apple caps this at six months; minutes is plenty for one request.
    .setExpirationTime("5m")
    .sign(key);
}

/**
 * Exchange the one-time authorization code the app receives for a refresh
 * token, which is the thing that can later be revoked.
 *
 * The code is single-use and short-lived, so this has to happen during sign-in
 * or not at all.
 */
export async function storeRefreshToken(code: string, userId: string): Promise<void> {
  if (!revocationConfigured()) return;

  try {
    const res = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.APPLE_BUNDLE_ID!,
        client_secret: await clientSecret(),
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      console.error("apple auth: code exchange failed", res.status);
      return;
    }
    const data = (await res.json()) as { refresh_token?: string };
    if (!data.refresh_token) return;

    await prisma.account.updateMany({
      where: { userId, provider: "apple" },
      data: { refresh_token: data.refresh_token },
    });
  } catch (err) {
    console.error("apple auth: code exchange —", err instanceof Error ? err.message : err);
  }
}

/** Tell Apple this user is no longer signed in. Best effort, by design. */
export async function revokeAppleAccess(userId: string): Promise<void> {
  if (!revocationConfigured()) return;

  const account = await prisma.account.findFirst({
    where: { userId, provider: "apple" },
    select: { refresh_token: true },
  });
  if (!account?.refresh_token) return;

  try {
    await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.APPLE_BUNDLE_ID!,
        client_secret: await clientSecret(),
        token: account.refresh_token,
        token_type_hint: "refresh_token",
      }),
    });
  } catch (err) {
    console.error("apple auth: revoke —", err instanceof Error ? err.message : err);
  }
}
