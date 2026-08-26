import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { linkAccount } from "@/lib/spotify";
import { verifyLinkState } from "@/lib/mobile-auth";

/**
 * Spotify redirects back here with a one-time code.
 *
 * Serves both clients, because Spotify allows only the redirect URIs registered
 * in its dashboard and there is no reason to make connecting from the app require
 * adding one. The two are told apart by the `state`:
 *
 * - **Website.** State is a random string matched against an httpOnly cookie set
 *   when the flow started. Ends on `/library` with a notice.
 * - **App.** State is a short-lived JWT naming the user, signed with `AUTH_SECRET`
 *   (see `issueLinkState`). There is no cookie to match — the consent screen ran
 *   in a system web view — so the signature is what proves the callback belongs
 *   to a flow this server started. Ends on `recordcrate://spotify`, which is what
 *   closes the web view.
 *
 * The app branch is checked first and only succeeds on a validly signed state, so
 * it cannot be reached by a browser that simply lacks a session.
 */
const APP_CALLBACK = "recordcrate://spotify";

/** Redirecting to a custom scheme, which `NextResponse.redirect` will not parse. */
function toApp(status: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_CALLBACK}?status=${status}` },
  });
}

export async function GET(req: NextRequest) {
  const libraryUrl = new URL("/library", req.url);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // ── App flow ────────────────────────────────────────────────────────────────

  const appUserId = state ? await verifyLinkState(state) : null;
  if (appUserId) {
    if (error) return toApp("denied");
    if (!code) return toApp("badstate");
    try {
      await linkAccount(appUserId, code);
      return toApp("linked");
    } catch {
      return toApp("failed");
    }
  }

  // ── Website flow ────────────────────────────────────────────────────────────

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", req.url));

  const expected = req.cookies.get("spotify_oauth_state")?.value;

  if (error) {
    // Most commonly the user pressed "Cancel" on Spotify's consent screen.
    libraryUrl.searchParams.set("spotify", "denied");
    return NextResponse.redirect(libraryUrl);
  }
  if (!code || !state || !expected || state !== expected) {
    libraryUrl.searchParams.set("spotify", "badstate");
    return NextResponse.redirect(libraryUrl);
  }

  try {
    await linkAccount(session.user.id, code);
    libraryUrl.searchParams.set("spotify", "linked");
  } catch {
    libraryUrl.searchParams.set("spotify", "failed");
  }

  const res = NextResponse.redirect(libraryUrl);
  res.cookies.delete("spotify_oauth_state");
  return res;
}
