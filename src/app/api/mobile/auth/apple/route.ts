import { NextResponse } from "next/server";
import { issueToken, failureCode } from "@/lib/mobile-auth";
import { verifyIdentityToken, userForApple, storeRefreshToken } from "@/lib/apple-auth";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * Sign in (or up) with Apple, from the app.
 *
 * One endpoint for both, because Apple does not distinguish them: the client
 * gets an identity token either way and the server decides whether it has seen
 * that `sub` before. A separate "register with Apple" would be a route that
 * could only ever guess.
 *
 * `name` is sent only on the user's very first authorisation — Apple never
 * provides it again — so it is taken on trust here and used only if the account
 * is being created. It is display text, not a credential.
 */
export async function POST(req: Request) {
  // Verification is a network call to Apple, so this is worth limiting even
  // though a forged token cannot get past it.
  const limit = await rateLimit(clientKey(req, "apple"), 20, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  let body: { identityToken?: string; authorizationCode?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!body.identityToken) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const identity = await verifyIdentityToken(body.identityToken);
  if (!identity) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  try {
    const found = await userForApple(identity, body.name);
    if (!found) {
      // Apple withheld the email and we have no prior link, so there is nothing
      // to key an account on. Rare, and recoverable by the user removing the app
      // from their Apple ID and signing in again.
      return NextResponse.json({ error: "no_email" }, { status: 422 });
    }

    // Best effort, and deliberately not awaited into the failure path: this only
    // enables revocation later, and a user should not be refused sign-in
    // because Apple's token endpoint was slow.
    if (body.authorizationCode) {
      await storeRefreshToken(body.authorizationCode, found.id);
    }

    const user = await prisma.user.findUnique({
      where: { id: found.id },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ token: await issueToken(found.id), user });
  } catch (err) {
    console.error("mobile apple auth:", failureCode(err));
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
