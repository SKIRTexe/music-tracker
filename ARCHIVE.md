# Archived Features

Everything listed here was **built and working** but cut to ship the MVP. No code was
lost — it all lives in git at the tag **`pre-mvp-archive`** (commit `4ab0c6a`).

## How to bring a feature back

Ask me: **"pull the [feature name] back in"** and I'll restore it from the tag and
re-wire it into the current codebase.

To do it manually:

```bash
# See a file as it was
git show pre-mvp-archive:src/app/location/[slug]/page.tsx

# Restore a file (or a whole directory) into the working tree
git checkout pre-mvp-archive -- src/app/location src/components/WorldMapPicker.tsx

# Browse everything that existed at the archive point
git ls-tree -r --name-only pre-mvp-archive src/
```

Most features need three things restored together: the **page**, its **API route(s)**,
and the **MusicBrainz query functions** from `src/lib/musicbrainz.ts`. Each entry below
lists all three. Note that `src/lib/musicbrainz.ts` was *trimmed* rather than deleted, so
restoring a query function means copying it out of the tagged version of that file, not
checking the whole file out (that would clobber the current one).

---

## 1. Location / Country Browsing

Browse music by where the artist is *from* — not where the record was pressed. A country
or city page showed that place's top genres, its artists, and its albums, with a year-range
filter on top.

**What it did**
- `/location/united-states`, `/location/london`, etc. — a page per place
- Interactive, zoomable, pannable SVG world map for picking a country
- A "Countries" dropdown in the discover header for quick jumps
- Location tags on album pages, resolved from the artist's origin
- Aggregated a place's top genres by tallying tags across its artists
- Year-range slider (1950–present) to filter a location's albums by era

**Files**
- Pages: `src/app/location/[slug]/page.tsx`
- API: `src/app/api/location-albums/`, `location-artists/`, `location-genres/`, `location-search/`, `artist-location/`
- Components: `WorldMapPicker.tsx`, `CountriesDropdown.tsx`, `LocationAlbumsSection.tsx`, `LazyArtistLocation.tsx`, `YearRangeSlider.tsx`
- Lib: `getLocationAlbums()`, `getLocationArtists()`, `getLocationTopGenres()`, `searchAlbumsByArtists()` in `musicbrainz.ts`
- Types: `src/types/react-simple-maps.d.ts`
- Dependency: **`react-simple-maps`** (removed from `package.json` — reinstall it)

**Why cut:** the heaviest feature in the app. Each location page ran a two-step
MusicBrainz query (find artists in place → find albums by those artists), which was slow
and rate-limit prone. Also the single biggest chunk of client JS, because of the map.

---

## 2. Genre Pages & Favorite Genres

A landing page per genre, plus the ability to pin your favorites so they float to the top
of the discover feed.

**What it did**
- `/genre/rock`, `/genre/hip-hop` — genre hub with a slideshow header, albums, and artists
- `/genre/[tag]/albums` and `/genre/[tag]/artists` — full paginated grids
- Star a genre to sort it to the top of the homepage (`FavoriteGenre` table)
- Fuzzy genre matching in search: typing "shoegaze" or "trip hop" suggested the genre page
- A curated map of 20 top-level genres, each with 4 related sub-genres

**Files**
- Pages: `src/app/genre/[tag]/page.tsx`, `genre/[tag]/albums/page.tsx`, `genre/[tag]/artists/page.tsx`
- API: `src/app/api/genre-albums/`, `genre-artists/`, `genre-singles/`
- Components: `FavoriteGenreButton.tsx`, `GenreSlideshow.tsx`, `ExpandableAlbums.tsx`, `ExpandableArtists.tsx`
- Lib: `getGenreAlbums()`, `getGenreArtists()`, `searchTags()` in `musicbrainz.ts`
- Homepage: the `GENRE_LIST`, `getGenreSuggestion()`, and `formatGenreLabel()` helpers in `src/app/page.tsx`
- **Database:** the `FavoriteGenre` model in `prisma/schema.prisma` and the
  `favoriteGenres` relation on `User`. Restoring this needs a migration.

**Why cut:** genre browsing is discovery, not core logging. The `FavoriteGenre` table was
the only thing besides logs writing to the DB, so cutting it simplified the Postgres move.

---

## 3. Discover Homepage (Genre Carousels)

The old homepage: ten lazy-loaded horizontal carousels (Rock, Hip-Hop, Jazz, Electronic,
Pop, R&B/Soul, Classical, Metal, Indie, Folk), each scrolling through albums in that genre.
Had an Albums/Artists mode toggle and a year-range filter.

**What it did**
- Carousels loaded on scroll-into-view via `IntersectionObserver`, so the page shell was instant
- Long-press any cover for a quick add/rate popup without leaving the page
- Albums/Artists toggle switched every row to artist cards
- Your starred genres sorted to the top

**Files**
- `src/app/page.tsx` (the whole non-search branch of the old version)
- Components: `LazyLocationCarousel.tsx` (exports `LazyLocationAlbumCarousel` / `LazyLocationArtistCarousel`), `Carousel.tsx`, `ArtistCarousel.tsx`
- API: `src/app/api/genre-albums/route.ts` (the carousel data source)

**Why cut:** ten carousels meant ten concurrent MusicBrainz searches on every homepage
visit. This was the direct cause of the load-time problems. The MVP homepage is a search
bar and your recent additions — zero external calls.

---

## 4. Artist Pages

A full page per artist: biography, discography, band lineup, and similar artists.

**What it did**
- `/artist/[mbid]` — artist hub
- Wikipedia biography with expand/collapse
- Albums and singles sections, deduplicated across pressings
- **Band members** with instruments and their years active, from MusicBrainz relations
- **Similar artists**, ranked by how many genre tags they shared with the current artist
- Artist photos resolved from the iTunes CDN

**Files**
- Page: `src/app/artist/[artistMbid]/page.tsx`
- API: `src/app/api/similar-artists/`, `artist-singles/`
- Components: `BandMembers.tsx`, `ArtistSlideshow.tsx`, `LazySimilarArtists.tsx`, `ArtistCard.tsx`, `ArtistCarousel.tsx`
- Lib: `getArtist()`, `getArtistAlbums()`, `getSimilarArtists()`, `getFeaturedArtists()` in `musicbrainz.ts`
- Also: `resolveArtistArtwork()` in `src/lib/artwork.ts`, and the artist branch of `src/app/api/artwork/route.ts`

**Why cut:** the similar-artists ranking fired five parallel MusicBrainz tag searches per
page load. Search now surfaces an artist's albums directly (searching "Radiohead" returns
Radiohead albums), which covers the main reason you'd visit an artist page.

**Note:** artist names are currently plain text. Restoring this feature means re-linking
them in `AlbumCard.tsx` and `LibraryView.tsx` — the `artistMbid` is still stored on every
library row, so the data is ready.

---

## 5. Decade Pages

`/decade/1970s` — browse an era, with genre sub-filtering.

**What it did**
- `/decade` index listing every decade from the 1950s on, each with a tagline
  ("1970s — Disco, Funk & Punk")
- `/decade/[decade]` with albums of that era, filterable by genre
- Search detected decade queries: "70s", "1990s", "the 80s" all resolved to a decade page
- Album cards linked their release year to the matching decade

**Files**
- Pages: `src/app/decade/page.tsx`, `src/app/decade/[decade]/page.tsx`
- Lib: `getDecadeAlbums()` in `musicbrainz.ts`
- Homepage: `detectDecade()` and `DECADE_TAGLINES` in `src/app/page.tsx`
- Also: the year → decade link in `AlbumCard.tsx`

**Why cut:** pure discovery surface, and MusicBrainz date-range queries were slow.

---

## 6. Wikipedia Enrichment

Album and artist pages pulled "About" and "History" sections from Wikipedia, with
expand/collapse after three paragraphs.

**Files**
- Lib: `src/lib/wikipedia.ts` (`getWikipediaArticle()`)
- Component: `ExpandableText.tsx`
- Used by: album, artist, genre, decade, and location pages

**Why cut:** an extra uncached external API call on the critical path of every album page.
Cheap to restore and probably the best value-per-line of anything in here — good candidate
for the first thing to add back.

---

## 7. Album Art Slideshow

Album pages showed all Cover Art Archive images — front, back, inserts, vinyl labels — as
a swipeable slideshow above the album header.

**Files**
- Component: `ImageSlideshow.tsx`
- Lib: `getAlbumImages()`, `getCoverArtUrl()` in `musicbrainz.ts`

**Why cut:** an extra Cover Art Archive request per album page for what is usually one
image. The MVP shows a single cover. `resolveAlbumArtwork()` in `src/lib/artwork.ts` was
**kept** — it's the iTunes-then-CAA fallback chain that makes covers show up reliably.

---

## 8. Recommendations

`/recommended` — album suggestions derived from your library.

**Files**
- Page: `src/app/recommended/page.tsx`
- Lib: `getFeaturedAlbums()`, `getFeaturedArtists()` in `musicbrainz.ts` (queried MusicBrainz's `tag:essential`)

**Why cut:** it was a stub — never finished. Worth rebuilding properly rather than
restoring: with real rating data, "you rated these highly, here's more like them" is a
much better recommender than the `tag:essential` approach.

---

## 9. Public Profiles

`/profile/[userId]` — a placeholder page, never built out. The intent was a public
Letterboxd-style profile: someone's listening history, ratings, and reviews.

**Files:** `src/app/profile/[userId]/page.tsx`

**Why cut:** never implemented. Build fresh when you add following/social features.

---

## 10. Reviews (Never Surfaced)

The `Review` model still exists in `prisma/schema.prisma` — written text reviews attached
to a library entry, one-to-many. **No UI was ever built for it.** The table is kept because
it's the natural next feature and dropping it would just mean another migration later.

To ship it you need: a review form on the album page, review display, and a server action
in `src/app/actions.ts`. The schema is ready as-is.

---

## What changed around the archived code

Restoring a feature isn't always a straight `git checkout` — some of the code it used
was rewritten, not just deleted. Expect to adapt these:

- **`AlbumCard.tsx` → `ResultCard.tsx`.** The old long-press-to-open quick menu was
  replaced with a visible **+** button and a popover. Anything restored that rendered
  `<AlbumCard album={...}>` needs `<ResultCard item={...}>`, and the prop is a
  `SearchItem`, not a raw `MBAlbum`.
- **Search moved to `src/lib/search.ts`** and now searches **release-groups** (canonical
  albums) and **recordings** (songs). The old `searchAlbums`/`getGenreAlbums` etc.
  searched **releases** (individual pressings) and returned `MBAlbum`. Restored code
  calling those functions needs rewriting against the new types, or copy the old
  functions out of the tagged `musicbrainz.ts`.
- **Album ids changed meaning.** `/album/[mbid]` now takes a *release-group* id and
  resolves a representative release internally; it still accepts a release id as a
  fallback. Archived pages that linked using release ids still work.
- **Server actions were consolidated.** `addAlbumToLibrary` and `rateAlbumAction` (7
  positional args each) became `saveToLibrary(item, status)` and `rateItem(item, rating)`
  taking a `LibraryItemInput` object. `addToLibrary` and `updateStatus` were unused
  and are gone.
- **`AlbumLog` gained `itemType` and `parentAlbum`** so songs and albums can share the
  table. Restored code that writes library rows should set `itemType`.
- **MusicBrainz is now throttled to ~1 request/second** (`MB_REQUEST_GAP_MS`). The
  archived features were built against a 50ms gap, which is 20× over MusicBrainz's
  published limit and gets the IP blocked. **Any feature restored from the tag must be
  re-checked for request count** — the discover page's ten parallel genre carousels
  would now take ~11 seconds, so it needs rethinking (fewer rows, or caching in
  Postgres) rather than a straight restore.

## Also removed

- **`StatusSelect.tsx`, `CoverImage.tsx`** — dead components, not imported anywhere even
  before the cut.
- **`src/app/search/page.tsx`** — a "coming soon" placeholder. Real search lives at `/?q=`.
- **MusicBrainz priority queue** — *kept*, in `src/lib/musicbrainz.ts`. The request
  queue, in-process cache, in-flight deduplication, and high/low priority tiers are all
  still there and still doing real work for search and album pages.
