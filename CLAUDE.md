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
Only 10 routes exist. Keep it that way unless a feature is being deliberately added.

- `/` — search landing; with `?q=` it becomes the results page
  (`&type=artists|albums|songs`, default shows all three)
- `/album/[mbid]` — album detail, tracklist, add/rate
- `/artist/[mbid]` — deliberately minimal: photo, name, genres, studio discography
  in chronological order. Each album is a `ResultCard`, so you can rate from here.
- `/library` — your saved albums and songs, with filters and sorting
- `/stats` — the charts, from the tracking data. `?range=30|90|365|all` scopes the
  Activity section only
- `/login`, `/register`, `/api/auth/*` — auth
- `/api/artwork` — artwork fallback via iTunes: `?title=&artist=` for album covers,
  `?artist=` alone for an artist photo (MusicBrainz stores no artist images)

## Key Files
- `src/lib/search.ts` — all search logic and result ranking (see below)
- `src/lib/musicbrainz.ts` — request queue, cache, album and artist lookups
- `src/lib/artwork.ts` — iTunes → Cover Art Archive artwork resolution, memoised
- `src/lib/library.ts` — `getExistingEntries`, so cards show what you've already saved
- `src/app/actions.ts` — the only mutations: `saveToLibrary`, `rateItem`,
  `removeFromLibrary`, plus the comparison-ranking writes
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

## Tracking and metrics

Every library action is recorded. `/stats` charts it; `getDashboard()` is the one
call that assembles every metric.

- `src/lib/tracking.ts` — the write side: `trackChange`, `trackRemoval`
- `src/lib/enrich.ts` — genres, track count and runtime, filled in the background
- `src/lib/stats.ts` — every metric, computed on demand
- `src/app/stats-actions.ts` — `myStats()`, `backfillMyLibrary()`
- `src/app/stats/page.tsx`, `src/components/charts/*`, `src/lib/viz.ts` — the dashboard

Three rules, each of which will produce wrong numbers if broken:

**1. `AlbumLog` is "now", `LibraryEvent` is "what happened".** Asking the wrong one
gives a wrong answer, not a slow one. `AlbumLog` has no memory of a rating you
changed or an item you deleted, so every timeseries, every former state and the
whole backlog-conversion metric must come from the event log. Conversely the event
log double-counts an item added, deleted and re-added, so current totals must come
from `AlbumLog`.

**2. One user action writes one event, carrying every delta.** Rating an album that
was in Want to Listen moves both its rating and its status, and that is a single
`RATED` event with `fromStatus: "WANT"`, `toStatus: "LISTENED"` — not two rows. So
"when did things get listened to" filters on `toStatus`, *never* on `type`; filter
by type and you miss every item rated straight from a search result. Re-tapping a
status an item already has writes nothing, so the timeline has no phantom activity.

**3. Tracking never breaks the action it observes.** Every function in
`tracking.ts` and `enrich.ts` swallows its own errors to the server console. The
worst case is a gap in the history; losing a rating to an analytics failure is not
an acceptable trade.

Genre is the one metric that cost something to get, and the reason MusicBrainz is
back (see below). **Nothing on the add path knows an item's genre**: Spotify search
results carry none and Spotify no longer returns artist genres at all, so the card
the user tapped had no genre to hand. `enrichRow` fetches it after the fact, which
is why it runs in `after()` alongside the playlist sync, and why genres are cached
per artist in `ArtistMeta` (a library with thirty Radiohead items pays for one
lookup, not thirty). It also backfills the genres onto events already written for
that item, or the first event of every item's history — its `ADDED` — would be the
one with no genre on it.

Runtime and track count still come from Spotify, which does still have them.
Enrichment costs about 7 seconds per new artist and 1 per already-known one; it is
batched at 25 and must never be called from a page render.

An item carries every genre its artist does, and Spotify gives Radiohead five, so
genre shares deliberately sum to more than 1 and `minItems` exists to keep a genre
held by one album out of a "best genre" ranking.

Rows saved before this existed were backfilled by the migration, but only as far as
the data allows: an old row has just `addedAt` and `updatedAt`, so it gets an
`ADDED` event and, where `updatedAt` is provably later, one event for its last
known change. Anything in between is unrecoverable and deliberately not invented.
Their genres are empty until `backfillMyLibrary()` runs, which is batched at 25
rows because each row costs a Spotify call.

Timestamps bucket in **UTC**. Local-time buckets need the user's timezone, which
nothing collects — so the dashboard says UTC rather than implying a "you listen at
2am" that is really 9pm in New York.

### The dashboard

`/stats` renders `getDashboard()`. Four rules it is built on:

**No chart library, and no client component.** Every mark is server-rendered. This
app's worst failure mode is a page that looks perfect and does nothing because
hydration died, and a dashboard whose numbers silently stop moving is worse than one
that is visibly absent. The whole page works with JavaScript off.

**Marks are HTML boxes; only line *paths* are SVG.** An SVG chart scaled to phone
width scales its text down with it — a 10px axis label becomes 5px. HTML bars reflow
instead and the labels stay real 10px text. The line chart's SVG therefore contains
no text: strokes carry `vectorEffect="non-scaling-stroke"` so they stay 2px at any
width, and the end-markers are positioned HTML elements, because
`preserveAspectRatio="none"` would squash an SVG circle into an ellipse.

**Every chart has a table twin** in a native `<details>`, so no value is reachable
only by hovering. Native, again, so it cannot be broken by hydration.

**The palette in `src/lib/viz.ts` is validated, not chosen.** Three categorical
slots, one accent for magnitude, one four-step ordinal ramp — all checked against
the card surface (`zinc-900`) for the lightness band, chroma floor, adjacent and
all-pairs colourblind separation, and 3:1 contrast. Re-validate the set if you
change a hex; do not eyeball it. Two rules ride along: nominal categories (genres,
artists) get *one* colour, never a ramp — shading a bar by its own length burns the
only free channel — and there is never a second y-axis. Average rating per decade
sits in that chart's table for exactly that reason.

Two traps already hit while building it:

- A bar whose height is a percentage **collapses to nothing inside an auto-height
  flex parent**. The column wrapper needs `h-full`. It fails silently — the chart
  renders, axes and all, with slivers where the bars should be.
- Counts need an **even** axis top, or a two-item chart draws ticks at 1 / 0.5 / 0.
  `axisTop()` handles it; pass counts through it rather than `niceMax` directly.

Screenshotting it: headless Chrome enforces a minimum window width and *crops* the
image to `--window-size`, so a narrow shot looks like a layout overflow that isn't
there. To check a real phone width, load the page in a 390px `<iframe>` and shoot
the wrapper.

### Spotify withdrew artist genres, so MusicBrainz is back for that one job

`GET /artists/{id}` **no longer returns `genres`, `popularity` or `followers`** —
the fields are absent from the payload, not empty. Verified directly against the
API in August 2026. Nothing in the app can get a genre from Spotify any more.

Two consequences worth knowing before you debug either:

1. The genre chips on `/artist/[id]` and in `ArtistCard`, and the follower count on
   `/artist/[id]`, all silently render nothing — they are null-guarded, so this
   looked like an artist with no genres rather than a broken field. The artist
   *page* now reads genres from the `ArtistMeta` cache instead. `ArtistCard` was
   left alone: it fetches client-side and would need an API route for one line of
   text.
2. `src/lib/musicbrainz.ts` exists again — but **only** for genres, and only from
   `after()`. It was removed as the *catalogue* because 1 request/second made
   search take 17 seconds; none of that applies to a background lookup that runs
   once per artist ever and is cached in `MbCache` and `ArtistMeta`. Do not call it
   from a page render, and do not lower `MB_REQUEST_GAP_MS`. `MB_CONTACT` must be
   real contact info or no request is made at all — MusicBrainz blocks fake
   User-Agents, so sending one risks the deployment's IP.

MusicBrainz genres come with vote counts, so the top 5 are the artist's actual main
genres: Prince resolves to funk / pop / contemporary r&b / rock / funk rock. Names
are quoted in the search query for the same Lucene reason the Spotify search needed
it — unquoted, `artist:Kacey Musgraves` binds only "Kacey" to the field.

**`MB_CONTACT` has to be set on Vercel too, not just in `.env.local`.** Without it
no request is attempted, and it fails *quietly*: the app looks healthy and every
artist simply has no genres. Hit for real — the first production deploy had it
locally and not on the host.

That is also why `artistGenresByName` returns `null` for "could not ask" and `[]`
for "asked, and there are none", and why **only `[]` is ever cached**. Collapsing
the two is what turns one missing environment variable into every artist being
permanently genre-less: the empty answer lands in `ArtistMeta` with a 30-day TTL
and nothing asks again. For the same reason `enrichRow` only stamps `enrichedAt`
once genres have actually answered — an enriched row is never revisited, so
stamping it after a failed lookup would lose that item's genre for good while its
runtime figures looked perfectly correct.

## Comparison ranking (the Beli model)

Optional, per user, toggled on `/library`. When it is on, **you never type a score.**
You put the item in one of three coarse buckets, answer a few "which did you like
more?" questions, and the number is derived from where it landed. Comparing two
records you know is a question you can answer honestly; "is this a 7.4 or a 7.8"
is not.

- `src/lib/ranking.ts` — bands, score derivation, placement, seeding
- `src/components/RankFlow.tsx` — the modal, and `useRankingMode`
- `src/components/RankingToggle.tsx` — the switch
- `src/app/actions.ts` — `setRankingEnabled`, `getComparisonSetup`,
  `rateByComparison`, `rateByNumber`, `rankingMode`

**The order is the only source of truth; the score is a view of it.** Every score
comes from `bucket` + `rankPosition`. Nothing writes a rating directly while
ranking is on — not even an override, which works by *moving the item* to the slot
matching the number typed. So the list and the scores cannot contradict each other,
because there is only one thing to contradict. The consequence to keep in mind is
that an override's displayed score can settle a decimal from what was typed; the
position is what was actually being expressed.

Albums and songs are separate ladders. "Is Kid A better than Karma Police" has no
honest answer, and the dashboard already reports the two averages separately.

**Scores live in bands, not on one global scale**: loved 6.8–10, fine 3.4–6.7,
disliked 0–3.3. One global scale would mean adding an album you loved could drag a
merely-fine album into a different verdict. A bucket's items only ever move within
their own band. Small buckets use a narrow window around the band's midpoint and
widen as they fill (`FULL_SPREAD_AT`) — otherwise your second loved album scores
6.8, a chasm away from a record you said you loved.

The slider stays on the album page even with ranking on, and writes through
`rateByNumber` rather than `rateItem` — a direct write would leave a score its
ladder position disagrees with, which is the one thing the model exists to
prevent. The album page is where you reconsider a record you already know, and
re-answering a ladder of comparisons to nudge a score is the wrong tool for that.
The compact popover on cards stays comparison-only.

Comparisons only start after `RANKING_MIN_RATED` (2) rated items of that type;
below that there is nothing to compare against, so rating stays a slider and those
first few seed the ladder.

Five things that will bite:

1. **The ladder inverts if you seed it in the wrong direction.** `ensureSeeded`
   assigns positions -1, -2, -3… walking *best first*. Iterating worst-first gives
   the highest position to whichever row is handled first — which is the worst one
   — and silently reverses every ranking. Caught by test, not by reading.
2. **`recomputeBucket` writes `rating` directly and logs no events, deliberately.**
   A score that moved because a *different* album was placed above it is not an
   opinion change, and logging those would drown the real ones in the activity
   feed. Only the item actually being placed gets an event.
3. **Positions are renormalised to integers on every recompute.** Inserting at the
   midpoint between neighbours halves the gap each time; without renormalising, a
   few dozen inserts into the same spot would exhaust float precision. It is free
   here because the rows are already being written.
4. **Never import a value from `lib/ranking` into a client component.** It imports
   prisma. `RankingToggle` takes the threshold as a prop for exactly this reason;
   `RankFlow` imports only *types* from it.
5. **Turning the toggle on re-seeds from current ratings** rather than only filling
   gaps, so slider ratings made while it was off are absorbed. Not destructive:
   scores descend with position, so rebuilding from scores reproduces the same
   order.

The binary search runs entirely in the client — every candidate is sent once when
the modal opens, so answering a question needs no request. The final slot is
submitted once and re-scored server-side, so a stale candidate list cannot corrupt
the ladder. Worst case is 6 questions for a 40-item bucket.

## Known Limitations
- Songs are stored under a MusicBrainz *recording* id, which has no page of its own, so
  saved songs don't link anywhere. Song cards in search link to the album the song
  first appeared on.
- Album ratings and track ratings are independent rows. Rating every track on an album
  does not rate the album.
- The `Review` model exists in the schema but has no UI. See `ARCHIVE.md` section 10.

## Features To Build
- [ ] Reviews UI (schema is already there)
