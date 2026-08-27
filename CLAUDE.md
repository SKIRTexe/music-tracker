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
Only 11 routes exist. Keep it that way unless a feature is being deliberately added.

- `/` — search landing; with `?q=` it becomes the results page
  (`&type=artists|albums|songs`, default shows all three). Bare, it also carries
  the two Discover rows (see below)
- `/album/[mbid]` — album detail, tracklist, add/rate
- `/artist/[mbid]` — deliberately minimal: photo, name, genres, studio discography
  in chronological order. Each album is a `ResultCard`, so you can rate from here.
- `/library` — your saved albums and songs, with filters and sorting
- `/library` splits albums and songs into two headed sections rather than one grid.
  An album cover and a single track side by side read as the same kind of thing when
  they are not. The status tabs and sort apply across both; the old
  Everything/Albums/Songs dropdown is gone as redundant. An empty section is left
  out, so a library of only albums carries no permanent "Songs 0". The `Song` badge
  stays on the card because the same card is reused on the home "Recently added"
  strip, where the two types *are* still mixed.
- `/stats` — the charts, from the tracking data. `?range=30|90|365|all` scopes the
  Activity section only
- `/settings` — per-account preferences: the rating mode, and which stats blocks
  to draw
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

## Discover, on the landing page

Two rows under the search hero: suggested albums, then artists to explore. Seeded
from the genres the library already has (`AlbumLog.genres`, denormalised, so the
seed costs no catalogue call), falling back to a fixed list of broad genres for an
account with none yet. `src/lib/discover.ts` picks and gates the seeds;
`discoverByGenre` in `catalog.ts` fetches them.

**Genre search is the entire surface.** Everything else that could power this is
gone — verified against the live API, not the docs:

| endpoint | result |
| --- | --- |
| `/recommendations`, `/recommendations/available-genre-seeds` | **404** |
| `/artists/{id}/related-artists`, `/audio-features`, `/browse/new-releases` | 403 |
| `/artists/{id}/top-tracks`, `/artists?ids=` (batch) | 403 |
| `/artists/{id}` (single), `/search` | 200 |

`track.popularity` is **null** on every search result, alongside the artist genres
and followers already documented below. So there is no popularity signal, no
similarity signal, and no recommender. Don't go looking for the ones the older
Spotify docs describe; adding `user-top-read` would change which genres seed the
search, not what answers it.

Five things this is built on, each of which was a wrong guess first:

- **Album search with `genre:` returns zero results.** Not "ignores the filter" —
  an empty page, for every genre tried. So the albums are the albums the matched
  *tracks* came from, deduped, with anything not `album_type: "album"` dropped,
  because a genre track search is mostly singles.
- **Broad genres are the ones Spotify indexes well; narrow ones are junk.** This is
  the opposite of the obvious theory, and the obvious theory was implemented first.
  Ranking seeds by how *distinctive* they were to the library — preferring
  `piano rock` over its parent `rock` — produced a row of Casey Stratton, Jan Rot
  and Lee Han Chul, while `indie rock` returns Arctic Monkeys and Tame Impala.
  Spotify's micro-genres are populated by long-tail and knockoff uploads. So
  `rankSeeds` weights by support, with rating as the multiplier rather than the
  ranking.
- **The artist count is a free quality gate on a seed.** Genres Spotify covers well
  return 5–10 artists from the same request; the junk ones return 0–1. `CANDIDATES`
  seeds are fetched in parallel and the ones under `ARTIST_QUALITY_MIN` discarded,
  which costs one extra request rather than a second round-trip.
- **The albums row is keyed by artist, not album id.** A genre track search returns
  many tracks by the same popular artist, each mapping to a different album, so
  keying by id gives six distinct rows that are three Laufey records. The artists
  row then excludes anyone whose record sits in the row above it.
- **The artists row cannot rely on artist search.** `genre:"indie rock"` returns
  artists; `genre:"alternative r&b"` and `genre:"singer-songwriter"` return none,
  because the withdrawal of artist genres took much of that index with it. So the
  track artists come back from the same response as a fallback — and since
  `/artists?ids=` is 403, only the few actually being displayed get hydrated, one
  request each.

Album yield is the other reason for paging: a narrow genre returns one album per
ten tracks, so six cannot be filled from one page. `getDiscover` pages a second
time **only when it comes up short**, so the common case stays at one request per
seed. Rows turn over daily rather than per load (`today()` picks the seeds and
shifts the offset), which is also what makes the 5-minute fetch cache worth having.

Already-saved albums and artists are filtered out, artists by id *and* lowercased
name, because rows saved before `artistMbid` existed have no id. An empty result
renders no section rather than an empty one.

Grid columns are sized to divide into six exactly (`grid-cols-3 md:grid-cols-6`,
artists `grid-cols-3 sm:grid-cols-6`). A fixed-length row in a grid sized for
something else leaves two orphans on the end and reads as a grid that ran out.

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

The sync **control** lives inside the Want to Listen tab, not the page header. In
the header it read as "sync whatever I am looking at" — you would press it from
All expecting all of it. The control is passed into `LibraryView` as a node rather
than imported there, so the view stays unaware of Spotify; it is only involved
because it owns the filter state.

The OAuth notice and the stale-playlist warning stayed in the header on purpose.
The notice greets you on the default tab when you land back from Spotify, and a
warning you would only see after clicking the right tab is not a warning — the
whole point of `playlistSyncFailedAt` is that a silent failed sync is worse than
none.

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

## Setting up on a machine that has never run this

There is one database. `DATABASE_URL` points at the same Supabase instance the
deployed site uses, so **a local dev server is working on live data** — an album
added while poking around locally is on the website at the next refresh, and a
deletion is just as real. There is no seed database and no sync step.

`.env.local` is gitignored, so a fresh clone has the code and none of the
configuration. That is the whole of the difference between "it just works on my
other machine" and a day of debugging — the other machine has the file. **Copy
`.env.local` across rather than rebuilding it**, changing only `AUTH_URL` (and
`SPOTIFY_REDIRECT_URI` if it is not already loopback) to suit the new host.

Two traps if you try to rebuild it instead. Both present as something other than
what they are:

**`vercel env pull` cannot return a Sensitive variable, and does not say so.**
Every variable on this project is typed Sensitive, which is write-only by design —
unreadable through the CLI or the API. The pull still reports success and still
writes a complete-looking file, with the literal string `[SENSITIVE]` as the value
of every secret. So `DATABASE_URL`, `AUTH_SECRET` and both Spotify keys arrive as
eleven characters of nothing, the app fails with `Spotify token failed: 400` and
`Can't reach database server`, and the file looks perfectly populated. Check
`vercel env ls` for the Sensitive type before trusting a pull. The deployed site is
unaffected — Vercel injects the real values at runtime on its own infrastructure.

**Supabase's direct host is IPv6-only.** `db.<ref>.supabase.co` publishes an `AAAA`
record and no `A` record, so on a network without IPv6 it is unreachable at any
password — and the error is `Can't reach database server`, which reads as a wrong
password or a paused project. The connection string the dashboard shows first is
that direct one. Local dev needs the **pooler** instead, which is IPv4:

    DATABASE_URL  postgres.<ref>@aws-0-us-east-1.pooler.supabase.com:6543  (+ ?pgbouncer=true&connection_limit=1)
    DIRECT_URL    postgres.<ref>@aws-0-us-east-1.pooler.supabase.com:5432

Note the username changes from `postgres` to `postgres.<ref>`, so the direct string
cannot simply have its host swapped. The pooler is behind **Connect** in the top bar
of the Supabase project, not under Settings → Database, which is why it is easy to
miss. Which pooler is not guessable — this project is on `aws-0`, and `aws-1`
answers `Tenant or user not found`. That error distinguishes the two without a
password, if it is ever needed again.

Everything else about the login path is ordinary, with one exception worth knowing:
`src/app/login/page.tsx` collapses every `AuthError` into `?error=1`, so a database
that is unreachable — or a Supabase free project paused after ~7 days idle — presents
to the user as *wrong email or password*.

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

**Never let a bearer token be baked into a Next-cached fetch.** `api()` in
`catalog.ts` caches with `next: { revalidate: 300 }`, and a cached entry revalidates
using the `Authorization` header it was *created* with. App tokens last an hour, so
any cached path that outlives its token starts returning 401 — and the 401 is cached
in its place, so it never recovers. It presents as the entire catalogue dying about
an hour into an uptime, search included, while the same URL with a freshly minted
token returns 200 by hand. `api()` therefore clears `appToken` on a 401 and retries
once with `cache: "no-store"`; the retry *must* bypass the cache or it is handed the
very response it is retrying because of.

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

## Spotify has no popularity left, so Deezer answers that

`GET /artists/{id}` lost `genres`, `popularity` and `followers` in 2026. As of
August 2026 `popularity` is gone from **track and album objects too** — absent
from the payload, not empty. Verified directly. So the catalogue can no longer
say whether a record is one people play.

`src/lib/popularity.ts` gets that from Deezer, which needs no credentials and —
the part that makes it affordable — answers in batches:

    /album/{id}/tracks     every track's rank in one request
    /artist/{id}/albums    every album's fan count in one request

That is why it appears on the album and artist routes and **not on search**:
those cost two cached requests each, while search would cost one lookup per
result. Popularity is context for something you are already looking at.

Four things to keep right:

- **The two numbers are not the same kind of thing.** `fans` is absolute and
  comparable between albums, which is what makes a discography readable at a
  glance. `rank` is only meaningful against other tracks on the same record, so
  it is sent raw and the app draws it as a bar rather than printing a number
  nobody can interpret.
- **Match the artist by follower count, not by name alone.** Searching Deezer for
  "Radiohead" returns a soundalike with 492 followers *ahead* of the band — exact
  name, wrong artist — and its empty discography then silently attaches no numbers
  to anything. The same trap the catalogue hit with "Beatles HC" on MusicBrainz.
  Most-followed exact match wins.
- **It is not a rating.** It says what people play, not what is good. The copy says
  "fans" for that reason; anything vaguer implies a play count nobody publishes.
- **It must never fail the page.** Every lookup returns null on error and results
  are cached for a week in `MbCache` — which is a plain url → body store despite
  the name, and is reused rather than duplicated.

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

## Settings, and switchable stats modules

`/settings` holds everything that changes how the app behaves for one account:
the rating mode, and which blocks `/stats` draws. Preferences live there rather
than beside the thing they affect — the ranking switch used to sit on `/library`,
where it read as part of the library rather than as a setting.

`src/lib/stats-modules.ts` is the registry, and it is the contract between the two
pages: settings draws a switch per entry, stats wraps each block in `show(id)`.
Three rules keep them honest:

- **A module listed in the registry but not checked on the stats page is a switch
  that silently does nothing.** Adding a block means both halves.
- **Ids are stored in the database.** Renaming one silently un-hides that module
  for everyone who had switched it off. Treat them as permanent; unknown ids are
  dropped on write so a *removed* module leaves nothing behind.
- **The stored list is the hidden one, not the visible one.** A module added later
  then shows up for everyone by default, instead of being invisible to every
  existing account until they go and find it.

Sections disappear with their contents (`anyShown(...)` around the whole
`<section>`, heading included), and the Overview drops its two-column split when
only one half is on, so a lone block does not sit in a narrow column beside empty
space. Switching *everything* off gets an explanatory empty state rather than a
blank page, which reads as broken.

`setStatsHidden` takes the entire list rather than one id, so two switches flipped
quickly cannot race into a lost update.

The + menu is three status buttons and nothing else. **The rate prompt is owned by
the card, not the popover.** It used to be rendered inside the popover, which broke
it outright: the prompt portals to `document.body`, so it sits outside the card ref,
and the card closes its menu on any `pointerdown` outside that ref — unmounting the
popover and the prompt inside it before any button in the prompt could be clicked.
It looked like the prompt was refusing to rate. Anything portalled must be a sibling
of the popover, with state the menu closing cannot touch.

Marking something **Listened** opens the rate prompt, for a
first rating only — re-marking an already-rated item is not a request to re-rate
it. The prompt opens *after* the status write lands: both paths upsert the same
row, and firing them together races two writes at one record. The prompt carries
the buckets with the slider beneath them, so neither path is hidden behind the
other, and an X because rating is a prompt and not a demand — the status change
is already saved by then. With ranking off it degrades to the slider alone, and
writes through `rateItem` rather than `rateByNumber` so it does not start
building a ladder for someone who never opted in.

**The switch knob needs an explicit `left-0`.** It is absolutely positioned inside
the track and moved with `translate-x`, and without `left-0` its start position
comes from the button's UA `text-align: center` — so it begins near the middle and
the translate pushes it clean outside the track. It renders as a stray dot beside
the pill. Both switches had this.

## Statuses

Two: `LISTENED` and `WANT`. `src/lib/statuses.ts` is the single list — the labels
were previously copied into three components and the stats page, which is exactly
how a set like this drifts. It imports nothing, because client components use it.

A third, `LISTENING`, was removed as unused: no row ever held it. Removing a status
is not just a UI edit — `saveToLibrary` validates against the list, because a page
cached from before the change can still post the old value, and a row holding a
status the UI no longer offers is invisible in every filter: in the library,
reachable from nothing.

The status chart keeps Listened on the hue it had when there were three, rather
than shifting it up a slot. Colour follows the entity, not the row number.

## Comparison ranking (the Beli model)

Optional, per user, toggled on `/settings`. When it is on, **you never type a score.**
You put the item in one of three coarse buckets, answer a few "which did you like
more?" questions, and the number is derived from where it landed. Comparing two
records you know is a question you can answer honestly; "is this a 7.4 or a 7.8"
is not.

- `src/lib/ranking.ts` — bands, score derivation, placement, seeding
- `src/components/RankFlow.tsx` — the modal, and `useRankingMode`
- `src/components/RankingToggle.tsx` — the switch
- `src/app/actions.ts` — `setRankingEnabled`, `getComparisonSetup`,
  `rateByComparison`, `rateByNumber`, `rankingMode`

**The order decides who is above whom; typed numbers are anchors the rest are
derived around.** An item rated by comparison has no number of its own — it takes
one from the gap between the nearest manually-set scores above and below it (or
the band edges). An item whose score was typed keeps that score exactly, for ever,
until it is re-rated.

The first version derived *every* score from slot position, which is wrong on a
small library and was shipped before it was caught: a bucket holding one album has
exactly one slot, so every number from 6.8 to 10 produced the same 8.4 and the
slider was visibly inert. `deriveBucketScores` is the fix, and the reason
`placeItem` takes an `exactScore` — the typed number has to be written *before*
the re-score, or the recompute derives a score from the slot and overwrites the
very number being set.

A useful consequence: turning the toggle on no longer rewrites any existing
rating. Seeded items are manual, so they are all anchors.

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

## The iOS app, and the API it talks to

There is a native SwiftUI client at `~/Developer/recordcrate-ios`. It is a **thin
client**: it renders, and this app does the thinking. Search ranking, the ranking
ladder, tracking, enrichment and the playlist sync all stay here, so they keep
being correct for both surfaces instead of being reimplemented against the same
traps a second time in Swift.

`src/app/api/mobile/*` is its API. Nine routes, all JSON:

| Route | |
| --- | --- |
| `POST /auth/login`, `/auth/register` | credentials in, bearer token out |
| `GET /me` | who the token is, plus status counts |
| `GET /search?q=&type=&limit=` | all three result types; auth optional |
| `GET /album/[id]`, `/artist/[id]` | detail, with the user's standing on each item |
| `GET /library` | every saved row, unpaged |
| `POST /library`, `/library/rate`, `/library/remove` | the three mutations |
| `GET /stats?range=` | the whole dashboard, plus the user's hidden-module list |
| `GET /spotify`, `POST`, `DELETE` | link status, run the sync, disconnect |
| `GET /spotify/link` | the OAuth URL to open |
| `GET /ranking?itemType=`, `PUT` | whether comparisons apply; the on/off switch |
| `POST /ranking/setup`, `/compare`, `/score` | candidates, a placement, a typed score |
| `GET /discover` | the two suggestion rows; auth optional |

Popularity rides along on the album and artist routes — see below.

Four things about it are load-bearing:

**1. The writes are shared, not copied.** `src/lib/library-write.ts` holds
`saveToLibraryFor`, `rateItemFor` and `removeFromLibraryFor`, each taking an
explicit `userId`. `src/app/actions.ts` is now a set of thin wrappers that resolve
the session, call those, and revalidate; the route handlers resolve a bearer token
and call the same functions. **Do not add a mutation to `actions.ts` that isn't in
`library-write.ts`** — the app would silently not have it, and the two paths would
start to drift on things like the song-identity fallback, which is precisely the
kind of rule that is only right in one place by accident.

Nothing in `library-write.ts` calls `revalidatePath`. Cache invalidation belongs to
the caller that has pages to invalidate; from a route handler serving JSON it is
meaningless work.

**2. Auth is a parallel path, not a way into the session.** `src/lib/mobile-auth.ts`
signs its own HS256 JWT with `AUTH_SECRET` — the same secret, because a second one
is a second thing to forget to set on Vercel, but a different algorithm and
different claims, so a mobile token and a NextAuth session cookie will never
validate each other. That is intended. Only the credentials provider is offered:
GitHub sign-in is a browser redirect flow, and such an account has no `password` to
check.

The `authed()` wrapper answers **401**, never a redirect to `/login`. A native
client cannot follow a redirect to an HTML page — it would see a 200 full of
markup and no way to tell that anything went wrong.

**3. A 401 only signs the app out when a token was actually sent.** A failed
sign-in also answers 401, and treating that as an expiry would clear the keychain
of a session that is still good: mistyping a password would log you out. The check
is on the presence of the `Authorization` header, in `APIClient.send`.

**4. Every write response is read back from the database, not echoed.** A rating
comes back clamped and rounded, so the app can never show a number the database
disagrees with. More importantly, a *song* write may land on a row stored under a
different track id — the title+artist rule — so echoing the request would hand the
client an id its own library doesn't contain. Both `POST /library` and
`/library/rate` re-select the row and return that.

`Info.plist` in the iOS project carries `NSAllowsLocalNetworking` so the app can
reach a dev server over plain HTTP. That is the narrow exception, not
`NSAllowsArbitraryLoads`; production is HTTPS and unaffected.

**5. Spotify linking works without a second redirect URI.** Spotify only accepts
the redirect URIs registered in its dashboard, and there is no reason connecting
from the app should require adding one — so `/api/spotify/callback` now serves
both clients and tells them apart by the `state`:

- **Website.** A random string matched against an httpOnly cookie. Ends on
  `/library` with a notice, exactly as before.
- **App.** A short-lived JWT naming the user, signed with `AUTH_SECRET`
  (`issueLinkState`). There is no cookie to match, because the consent screen runs
  in an `ASWebAuthenticationSession` rather than the browser that started the
  flow — so the *signature* is what proves the callback belongs to a flow this
  server started. Ends on `recordcrate://spotify?status=…`, which is what closes
  the web view.

The app branch is checked first and only succeeds on a validly signed state, so a
browser that merely lacks a session cannot fall into it. A separate JWT audience
from the session token means neither can be spent as the other.

The sync itself is `exportWantToListenFor(userId)` in `src/lib/spotify-export.ts`,
split out of `spotify-actions.ts` on the same principle as the library writes —
a two-way sync whose correctness rests on `PlaylistTrack` recording exactly what
this app added must not exist twice.

**6. The ranking ladder is shared too.** `src/lib/ranking-flow.ts` holds
`comparisonSetupFor`, `rateByComparisonFor`, `rateByNumberFor`,
`setRankingEnabledFor` and `rankingModeFor`; `actions.ts` is wrappers over them.
This one matters more than the others: the ladder's correctness rests on rules
that are only right in one place by accident — the seed direction, the re-score
ordering, a typed score being written *before* the recompute — and every one of
them is a silent wrong-answer bug, not a crash. A second implementation in Swift
would have re-earned all five.

The app therefore runs the identical flow: the setup call sends every candidate
once, the binary search runs on the device so answering costs no request, and only
the final slot is submitted for the server to re-resolve and re-score. `needed`
comes back on the setup response as well as on `/ranking`, so the sheet can say
*why* it is offering a slider instead of comparisons.

**A tie is a third answer, and it bounds a neighbourhood rather than asserting
equality.** "Too close to call" does not settle the rating. It says the item
belongs *near* a rung — and the one question that cannot resolve which side of that
rung it falls on is the one just declined — so the app asks up to two more, about
the **neighbours** either side, which are a genuinely easier call. The result is
`tiedWithId` plus `tieSide` on `/ranking/compare`.

`scoreBesideNeighbour` then places the score just above or just below that rung,
capped twice: at `TIE_DELTA` (0.3), and at **half the gap** to whatever sits on
that side. The second cap is the important one — in a tightly packed bucket the
neighbours can be a tenth apart, and a flat ±0.3 would leapfrog a record the user
was never asked about, silently reordering the ladder. Measured: tying against 8.7
with 9.5 above gives 9.0; with 8.9 above it gives 8.8.

Writing the two as the *same* number, which an earlier version did, says something
the user did not — a tie is a claim that a difference is small, not that there
isn't one — and it makes two records indistinguishable in every list that sorts by
score.

The result still anchors (`ratingSource: "TIED"`), because a floating score would
not survive the next recompute: `deriveBucketScores` spreads a run of floating
items evenly across the gap between anchors, so a carefully placed near-tie would
drift. `recomputeBucket` therefore treats **anything that is not `COMPARISON`** as
an anchor rather than checking for `MANUAL` — a fourth source would inherit the
safe behaviour, where a `=== "MANUAL"` check would silently have made it float.

`ratingSource` is a String column read only by `ranking.ts`, so `TIED` needed no
migration — but anything that starts reading it must treat unknown values as
anchors, not assume the set is two.

Still web-only, and deliberately so: `/settings` and its stats-module switches.
The ranking on/off switch is on the app's Profile tab, since `/settings` is not
ported and the flow is unreachable without it.

**The app's chart palette is purple, and the website's is not.** `src/lib/viz.ts`
keeps its validated blue/orange/green; the app rebuilt the same structure around
its brand purple so the dashboard matches the tab bar and the score badges. The
two rules that make either set honest are unchanged in both — three fixed
categorical slots that never cycle, one colour for nominal categories. If the
website ever wants to match, that set needs re-validating rather than copying.

The **stats** dashboard is in the app, from the same `getDashboard()` call, and it
honours `User.statsHidden`: the switches stay on the website rather than the app
offering a second, disagreeing set of preferences. `/api/mobile/stats` also sends
the module registry, so a block added to `STATS_MODULES` appears in the app
without an app release. The range control scopes Activity only, and the grain is
chosen server-side — otherwise a client could ask for 365 daily buckets and draw
365 columns four pixels wide.

## Known Limitations
- Songs are stored under a MusicBrainz *recording* id, which has no page of its own, so
  saved songs don't link anywhere. Song cards in search link to the album the song
  first appeared on.
- Album ratings and track ratings are independent rows. Rating every track on an album
  does not rate the album.
- The `Review` model exists in the schema but has no UI. See `ARCHIVE.md` section 10.

## Features To Build
- [ ] Reviews UI (schema is already there)
