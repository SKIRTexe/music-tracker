import { NextResponse } from "next/server";
import { authed, issueLinkState } from "@/lib/mobile-auth";
import { authorizeUrl, spotifyConfigured } from "@/lib/spotify";

/**
 * The URL the app should open to connect Spotify.
 *
 * The app opens it in an `ASWebAuthenticationSession` and waits for the callback
 * to bounce back to `recordcrate://spotify`. The redirect URI registered with
 * Spotify is unchanged — it is still the website's `/api/spotify/callback` — so
 * connecting from the app needs nothing added in the Spotify dashboard. What
 * tells that callback this was an app link is the signed `state`.
 */
export const GET = authed(async (_req, userId) => {
  if (!spotifyConfigured()) {
    return NextResponse.json({ error: "spotify_unconfigured" }, { status: 503 });
  }
  return NextResponse.json({ url: authorizeUrl(await issueLinkState(userId)) });
});
