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
| Search, default (all three sections) | 4 |
| Search, `type=artists` | 1 |
| Search, `type=albums` or `type=songs` | 2–3 |
| Album page | 2 |
| Artist page | 2 |

So a cold default search takes roughly 4 seconds. Everything is cached for an hour
in-process, and repeat searches are instant. Artwork comes from iTunes, which is not
rate limited, so image lookups are free of this budget.

**2. Search ranking is hand-tuned, on purpose.** MusicBrainz relevance alone is bad
for this use case: searching "radiohead" returns interview bootlegs with the word in
their *title*, while Radiohead's actual studio albums rank below the top 75. So
`search.ts` detects when a query names an artist (from credits already present in the
results — free, no extra request) and then browses that artist's discography by id.
Traps already hit and defended against, all with tests you can re-run by hand:
- an obscure band is named "Bohemian Rhapsody" — exact *title* matches must outrank
  exact *artist* matches
- a hardcore band is named "Beatles HC" — a partial name match on one obscure release
  must not hijack the query
- "The Beatles" *contains* "beatles" without starting with it, so candidate matching
  has to allow substrings, gated on prominence (`hits >= 3`)

If you change ranking, re-check these queries: `radiohead`, `beatles`, `the beatles`,
`kendrick lamar`, `kid a`, `bohemian rhapsody`.

## Known Limitations
- MusicBrainz publishes no popularity data, so for a title shared by many works
  (e.g. "bohemian rhapsody", which is also a Smetana piece) the famous version lands
  in the top few rather than reliably first. Fixing this properly needs a second data
  source.
- Songs are stored under a MusicBrainz *recording* id, which has no album page of its
  own, so saved songs don't link anywhere. Song cards in search link to the album the
  song first appeared on.
- The `Review` model exists in the schema but has no UI. See `ARCHIVE.md` section 10.

## Features To Build
- [ ] Reviews UI (schema is already there)
