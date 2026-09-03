/**
 * One-time setup for the app's own Spotify account.
 *
 * Obtains a refresh token for whichever Spotify account you authorise, which
 * then hosts a playlist per user. Run once, put the token in the environment,
 * and it never needs doing again — Spotify refresh tokens do not expire on a
 * timer, only on revocation.
 *
 *   Step 1:  npx tsx scripts/spotify-app-auth.ts
 *            → prints a URL. Open it, signed in as the account you want to own
 *              the playlists. **Not your personal account** unless you are happy
 *              for these playlists to sit in it.
 *
 *   Step 2:  it redirects to your SPOTIFY_REDIRECT_URI with ?code=…
 *            Copy that code.
 *
 *   Step 3:  npx tsx scripts/spotify-app-auth.ts <code>
 *            → prints the refresh token. Set SPOTIFY_APP_REFRESH_TOKEN.
 *
 * The scopes are only the playlist ones. This account never needs to read
 * anyone's listening history, and asking for less is the difference between a
 * token that can manage playlists and one that can read a person's habits.
 */
export {};

const SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "playlist-read-private",
].join(" ");

const id = process.env.SPOTIFY_CLIENT_ID;
const secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect = process.env.SPOTIFY_REDIRECT_URI;

if (!id || !secret || !redirect) {
  throw new Error("SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REDIRECT_URI must be set");
}

const code = process.argv[2];

if (!code) {
  const params = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirect,
    scope: SCOPES,
    // Forces the consent screen even if this account already authorised the app,
    // so you can tell which account you are actually granting.
    show_dialog: "true",
  });
  console.log("\nOpen this, signed in as the account that should own the playlists:\n");
  console.log(`https://accounts.spotify.com/authorize?${params.toString()}\n`);
  console.log("Then re-run with the ?code= value from the redirect:\n");
  console.log("  npx tsx scripts/spotify-app-auth.ts <code>\n");
} else {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    }),
  });

  if (!res.ok) {
    console.error(`\nExchange failed: ${res.status}`);
    console.error(await res.text());
    console.error("\nA code is single-use and expires in about a minute — get a fresh one.\n");
    process.exit(1);
  }

  const body = (await res.json()) as { refresh_token?: string; scope?: string };
  if (!body.refresh_token) {
    console.error("\nNo refresh token came back. Re-run step 1 and authorise again.\n");
    process.exit(1);
  }

  const who = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${(body as { access_token: string }).access_token}` },
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  console.log("\nAuthorised account:", who?.display_name ?? who?.id ?? "(unknown)");
  console.log("Granted scopes   :", body.scope ?? "(none reported)");
  console.log("\nSet this, and nothing else needs doing again:\n");
  console.log(`SPOTIFY_APP_REFRESH_TOKEN=${body.refresh_token}\n`);
}
