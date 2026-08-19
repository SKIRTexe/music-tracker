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
Only 8 routes exist. Keep it that way unless a feature is being deliberately added.

- `/` — search landing; with `?q=` it becomes the results page (`&type=albums|songs`)
- `/album/[mbid]` — album detail, tracklist, add/rate
- `/library` — your saved albums and songs, with filters and sorting
- `/login`, `/register`, `/api/auth/*` — auth
- `/api/artwork` — cover-art fallback (iTunes) for covers the CAA is missing

## Key Files
- `src/lib/search.ts` — all search logic and result ranking (see below)
- `src/lib/musicbrainz.ts` — request queue, cache, and album detail lookup
- `src/lib/artwork.ts` — iTunes → Cover Art Archive artwork resolution, memoised
- `src/app/actions.ts` — the only mutations: `saveToLibrary`, `rateItem`, `removeFromLibrary`
- `src/components/ResultCard.tsx` — a search hit (album or song) + add/rate popover
- `src/components/LibraryItemCard.tsx` — a saved item, shared by `/` and `/library`

## Two Things That Will Bite You

**1. MusicBrainz rate limiting is real.** Anonymous clients get roughly *one request
per second*, and exceeding it gets the IP blocked — which looks exactly like an outage
(`TypeError: fetch failed`, not an HTTP error). `MB_REQUEST_GAP_MS` in
`src/lib/musicbrainz.ts` enforces the gap; do not lower it. Set `MB_CONTACT` to real
contact info, because MusicBrainz also blocks fake User-Agents. Search costs at most
3 MusicBrainz requests, and request count is the main budget — spend it carefully.

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
