import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { authorizeUrl, spotifyConfigured } from "@/lib/spotify";

/** Starts the Spotify OAuth flow. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.SPOTIFY_REDIRECT_URI!));
  }
  if (!spotifyConfigured()) {
    return NextResponse.json(
      { error: "Spotify is not configured. See DEPLOY.md." },
      { status: 500 }
    );
  }

  // CSRF: the callback only proceeds if the returned state matches this cookie.
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
