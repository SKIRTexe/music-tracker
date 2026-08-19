import { mbFetch } from "@/lib/musicbrainz";

/** A single search hit — either an album (release-group) or a song (recording). */
export interface SearchItem {
  /** release-group id for albums, recording id for songs. Also the library key. */
  id: string;
  itemType: "ALBUM" | "SONG";
  title: string;
  artistName: string;
  artistMbid?: string;
  year: string | null;
  /** Cover Art Archive URL to try first, if there's anything to look it up from. */
  coverArtUrl: string | null;
  /** What /album/[mbid] should be given, or null if there's no album to open. */
  detailId: string | null;
  /** Songs only: the album this recording first appeared on. */
  parentAlbum?: string;
}

export interface SearchResults {
  albums: SearchItem[];
  songs: SearchItem[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strip Lucene operators so user input can't break the query. */
function luceneTerm(query: string): string {
  const escaped = query
    .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\s/.test(escaped) ? `"${escaped}"` : escaped;
}

// ── MusicBrainz response shapes ────────────────────────────────────────────────

interface MBArtistCredit {
  artist: { id: string; name: string };
}

interface MBReleaseGroupHit {
  id: string;
  title: string;
  score?: number;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "artist-credit"?: MBArtistCredit[];
}

interface MBRecordingHit {
  id: string;
  title: string;
  score?: number;
  "artist-credit"?: MBArtistCredit[];
  releases?: Array<{ id: string; title: string; date?: string }>;
}

// ── Ranking ────────────────────────────────────────────────────────────────────

/** Interviews, karaoke and tribute discs match text queries but are never wanted. */
const JUNK_PATTERN =
  /\b(interview|q\s*&\s*a|karaoke|tribute|covered? by|cover version|instrumental version|as made famous by|in the style of|ringtone|beatstrumental|unplugged album)\b/i;

/** Bootlegs are titled by date and venue — "2004-05-01: Coachella Festival, ...". */
const BOOTLEG_PATTERN = /^\d{4}[-‐–]\d{2}[-‐–]\d{2}\s*[::]/;

function isJunkTitle(title: string): boolean {
  return JUNK_PATTERN.test(title) || BOOTLEG_PATTERN.test(title);
}

/** Alternate takes are the same song — the canonical version should come first. */
const VARIANT_PATTERN =
  /\b(live|acoustic|demo|remix|edit|instrumental|reprise|rehearsal|session|mono|alternate|early version|radio edit|extended)\b/i;

function isVariantTitle(title: string): boolean {
  return VARIANT_PATTERN.test(title);
}

/**
 * MusicBrainz relevance alone puts bootlegs and interview discs above the records
 * people actually mean. Re-rank locally — it costs no extra requests.
 */
function rank(
  query: string,
  title: string,
  artistName: string,
  mbScore: number,
  hasDate: boolean
): number {
  const q = normalize(query);
  const t = normalize(title);
  const a = normalize(artistName);

  let score = mbScore / 100; // 0–1 baseline from MusicBrainz

  // An exact title match outweighs an exact artist match. Obscure acts name
  // themselves after famous records ("Bohemian Rhapsody" is a band), and a genuine
  // artist query is served by the discography path rather than by this ranking.
  if (t === q) score += 4;
  else if (q.length >= 3 && t.startsWith(q)) score += 1;

  if (a === q) score += 2;
  else if (q.length >= 4 && a.startsWith(q)) score += 1.5;
  else if (q.length >= 4 && a.includes(q)) score += 0.75;

  // Entries with no date are usually unofficial or poorly catalogued.
  if (hasDate) score += 0.4;
  if (isJunkTitle(title)) score -= 3;

  return score;
}

// ── Mapping ────────────────────────────────────────────────────────────────────

function albumFromReleaseGroup(rg: MBReleaseGroupHit): SearchItem {
  const credit = rg["artist-credit"]?.[0]?.artist;
  const date = rg["first-release-date"];
  return {
    id: rg.id,
    itemType: "ALBUM",
    title: rg.title,
    artistName: credit?.name ?? "Unknown Artist",
    artistMbid: credit?.id,
    year: date ? date.slice(0, 4) : null,
    // CAA serves art per release-group, picking that album's canonical cover.
    coverArtUrl: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
    detailId: rg.id,
  };
}

function songFromRecording(rec: MBRecordingHit): SearchItem {
  const credit = rec["artist-credit"]?.[0]?.artist;
  // Earliest release gives the original album rather than a later compilation.
  const release = [...(rec.releases ?? [])].sort((a, b) =>
    (a.date ?? "9999").localeCompare(b.date ?? "9999")
  )[0];
  return {
    id: rec.id,
    itemType: "SONG",
    title: rec.title,
    artistName: credit?.name ?? "Unknown Artist",
    artistMbid: credit?.id,
    year: release?.date ? release.date.slice(0, 4) : null,
    coverArtUrl: release ? `https://coverartarchive.org/release/${release.id}/front-250` : null,
    detailId: release?.id ?? null,
    parentAlbum: release?.title,
  };
}

// ── Artist detection ───────────────────────────────────────────────────────────

/**
 * Work out whether the query is naming an artist, using the credits already present
 * in the album results. Free — no extra request. This matters because a text search
 * for "radiohead" surfaces bootlegs with the word in their *title*; the artist's real
 * studio albums are only reachable by browsing their discography by id.
 */
function detectArtist(
  query: string,
  groups: MBReleaseGroupHit[]
): { id: string; name: string; hits: number; exact: boolean } | null {
  const q = normalize(query);
  if (q.length < 3) return null;

  const tally = new Map<string, { id: string; name: string; hits: number; exact: boolean }>();
  for (const rg of groups) {
    const artist = rg["artist-credit"]?.[0]?.artist;
    if (!artist) continue;
    const name = normalize(artist.name);
    const exact = name === q;
    // "The Beatles" contains "beatles" without starting with it, and "Kendrick
    // Lamar" contains "kendrick" — both are things people actually type.
    const partial =
      (q.length >= 4 && name.startsWith(q)) || (q.length >= 5 && name.includes(q));
    if (!exact && !partial) continue;

    const entry = tally.get(artist.id);
    if (entry) entry.hits += 1;
    else tally.set(artist.id, { id: artist.id, name: artist.name, hits: 1, exact });
  }

  // Prefer an exact name match, then whichever artist appears most often.
  const best = [...tally.values()].sort(
    (a, b) => Number(b.exact) - Number(a.exact) || b.hits - a.hits
  )[0];
  return best
    ? { id: best.id, name: best.name, hits: best.hits, exact: best.exact }
    : null;
}

/**
 * Decide whether to treat the query as naming an artist. Obscure acts share names
 * with famous albums — searching "kid a" must return Radiohead's record, not the
 * discography of a one-release artist called Kid A. A well-known artist shows up
 * across many release-groups in the text results; a name collision shows up once.
 */
function isArtistLed(
  artist: { hits: number; exact: boolean } | null,
  exactTitleMatches: number
): boolean {
  if (!artist) return false;
  // A prolific artist dominates the results either way.
  if (artist.hits >= 3) return true;
  // A partial name match on a single obscure release is not enough: searching
  // "beatles" once matched a hardcore band called "Beatles HC" and returned their
  // discography instead of the Fab Four's records.
  if (!artist.exact) return false;
  return exactTitleMatches === 0;
}

/** An artist's own albums, studio records first, then live/compilations. */
async function artistDiscography(
  artist: { id: string; name: string },
  limit: number
): Promise<SearchItem[]> {
  try {
    const data = await mbFetch(
      "/release-group",
      { artist: artist.id, type: "album", inc: "artist-credits", limit: String(limit) },
      "high"
    );
    const groups = (data as { "release-groups"?: MBReleaseGroupHit[] })["release-groups"] ?? [];

    const mapped = groups.map((rg) => ({
      item: albumFromReleaseGroup(rg),
      // Live albums, compilations and remix collections are real but shouldn't lead.
      secondary: (rg["secondary-types"] ?? []).length > 0,
    }));

    const studio = mapped.filter((m) => !m.secondary && !isJunkTitle(m.item.title));
    const rest = mapped.filter((m) => m.secondary || isJunkTitle(m.item.title));

    const byYear = (a: { item: SearchItem }, b: { item: SearchItem }) =>
      (a.item.year ?? "9999").localeCompare(b.item.year ?? "9999");

    return [...studio.sort(byYear), ...rest.sort(byYear)].map((m) => ({
      ...m.item,
      artistName: m.item.artistName === "Unknown Artist" ? artist.name : m.item.artistName,
      artistMbid: m.item.artistMbid ?? artist.id,
    }));
  } catch { return []; }
}

// ── Search ─────────────────────────────────────────────────────────────────────

async function albumTextSearch(term: string): Promise<MBReleaseGroupHit[]> {
  try {
    const data = await mbFetch(
      "/release-group",
      {
        query: `(releasegroup:${term} OR artist:${term}) AND primarytype:Album`,
        limit: "75",
      },
      "high"
    );
    return (data as { "release-groups"?: MBReleaseGroupHit[] })["release-groups"] ?? [];
  } catch { return []; }
}

async function songSearch(term: string, artistMbid: string | null): Promise<MBRecordingHit[]> {
  // When the query names an artist, search only their catalogue. Someone typing
  // "radiohead" wants Radiohead's songs, not obscure tracks *titled* "Radiohead" —
  // and those title matches score high enough to crowd everything else out.
  const query = artistMbid ? `arid:${artistMbid}` : `recording:${term}`;
  try {
    const data = await mbFetch("/recording", { query, limit: "75" }, "high");
    return (data as { recordings?: MBRecordingHit[] }).recordings ?? [];
  } catch { return []; }
}

function rankSongs(query: string, recordings: MBRecordingHit[], limit: number): SearchItem[] {
  // Collapse re-recordings and reissues, keeping the most-released version.
  const best = new Map<string, { rec: MBRecordingHit; releaseCount: number }>();
  for (const rec of recordings) {
    const artist = rec["artist-credit"]?.[0]?.artist?.name ?? "";
    const key = `${normalize(rec.title)}|${normalize(artist)}`;
    const releaseCount = rec.releases?.length ?? 0;
    const existing = best.get(key);
    if (!existing || releaseCount > existing.releaseCount) {
      best.set(key, { rec, releaseCount });
    }
  }

  const ranked = [...best.values()]
    .map(({ rec, releaseCount }) => {
      const item = songFromRecording(rec);
      const base = rank(query, item.title, item.artistName, rec.score ?? 0, !!item.year);
      // Appearing on many releases is a strong popularity signal; damp it so it
      // cannot drown out an exact title match.
      const popularity = Math.min(1.5, Math.log10(releaseCount + 1));
      const variantPenalty = isVariantTitle(item.title) ? 1.5 : 0;
      return { item, score: base + popularity - variantPenalty };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);

  return dedupe(ranked, limit);
}

/**
 * Drop exact duplicates, and cap how many entries may share a title. Covers,
 * karaoke versions and classical pieces of the same name otherwise fill the whole
 * page — a search for "bohemian rhapsody" returned twenty of them.
 */
function dedupe(items: SearchItem[], limit: number, maxPerTitle = 3): SearchItem[] {
  const seen = new Set<string>();
  const titleCounts = new Map<string, number>();
  const out: SearchItem[] = [];

  for (const item of items) {
    const title = normalize(item.title);
    const key = `${title}|${normalize(item.artistName)}`;
    if (seen.has(key)) continue;

    const count = titleCounts.get(title) ?? 0;
    if (count >= maxPerTitle) continue;

    seen.add(key);
    titleCounts.set(title, count + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Search albums and songs together. Shares one artist-detection step, which keeps
 * this to three MusicBrainz requests — they are rate limited to roughly one per
 * second, so request count is the main cost.
 */
export async function search(
  query: string,
  opts: { albums?: boolean; songs?: boolean; limit?: number } = {}
): Promise<SearchResults> {
  const { albums: wantAlbums = true, songs: wantSongs = true, limit = 24 } = opts;
  const term = luceneTerm(query);
  if (!term) return { albums: [], songs: [] };

  // Album text search doubles as artist detection, so it runs even for a songs-only
  // search — unless there is nothing to detect from.
  const groups = await albumTextSearch(term);
  const detected = detectArtist(query, groups);

  const normalizedQuery = normalize(query);
  const exactTitleMatches = groups.filter(
    (g) => normalize(g.title) === normalizedQuery
  ).length;
  const artist = isArtistLed(detected, exactTitleMatches) ? detected : null;

  const [discography, recordings] = await Promise.all([
    wantAlbums && artist ? artistDiscography(artist, 100) : Promise.resolve([]),
    wantSongs ? songSearch(term, artist?.id ?? null) : Promise.resolve([]),
  ]);

  let albums: SearchItem[] = [];
  if (wantAlbums) {
    const textMatches = groups
      .map((rg) => {
        const item = albumFromReleaseGroup(rg);
        const secondary = (rg["secondary-types"] ?? []).length > 0;
        return {
          item,
          score:
            rank(query, item.title, item.artistName, rg.score ?? 0, !!item.year) -
            (secondary ? 1 : 0),
        };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);

    // An artist's own discography leads; title matches fill in behind it.
    albums = dedupe([...discography, ...textMatches], limit);
  }

  return {
    albums,
    songs: wantSongs ? rankSongs(query, recordings, limit) : [],
  };
}
