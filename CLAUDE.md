# Music Tracker App (Recordcrate)

## What This Is
A stripped-down, Letterboxd-style app for music. Search albums and songs, add them
to your library with a status, and rate them out of 10.

**This is deliberately an MVP.** A lot of built, working features were cut to ship it —
they are all documented in `ARCHIVE.md` and recoverable from the git tag
`pre-mvp-archive`. To bring one back, ask: *"pull the [feature] back in."*

## Current Stack
- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Prisma + **Supabase Postgres**
- NextAuth.js v5 (credentials + optional GitHub OAuth), JWT sessions
- MusicBrainz for music data, iTunes + Cover Art Archive for artwork
- Deployed on Vercel

## MVP Surface
Only 9 routes exist. Keep it that way unless a feature is being deliberately added.

- `/` — search landing; with `?q=` it becomes the results page
  (`&type=artists|albums|songs`, default shows all three)
- `/album/[mbid]` — album detail, tracklist, add/rate
- `/artist/[mbid]` — deliberately minimal: photo, name, genres, studio discography
  in chronological order. Each album is a `ResultCard`, so you can rate from here.
- `/library` — your saved albums and songs, with filters and sorting
- `/login`, `/register`, `/api/auth/*` — auth
- `/api/artwork` — artwork fallback via iTunes: `?title=&artist=` for album covers,
  `?artist=` alone for an artist photo (MusicBrainz stores no artist images)

## Key Files
- `src/lib/search.ts` — all search logic and result ranking (see below)
- `src/lib/musicbrainz.ts` — request queue, cache, album and artist lookups
- `src/lib/artwork.ts` — iTunes → Cover Art Archive artwork resolution, memoised
- `src/lib/library.ts` — `getExistingEntries`, so cards show what you've already saved
- `src/app/actions.ts` — the only mutations: `saveToLibrary`, `rateItem`, `removeFromLibrary`
- `src/components/ResultCard.tsx` — a search hit (album or song), add/rate popover,
  and the hold-to-rate gesture (550ms, cancelled past 8px of movement)
- `src/components/ArtistCard.tsx` — an artist hit; photo is fetched client-side
- `src/components/LibraryItemCard.tsx` — a saved item, shared by `/` and `/library`

## Two Things That Will Bite You

**1. MusicBrainz rate limiting is real.** Anonymous clients get roughly *one request
per second*, and exceeding it gets the IP blocked — which looks exactly like an outage
(`TypeError: fetch failed`, not an HTTP error). `MB_REQUEST_GAP_MS` in
`src/lib/musicbrainz.ts` enforces the gap; do not lower it. Set `MB_CONTACT` to real
contact info, because MusicBrainz also blocks fake User-Agents.

Request count is the main budget — spend it carefully. Current costs:

| Action | MusicBrainz requests |
| --- | --- |
| Search, default (all three sections) | 4–5 |
| Search, `type=artists` | 1 |
| Search, `type=albums` | 2 |
| Search, `type=songs` | 3–4 |
| Album page | 2 |
| Artist page | 2 |

So a cold default search takes roughly 5 seconds. Everything is cached for an hour
in-process, and repeat searches are instant. Artwork comes from iTunes, which is not
rate limited, so image lookups are free of this budget.

**2. Search ranking is hand-tuned, on purpose.** MusicBrainz relevance alone is bad
for this use case: searching "radiohead" returns interview bootlegs with the word in
their *title*, while Radiohead's actual studio albums rank below the top 75. So
`search.ts` detects when a query names an artist (from credits already present in the
results — free, no extra request) and then browses that artist's discography by id.
Traps already hit and defended against — every one of these was a real observed bug:
- an obscure band is named "Bohemian Rhapsody", and another "Karma Police" — exact
  *title* matches must outrank exact *artist* matches
- a hardcore band is named "Beatles HC" — a low-scoring partial name match must not
  hijack the query
- "The Beatles" *contains* "beatles" without starting with it, so candidate matching
  allows substrings, gated on prominence
- **the `releases` array in search results is truncated** (nothing exceeds ~3 entries
  however famous), so release count is *not* a popularity signal. Don't build ranking
  on it. Discography size is the reliable prominence measure, and it's already fetched.
- Queen's "Bohemian Rhapsody" recording comes back with **no release date at all**, so
  "the original predates its covers" can't be the deciding signal either. What settles
  song-title queries is a cross-check: an artist appearing in *both* the album and
  recording results for the query is almost certainly the canonical performer.
- artist ranking leads with MusicBrainz's own `score` (it gives The Beatles 100 and
  nothing else above 72); name matching is only a tiebreak.

Song and album searches can't be merged into one `recording:X OR arid:Y` query —
MusicBrainz truncates to the top 75 by relevance, and for "radiohead" all 75 go to
interview clips. See the comment on `songSearch`.

If you change ranking, re-check these queries by hand — each catches a different
failure: `radiohead`, `beatles`, `the beatles`, `kendrick lamar`, `kid a`,
`bohemian rhapsody`, `karma police`, `queen`.

## Spotify export

`/library` can push Want to Listen into one Spotify playlist. Albums are expanded to
their full tracklists, because a playlist can only hold tracks. Re-exporting syncs
the same playlist (id on `User.spotifyPlaylistId`) and skips URIs already in it, so
anything you removed in Spotify stays removed.

- `src/lib/spotify.ts` — OAuth, token refresh, search/match, playlist sync
- `src/app/api/spotify/login|callback` — OAuth flow, with a state cookie for CSRF
- `src/app/spotify-actions.ts` — `exportWantToListen()`, returns a match/miss report
- Tokens live in the existing NextAuth `Account` table under `provider: "spotify"`,
  so this needed no new table.

Redirect URIs: Spotify **rejects `localhost`**. Use `http://127.0.0.1:3000/...`
locally (loopback with an explicit port) or HTTPS in production. A LAN address like
`http://192.168.1.x:3000` cannot be registered, so Spotify linking can't be done from
a phone against the dev server — only via 127.0.0.1 or the deployed site.

Matching is by text search against Spotify, so it won't find everything (obscure
pressings, classical, MusicBrainz-only releases). Unmatched items are reported back
rather than silently dropped — keep that behaviour.

Three Spotify API traps, all hit for real and all presenting as unexplained failures:

1. **Use `/playlists/{id}/items`, never `/playlists/{id}/tracks`.** The March 2026
   migration replaced that sub-resource, and Development Mode apps get a bare
   `403 Forbidden` on the old path — while `GET /playlists/{id}` still returns 200,
   so it reads like a permissions problem rather than a moved endpoint. The response
   shape changed too: `items[].track` → `items[].item`.
2. **Create playlists with `POST /me/playlists`.** `POST /users/{user_id}/playlists`
   returns 403 for both id forms `/me` gives you (`id`, the legacy username, and
   `account_id`).
3. **Quote every field-filter value in a search.** `album:Led Zeppelin artist:Led
   Zeppelin` returns *zero* results because only the first word binds to the field;
   `album:"Led Zeppelin" artist:"Led Zeppelin"` finds it instantly. Single-word and
   forgiving titles hide this bug — "To Pimp a Butterfly" matched unquoted.

## Testing on a phone: never bind dev to 0.0.0.0

To reach the dev server from a phone, bind it to the machine's **LAN IP**:

```bash
npx next dev --port 3000 --hostname 192.168.1.202   # your current LAN IP
```

**Do not use `--hostname 0.0.0.0`.** The page still renders and looks perfect, but
the dev client derives its HMR/RSC socket from the advertised host, and no browser
can route to `0.0.0.0` — so **hydration never completes and nothing interactive
works**, on every device, silently. No error appears in the terminal or the browser
console. It presents as "the filters don't do anything": native `<select>` elements
still open, because that needs no JavaScript, while the React state behind them is
dead.

Also set in `.env.local` for phone testing (both are documented in `.env.example`):
`AUTH_URL=http://<lan-ip>:3000`, or sign-in redirects to an unreachable host.

To check hydration without a browser at hand, add a temporary client component whose
`useEffect` fetches a marked URL, load the page with
`chrome --headless=new --dump-dom`, and grep the dev server log for the marker. A
`--dump-dom` snapshot alone is not proof: Next's devtools overlay injects
`nextjs-portal` even when app hydration has failed.

## Deploys are automatic — with one caveat now handled

Pushing to `main` triggers a Vercel deploy. Database changes are **not** automatic
from a push alone, so `build` runs `prisma migrate deploy && next build`: adding a
column and pushing now applies the migration before the new code goes live. Without
that, a deploy would build cleanly and then fail at runtime on a column that does not
exist yet. A failed migration fails the build, which is the safe direction.

Supabase free projects pause after ~7 days idle; the first request after that errors
until it is resumed from the dashboard.

## Spotify playlist sync

Want to Listen mirrors itself into the playlist. Adding an item queues its tracks;
marking it Listened or deleting it removes them. Both run through `after()` from
`next/server`, so the tap returns immediately rather than waiting on Spotify — a
71-track box set would otherwise add about a second to a status change.

Removal needs no catalogue lookup: `PlaylistTrack` already records which URIs came
from which library row. Adding does need the tracklist fetched.

A failed background sync sets `User.playlistSyncFailedAt`, and `/library` then warns
that the playlist may be out of date. This is the point of the flag — a background
sync that fails silently is worse than none, because you would trust a stale
playlist. The Sync button remains as the reconciler and clears the flag.

The export is also a two-way sync. `PlaylistTrack` records every track
the app adds, so a sync can remove tracks whose library row left Want to Listen
without touching tracks the user added to that playlist by hand — that distinction
is the whole reason the table exists rather than diffing the playlist.

A first sync **adopts** untracked tracks that a current Want to Listen item asks
for, so playlists populated before tracking existed become manageable. Tracks from
items that left Want to Listen *before* tracking existed stay orphaned and are never
removed; they have to be deleted by hand.

## Spotify API limits that are not in the docs

- `search` and `artists/{id}/albums` **cap `limit` at 10**. Asking for 11 returns
  `400 "Invalid limit"` rather than a clamped result, so anything longer is paged by
  offset. `albums/{id}/tracks` still allows 50 — the cap is per endpoint.
- Playlist contents live at `/playlists/{id}/items`, not `/tracks` (403 on the old
  path), and creation is `POST /me/playlists`, not `/users/{id}/playlists`.

## Songs have no stable id — read this before touching song code

MusicBrainz models a **recording per release**, so one studio song has many recording
ids: "Karma Police" has eleven for Radiohead with nothing distinguishing them. Song
search and an album's tracklist therefore routinely reference *different* ids for what
anyone would call the same song.

So **songs are identified by title+artist, not by id**:

- `src/lib/library.ts` — `songKey()` and `getSavedSongs()` look songs up by title+artist
- `src/app/actions.ts` — `findExistingSongId()` makes a save update the existing row
  rather than inserting a second one; `removeFromLibrary` falls back the same way
- the album page and search page check the id first, then fall back to the song key

Without this you get two "Karma Police" rows in one library. The `mbid` column still
holds whichever recording id it was first saved under — treat it as opaque for songs.

## Known Limitations
- Songs are stored under a MusicBrainz *recording* id, which has no page of its own, so
  saved songs don't link anywhere. Song cards in search link to the album the song
  first appeared on.
- Album ratings and track ratings are independent rows. Rating every track on an album
  does not rate the album.
- The `Review` model exists in the schema but has no UI. See `ARCHIVE.md` section 10.

## Features To Build
- [ ] Reviews UI (schema is already there)
