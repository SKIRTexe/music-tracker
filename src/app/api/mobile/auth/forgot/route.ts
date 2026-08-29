import { NextResponse } from "next/server";
import { requestReset } from "@/lib/password-reset";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";

/**
 * Ask for a reset link, from the app.
 *
 * The reset itself happens on the website: it is a one-off, it arrives as a
 * link in an email, and a browser is already the right place to open a link.
 * Building a second redemption path into the app would double the surface of
 * the most security-sensitive flow here for no gain.
 *
 * Always answers `{ sent: true }`. Whether that address has an account is not
 * this endpoint's to disclose — otherwise it becomes a way to enumerate users,
 * which the sign-in endpoint already takes care not to be.
 */
export async function POST(req: Request) {
  // Tighter than login. Each of these sends mail to an address the requester
  // chose, so the abuse is not guessing — it is using this as a way to send
  // someone else repeated email.
  const limit = await rateLimit(clientKey(req, "forgot"), 5, 15 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!body.email?.includes("@")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const origin = process.env.AUTH_URL ?? new URL(req.url).origin;
  // Deliberately not awaited into the response: how long this takes reveals
  // whether the address exists, and a slow mail provider would make that
  // difference obvious.
  requestReset(body.email, origin).catch(() => {});

  return NextResponse.json({ sent: true });
}
