import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { linkAccount } from "@/lib/spotify";

/** Spotify redirects back here with a one-time code. */
export async function GET(req: NextRequest) {
  const libraryUrl = new URL("/library", req.url);

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
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
