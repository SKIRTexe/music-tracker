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
