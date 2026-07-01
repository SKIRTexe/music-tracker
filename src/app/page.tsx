import {
  searchAlbums,
  searchArtists,
  searchTags,
  getGenreAlbums,
  getGenreArtists,
  getDecadeAlbums,
} from "@/lib/musicbrainz";
import { resolveAlbumArtwork, resolveArtistArtwork } from "@/lib/artwork";
import type { MBAlbum } from "@/lib/musicbrainz";

export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Carousel } from "@/components/Carousel";
import { ArtistCarousel } from "@/components/ArtistCarousel";
import { AlbumCard } from "@/components/AlbumCard";
import { ArtistCard } from "@/components/ArtistCard";
import { FavoriteGenreButton } from "@/components/FavoriteGenreButton";
import { YearRangeSlider, YEAR_MIN, YEAR_MAX } from "@/components/YearRangeSlider";
import Link from "next/link";

const DECADE_TAGLINES: Record<string, string> = {
  "1950s": "Birth of Rock 'n' Roll",
  "1960s": "Revolution & Psychedelia",
  "1970s": "Disco, Funk & Punk",
  "1980s": "Synths, MTV & New Wave",
  "1990s": "Grunge, Hip-Hop & Britpop",
  "2000s": "Digital Revolution",
  "2010s": "Streaming Era",
  "2020s": "A New Decade",
};

// Genre list: [label, tag, related tags...]
const GENRE_LIST: { label: string; tag: string; related: { label: string; tag: string }[] }[] = [
  { label: "Rock",           tag: "rock",           related: [{ label: "Alternative Rock", tag: "alternative rock" }, { label: "Indie Rock", tag: "indie rock" }, { label: "Classic Rock", tag: "classic rock" }, { label: "Punk Rock", tag: "punk rock" }] },
  { label: "Hip-Hop",        tag: "hip-hop",        related: [{ label: "Rap", tag: "rap" }, { label: "Trap", tag: "trap" }, { label: "R&B", tag: "r&b" }, { label: "Boom Bap", tag: "boom bap" }] },
  { label: "Jazz",           tag: "jazz",           related: [{ label: "Bebop", tag: "bebop" }, { label: "Smooth Jazz", tag: "smooth jazz" }, { label: "Blues", tag: "blues" }, { label: "Soul Jazz", tag: "soul jazz" }] },
  { label: "Electronic",     tag: "electronic",     related: [{ label: "House", tag: "house" }, { label: "Techno", tag: "techno" }, { label: "Ambient", tag: "ambient" }, { label: "Drum and Bass", tag: "drum and bass" }] },
  { label: "Pop",            tag: "pop",            related: [{ label: "Synth-Pop", tag: "synth-pop" }, { label: "Indie Pop", tag: "indie pop" }, { label: "Dream Pop", tag: "dream pop" }, { label: "Art Pop", tag: "art pop" }] },
  { label: "Soul",           tag: "soul",           related: [{ label: "R&B", tag: "r&b" }, { label: "Funk", tag: "funk" }, { label: "Gospel", tag: "gospel" }, { label: "Neo Soul", tag: "neo soul" }] },
  { label: "Metal",          tag: "metal",          related: [{ label: "Heavy Metal", tag: "heavy metal" }, { label: "Death Metal", tag: "death metal" }, { label: "Black Metal", tag: "black metal" }, { label: "Doom Metal", tag: "doom metal" }] },
  { label: "Folk",           tag: "folk",           related: [{ label: "Indie Folk", tag: "indie folk" }, { label: "Country", tag: "country" }, { label: "Bluegrass", tag: "bluegrass" }, { label: "Singer-Songwriter", tag: "singer-songwriter" }] },
  { label: "Classical",      tag: "classical",      related: [{ label: "Opera", tag: "opera" }, { label: "Baroque", tag: "baroque" }, { label: "Orchestral", tag: "orchestral" }, { label: "Chamber Music", tag: "chamber music" }] },
  { label: "Indie",          tag: "indie",          related: [{ label: "Indie Rock", tag: "indie rock" }, { label: "Indie Pop", tag: "indie pop" }, { label: "Lo-Fi", tag: "lo-fi" }, { label: "Post-Rock", tag: "post-rock" }] },
  { label: "Punk",           tag: "punk",           related: [{ label: "Punk Rock", tag: "punk rock" }, { label: "Post-Punk", tag: "post-punk" }, { label: "Hardcore", tag: "hardcore" }, { label: "Ska", tag: "ska" }] },
  { label: "R&B",            tag: "r&b",            related: [{ label: "Soul", tag: "soul" }, { label: "Neo Soul", tag: "neo soul" }, { label: "Funk", tag: "funk" }, { label: "Hip-Hop", tag: "hip-hop" }] },
  { label: "Blues",          tag: "blues",          related: [{ label: "Jazz", tag: "jazz" }, { label: "Soul", tag: "soul" }, { label: "Rock and Roll", tag: "rock and roll" }, { label: "Delta Blues", tag: "delta blues" }] },
  { label: "Country",        tag: "country",        related: [{ label: "Folk", tag: "folk" }, { label: "Bluegrass", tag: "bluegrass" }, { label: "Americana", tag: "americana" }, { label: "Alt-Country", tag: "alt-country" }] },
  { label: "Reggae",         tag: "reggae",         related: [{ label: "Ska", tag: "ska" }, { label: "Dub", tag: "dub" }, { label: "Dancehall", tag: "dancehall" }, { label: "Rocksteady", tag: "rocksteady" }] },
  { label: "Funk",           tag: "funk",           related: [{ label: "Soul", tag: "soul" }, { label: "Disco", tag: "disco" }, { label: "R&B", tag: "r&b" }, { label: "Jazz-Funk", tag: "jazz-funk" }] },
  { label: "Disco",          tag: "disco",          related: [{ label: "Funk", tag: "funk" }, { label: "Dance", tag: "dance" }, { label: "House", tag: "house" }, { label: "Soul", tag: "soul" }] },
  { label: "Ambient",        tag: "ambient",        related: [{ label: "Electronic", tag: "electronic" }, { label: "New Age", tag: "new age" }, { label: "Drone", tag: "drone" }, { label: "Experimental", tag: "experimental" }] },
  { label: "House",          tag: "house",          related: [{ label: "Electronic", tag: "electronic" }, { label: "Techno", tag: "techno" }, { label: "Deep House", tag: "deep house" }, { label: "Disco", tag: "disco" }] },
  { label: "Experimental",   tag: "experimental",   related: [{ label: "Avant-Garde", tag: "avant-garde" }, { label: "Noise", tag: "noise" }, { label: "Ambient", tag: "ambient" }, { label: "Electronic", tag: "electronic" }] },
];

function formatGenreLabel(q: string): string {
  return q.trim().split(/[\s-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Always returns a genre suggestion — static list is used only to find related genres.
// Any tag is valid on MusicBrainz so we always offer a genre page for the query.
function getGenreSuggestion(q: string): { label: string; tag: string; related: { label: string; tag: string }[] } {
  const s = q.trim().toLowerCase();
  const label = formatGenreLabel(q);

  const fromRelated = (matched: { label: string; tag: string }, parent: typeof GENRE_LIST[number]) => ({
    label: matched.label,
    tag: matched.tag,
    related: [
      { label: parent.label, tag: parent.tag },
      ...parent.related.filter((r) => r.tag !== matched.tag).slice(0, 3),
    ],
  });

  // Exact match on top-level
  const exact = GENRE_LIST.find((g) => g.tag === s || g.label.toLowerCase() === s);
  if (exact) return exact;

  // Exact match in related lists
  for (const g of GENRE_LIST) {
    const rel = g.related.find((r) => r.tag === s || r.label.toLowerCase() === s);
    if (rel) return fromRelated(rel, g);
  }

  // Starts-with on top-level
  const starts = GENRE_LIST.find((g) => g.tag.startsWith(s) || g.label.toLowerCase().startsWith(s));
  if (starts) return starts;

  // Starts-with in related lists
  for (const g of GENRE_LIST) {
    const rel = g.related.find((r) => r.tag.startsWith(s) || r.label.toLowerCase().startsWith(s));
    if (rel) return fromRelated(rel, g);
  }

  // Contains on top-level
  const contains = GENRE_LIST.find((g) => g.tag.includes(s) || g.label.toLowerCase().includes(s));
  if (contains) return contains;

  // Contains in related lists
  for (const g of GENRE_LIST) {
    const rel = g.related.find((r) => r.tag.includes(s) || r.label.toLowerCase().includes(s));
    if (rel) return fromRelated(rel, g);
  }

  // No static match — still return a genre card for the raw query
  return { label, tag: s, related: [] };
}

function detectDecade(q: string): string | null {
  const s = q.trim().toLowerCase().replace(/^the\s+/, "");
  // "1950s" … "2020s" or "1950" … "2020"
  const full = s.match(/^(19[5-9]0|20[012]0)s?$/);
  if (full) return `${full[1]}s`;
  // "50s" … "90s", "00s", "10s", "20s"
  const short = s.match(/^([5-9]0|0[012]0?|[12]0)s?$/);
  if (short) {
    const n = parseInt(short[1]);
    const century = n >= 50 ? 1900 : 2000;
    const base = n < 10 ? n * 10 : n; // handle "0s" edge case
    return `${century + base}s`;
  }
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const GENRES = [
  { label: "Rock", tag: "rock" },
  { label: "Hip-Hop", tag: "hip-hop" },
  { label: "Jazz", tag: "jazz" },
  { label: "Electronic", tag: "electronic" },
  { label: "Pop", tag: "pop" },
  { label: "R&B / Soul", tag: "soul" },
  { label: "Classical", tag: "classical" },
  { label: "Metal", tag: "metal" },
  { label: "Indie", tag: "indie" },
  { label: "Folk", tag: "folk" },
];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string; from?: string; to?: string }>;
}) {
  const { q, mode, from: fromParam, to: toParam } = await searchParams;
  const fromYear = fromParam ? Math.max(YEAR_MIN, parseInt(fromParam)) : YEAR_MIN;
  const toYear = toParam ? Math.min(YEAR_MAX, parseInt(toParam)) : YEAR_MAX;
  const isDateFiltered = fromYear !== YEAR_MIN || toYear !== YEAR_MAX;
  const isArtistMode = mode === "artists";
  const session = await auth();
  const isLoggedIn = !!session?.user;

  // ── Search mode ────────────────────────────────────────────────────────────
  if (q) {
    const decadeSlug = detectDecade(q);
    const genreMatch = getGenreSuggestion(q);
    const [artists, albums, mbTags] = await Promise.all([
      searchArtists(q, 10),
      searchAlbums(q, 25),
      searchTags(q, 8),
    ]);

    // If the static list found no related genres, use MusicBrainz tag results
    // (excluding the query itself as the primary card already covers it)
    if (genreMatch.related.length === 0 && mbTags.length > 0) {
      genreMatch.related = mbTags
        .filter((t) => t.name.toLowerCase() !== q.trim().toLowerCase())
        .slice(0, 5)
        .map((t) => ({ label: formatGenreLabel(t.name), tag: t.name }));
    }

    const total = artists.length + albums.length + (decadeSlug ? 1 : 0) + 1;

    return (
      <div className="max-w-5xl mx-auto">
        <div className="sticky top-0 z-40 -mx-4 px-4 bg-zinc-950 border-b border-zinc-800/60 pt-4 pb-3 mb-8 flex flex-col gap-3">
          <SearchBar defaultValue={q} mode="albums" />
        </div>
        <p className="text-xs text-zinc-600 mb-6">
          {total} results for &ldquo;{q}&rdquo;
        </p>

        {/* Decade page result */}
        {decadeSlug && (
          <div className="mb-8">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Page</p>
            <Link
              href={`/decade/${decadeSlug}`}
              className="inline-flex items-center gap-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors px-5 py-4"
            >
              <div>
                <p className="text-2xl font-bold text-zinc-100 leading-none mb-1">{decadeSlug}</p>
                <p className="text-xs text-zinc-500">{DECADE_TAGLINES[decadeSlug]}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 tracking-wide shrink-0">
                Decade Page
              </span>
            </Link>
          </div>
        )}

        {/* Genre page results */}
        <div className="mb-8">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Genre Pages</p>
            <div className="flex flex-wrap gap-3">
              {/* Primary match */}
              <Link
                href={`/genre/${encodeURIComponent(genreMatch.tag)}`}
                className="inline-flex items-center gap-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors px-5 py-4"
              >
                <div>
                  <p className="text-2xl font-bold text-zinc-100 leading-none mb-1">{genreMatch.label}</p>
                  <p className="text-xs text-zinc-500">Browse {genreMatch.label} albums &amp; artists</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 tracking-wide shrink-0">
                  Genre Page
                </span>
              </Link>
              {/* Related genres */}
              {genreMatch.related.map(({ label, tag }) => (
                <Link
                  key={tag}
                  href={`/genre/${encodeURIComponent(tag)}`}
                  className="inline-flex items-center gap-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-600 transition-colors px-4 py-3"
                >
                  <p className="text-sm font-medium text-zinc-300 leading-none">{label}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 tracking-wide shrink-0">
                    Related
                  </span>
                </Link>
              ))}
            </div>
        </div>

        {/* Artists */}
        {artists.length > 0 && (
          <div className="mb-8">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Artists</p>
            <div className="flex flex-wrap gap-4">
              {artists.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          </div>
        )}

        {/* Albums */}
        {albums.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Albums</p>
            <div className="flex flex-wrap gap-4">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} isLoggedIn={isLoggedIn} />
              ))}
            </div>
          </div>
        )}

        {total === 0 && (
          <p className="text-zinc-600 text-sm">No results found.</p>
        )}
      </div>
    );
  }

  // ── Fetch favorites ────────────────────────────────────────────────────────
  const favoriteTags = new Set<string>();
  if (session?.user?.id) {
    const favs = await prisma.favoriteGenre.findMany({
      where: { userId: session.user.id },
      select: { tag: true },
    });
    favs.forEach((f) => favoriteTags.add(f.tag));
  }

  const sortedGenres = [
    ...GENRES.filter((g) => favoriteTags.has(g.tag)),
    ...GENRES.filter((g) => !favoriteTags.has(g.tag)),
  ];

  // ── Artists mode ───────────────────────────────────────────────────────────
  if (isArtistMode) {
    const artistGenreResults = await Promise.all(
      sortedGenres.map(({ tag }) => getGenreArtists(tag, 50))
    );

    const shuffledArtistGenre = artistGenreResults.map((pool) => shuffle(pool).slice(0, 16));

    const seenArtistIds = new Set<string>();
    const recommendedArtistPool = sortedGenres
      .flatMap((_, i) => shuffle(artistGenreResults[i] ?? []).slice(0, 5))
      .filter((a) => { if (seenArtistIds.has(a.id)) return false; seenArtistIds.add(a.id); return true; });
    const recommendedArtists = shuffle(recommendedArtistPool).slice(0, 16);

    // Pre-resolve artist artwork server-side
    const displayedArtists = [...recommendedArtists, ...shuffledArtistGenre.flat()];
    const uniqueArtists = [...new Map(displayedArtists.map((a) => [a.id, a])).values()];
    await Promise.all(
      uniqueArtists.map(async (artist) => {
        const url = await resolveArtistArtwork(artist.name);
        if (url) artist.imageUrl = url;
      })
    );

    return (
      <div className="max-w-5xl mx-auto">
        <div className="sticky top-0 z-40 -mx-4 px-4 bg-zinc-950 border-b border-zinc-800/60 pt-4 pb-3 mb-8 flex flex-col gap-3">
          <ModeToggle mode="artists" />
          <SearchBar defaultValue="" mode="artists" />
        </div>
        <ArtistCarousel title="Recommended Artists" artists={recommendedArtists} />
        {sortedGenres.map(({ label, tag }, i) => (
          <ArtistCarousel
            key={label}
            title={label}
            artists={shuffledArtistGenre[i] ?? []}
            href={`/genre/${encodeURIComponent(tag)}`}
          />
        ))}
      </div>
    );
  }

  // ── Albums mode (default) ──────────────────────────────────────────────────
  const genreResults = await Promise.all(
    sortedGenres.map(({ tag }) =>
      isDateFiltered
        ? getDecadeAlbums(fromYear, toYear, tag, 20)
        : getGenreAlbums(tag, 50)
    )
  );

  // Shuffle once — same result used for pre-resolution and render
  const shuffledGenre = genreResults.map((pool) => shuffle(pool).slice(0, 16));

  // Build Recommended by sampling across all genre pools — diverse + cycles well
  const seenIds = new Set<string>();
  const recommendedPool = sortedGenres
    .flatMap((_, i) => shuffle(genreResults[i] ?? []).slice(0, 5))
    .filter((a) => { if (seenIds.has(a.id)) return false; seenIds.add(a.id); return true; });
  const recommended = shuffle(recommendedPool).slice(0, 16);

  // Pre-resolve iTunes artwork for every displayed album in parallel.
  // Results are cached in src/lib/artwork.ts — after first load, all instant.
  const displayed = [...recommended, ...shuffledGenre.flat()];
  const unique = [...new Map(displayed.map((a) => [a.id, a])).values()];
  await Promise.all(
    unique.map(async (album) => {
      const artist = (album as MBAlbum)["artist-credit"]?.[0]?.artist?.name ?? "";
      const url = await resolveAlbumArtwork(album.title, artist);
      if (url) album.coverUrl = url;
    })
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="sticky top-0 z-40 -mx-4 px-4 bg-zinc-950 border-b border-zinc-800/60 pt-4 pb-3 mb-8 flex flex-col gap-3">
        <ModeToggle mode="albums" />
        <SearchBar defaultValue="" mode="albums" />
        <YearRangeSlider initialFrom={fromYear} initialTo={toYear} />
      </div>

      <Carousel
        title={isDateFiltered ? `${fromYear} – ${toYear}` : "Recommended"}
        albums={recommended}
        isLoggedIn={isLoggedIn}
        href="/recommended"
      />

      {sortedGenres.map(({ label, tag }, i) => (
        <Carousel
          key={label}
          title={label}
          albums={shuffledGenre[i] ?? []}
          isLoggedIn={isLoggedIn}
          href={`/genre/${encodeURIComponent(tag)}`}
          tag={tag}
          favoriteButton={
            isLoggedIn ? (
              <FavoriteGenreButton tag={tag} isFavorite={favoriteTags.has(tag)} />
            ) : undefined
          }
        />
      ))}
    </div>
  );
}

function ModeToggle({ mode }: { mode: "albums" | "artists" }) {
  return (
    <div className="flex border border-zinc-800 rounded overflow-hidden text-xs w-fit">
      <Link
        href="/"
        className={`px-4 py-2 transition-colors ${
          mode === "albums"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Albums
      </Link>
      <Link
        href="/?mode=artists"
        className={`px-4 py-2 border-l border-zinc-800 transition-colors ${
          mode === "artists"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Artists
      </Link>
    </div>
  );
}

function SearchBar({ defaultValue, mode }: { defaultValue: string; mode: "albums" | "artists" }) {
  return (
    <form method="GET" className="flex gap-2">
      {mode === "artists" && <input type="hidden" name="mode" value="artists" />}
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="Search albums, artists, or decades..."
        autoComplete="off"
        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm text-zinc-300 transition-colors"
      >
        Search
      </button>
    </form>
  );
}
