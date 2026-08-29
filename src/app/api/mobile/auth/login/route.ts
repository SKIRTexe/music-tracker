import { NextResponse } from "next/server";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";
import { failureCode, issueToken, verifyCredentials } from "@/lib/mobile-auth";

/**
 * Exchange email and password for a bearer token.
 *
 * Only the credentials provider is offered here. GitHub sign-in is a browser
 * redirect flow, and an account created that way has no `password` to check —
 * such a user gets the same "invalid credentials" answer as a wrong password,
 * which is honest enough: there is no password that would work.
 */
export async function POST(req: Request) {
  // Ten tries a minute. Enough that a person mistyping a password never
  // notices, and few enough that guessing is not a strategy — each attempt
  // costs a bcrypt verification at cost 12, so this protects the CPU as well as
  // the account.
  const limit = await rateLimit(clientKey(req, "login"), 10, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  try {
    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    return NextResponse.json({ token: await issueToken(user.id), user });
  } catch (err) {
    // Signing in is the one request that must never fail silently: it is the
    // only door into the app, and an opaque 500 makes "the database is
    // unreachable" indistinguishable from "the password was wrong".
    console.error("mobile login:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "server_error", code: failureCode(err) },
      { status: 500 }
    );
  }
}
