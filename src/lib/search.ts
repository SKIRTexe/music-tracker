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

/** An artist (band or person) hit. */
export interface ArtistItem {
  id: string;
  name: string;
  /** MusicBrainz's own note disambiguating same-named artists, e.g. "UK punk band". */
  disambiguation?: string;
  /** "Group" or "Person" where MusicBrainz knows. */
  kind?: string;
  country?: string;
}

export interface SearchResults {
  albums: SearchItem[];
  songs: SearchItem[];
  artists: ArtistItem[];
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
  /**
   * MusicBrainz records "live, 2000-10-17: Sears Theatre…" here rather than in the
   * title, so variant detection has to read it or live takes outrank studio ones.
   */
  disambiguation?: string;
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

interface MBArtistHit {
  id: string;
  name: string;
  score?: number;
  disambiguation?: string;
  type?: string;
  country?: string;
}

/**
 * Artists matching the query. Ranked by MusicBrainz's own score, with exact and
 * prefix name matches pulled forward so "queen" leads with Queen.
 */
export async function searchArtists(query: string, limit = 18): Promise<ArtistItem[]> {
  const term = luceneTerm(query);
  if (!term) return [];

  try {
    const data = await mbFetch("/artist", { query: term, limit: "40" }, "high");
    const artists = (data as { artists?: MBArtistHit[] }).artists ?? [];
    const q = normalize(query);

    return artists
      .map((a) => {
        const name = normalize(a.name);
        // MusicBrainz's artist scoring is genuinely good — for "beatles" it gives
        // The Beatles 100 and nothing else above 72 — so it leads here, with name
        // matching only as a tiebreak. Weighting the name bonuses more heavily put
        // a band called "Beatles HC" above The Beatles.
        let score = ((a.score ?? 0) / 100) * 4;
        if (name === q) score += 1.5;
        else if (q.length >= 3 && name.startsWith(q)) score += 0.4;
        else if (q.length >= 4 && name.includes(q)) score += 0.2;
        return { a, score };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map(({ a }) => ({
        id: a.id,
        name: a.name,
        disambiguation: a.disambiguation,
        kind: a.type,
        country: a.country,
      }));
  } catch { return []; }
}

/** An artist's own albums, studio records first, then live/compilations. */
export async function artistDiscography(
  artist: { id: string; name: string },
  limit: number,
  opts: { studioOnly?: boolean } = {}
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

    // The artist page wants the real discography, not 90 live bootlegs after it.
    const ordered = opts.studioOnly
      ? studio.sort(byYear)
      : [...studio.sort(byYear), ...rest.sort(byYear)];

    return ordered.map((m) => ({
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
  // These can't be one `recording:X OR arid:Y` query. MusicBrainz caps results at
  // the top 75 by its own relevance, and for "radiohead" all 75 go to interview
  // clips and radio sessions with the word in the title — the actual songs never
  // appear. Searching only the artist's catalogue breaks title queries just as
  // badly: a band named "Karma Police" exists, and it displaced Radiohead's song.
  // So always search by title, and add the catalogue when the query names an
  // artist. Ranking decides which leads.
  const [byTitle, byArtist] = await Promise.all([
    recordingQuery(`recording:${term}`),
    artistMbid ? recordingQuery(`arid:${artistMbid}`) : Promise.resolve([]),
  ]);
  return [...byTitle, ...byArtist];
}

async function recordingQuery(query: string): Promise<MBRecordingHit[]> {
  try {
    const data = await mbFetch("/recording", { query, limit: "75" }, "high");
    return (data as { recordings?: MBRecordingHit[] }).recordings ?? [];
  } catch { return []; }
}

function rankSongs(
  query: string,
  recordings: MBRecordingHit[],
  limit: number,
  artistMbid: string | null,
  discographySize: number,
  albumArtistIds: Set<string>
): SearchItem[] {
  const q = normalize(query);

  // Score every recording first, then collapse. Collapsing on release count alone
  // picked a *live* take of "Karma Police" as Radiohead's representative, which then
  // took the variant penalty and lost to covers.
  const scored = recordings.map((rec) => {
    const item = songFromRecording(rec);
    const releaseCount = rec.releases?.length ?? 0;
    const base = rank(query, item.title, item.artistName, rec.score ?? 0, !!item.year);
    // How many releases carry a recording is the only popularity signal
    // MusicBrainz gives us. Damped so it can't drown out a title match.
    const popularity = Math.min(1.5, Math.log10(releaseCount + 1));
    // "live, 2000-10-17: …" and "demo" usually sit in the disambiguation, not the title.
    const variantText = `${item.title} ${rec.disambiguation ?? ""}`;
    const variantPenalty = isVariantTitle(variantText) ? 1.5 : 0;
    const junkPenalty = isJunkTitle(variantText) && !isJunkTitle(item.title) ? 3 : 0;

    return {
      item,
      releaseCount,
      titleMatch: normalize(item.title) === q,
      fromNamedArtist: !!artistMbid && item.artistMbid === artistMbid,
      score: base + popularity - variantPenalty - junkPenalty,
    };
  });

  const best = new Map<string, (typeof scored)[number]>();
  for (const entry of scored) {
    const key = `${normalize(entry.item.title)}|${normalize(entry.item.artistName)}`;
    const existing = best.get(key);
    if (!existing || entry.score > existing.score) best.set(key, entry);
  }
  const entries = [...best.values()];

  /**
   * Does the query name a song or the artist? Both readings have a same-named
   * artist in play ("Radiohead" the band, "Karma Police" the band), so the question
   * is which artist is the one people mean.
   *
   * Discography size answers it, and we already fetched it: Radiohead has ~100
   * release-groups, the band called Karma Police has 3. Release counts can't be
   * used here — MusicBrainz truncates the `releases` array in search results, so
   * nothing in a response exceeds about 3 regardless of actual popularity.
   */
  const titleMatches = entries.filter((e) => e.titleMatch);
  const artistIsProminent = discographySize >= 8;
  const artistIntent = !!artistMbid && (artistIsProminent || titleMatches.length === 0);

  const ranked = entries
    .map((e) => {
      let score = e.score;
      if (artistIntent) {
        if (e.fromNamedArtist) score += 4;
      } else if (e.titleMatch) {
        score += 4;
        /**
         * Which of fifty same-titled recordings is the real one? The album results
         * for this same query already name the artist — searching "bohemian
         * rhapsody" returns release-groups credited to Queen — so an artist
         * appearing on both sides is very likely the canonical performer.
         *
         * This carries the decision because the per-recording signals don't:
         * Queen's recording comes back with no release date at all, so the
         * "original predates its covers" test below scores it zero while dated
         * covers collect a bonus.
         */
        if (e.item.artistMbid && albumArtistIds.has(e.item.artistMbid)) score += 2;

        const year = e.item.year ? parseInt(e.item.year) : null;
        if (year) score += (2030 - year) / 25;
      }
      return { item: e.item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);

  return dedupe(ranked, limit, { exemptTitle: q });
}

/**
 * Drop exact duplicates, and cap how many entries may share a title. Covers,
 * karaoke versions and classical pieces of the same name otherwise fill the whole
 * page — a search for "bohemian rhapsody" returned twenty of them.
 */
function dedupe(
  items: SearchItem[],
  limit: number,
  opts: { maxPerTitle?: number; exemptTitle?: string } = {}
): SearchItem[] {
  const { maxPerTitle = 3, exemptTitle } = opts;
  const seen = new Set<string>();
  const titleCounts = new Map<string, number>();
  const out: SearchItem[] = [];

  for (const item of items) {
    const title = normalize(item.title);
    const key = `${title}|${normalize(item.artistName)}`;
    if (seen.has(key)) continue;

    // The cap must not apply to the title actually being searched for: every result
    // legitimately shares it, and capping at three hid Queen's "Bohemian Rhapsody"
    // behind three covers.
    const count = titleCounts.get(title) ?? 0;
    if (title !== exemptTitle && count >= maxPerTitle) continue;

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
  opts: { albums?: boolean; songs?: boolean; artists?: boolean; limit?: number } = {}
): Promise<SearchResults> {
  const {
    albums: wantAlbums = true,
    songs: wantSongs = true,
    artists: wantArtists = true,
    limit = 24,
  } = opts;
  const term = luceneTerm(query);
  if (!term) return { albums: [], songs: [], artists: [] };

  // Queued first so it runs alongside the album/song pipeline rather than after it.
  const artistsPromise = wantArtists
    ? searchArtists(query, limit)
    : Promise.resolve([] as ArtistItem[]);

  // The album text search doubles as artist detection, so it runs for a songs-only
  // search too — but not when only artists were asked for.
  const groups = wantAlbums || wantSongs ? await albumTextSearch(term) : [];
  const detected = detectArtist(query, groups);

  const normalizedQuery = normalize(query);
  const exactTitleMatches = groups.filter(
    (g) => normalize(g.title) === normalizedQuery
  ).length;
  const artist = isArtistLed(detected, exactTitleMatches) ? detected : null;

  const [discography, recordings, artistResults] = await Promise.all([
    // Fetched whenever an artist was detected, not only when albums are wanted:
    // its size is how song ranking tells a prominent artist from a name collision,
    // so skipping it would make the Songs tab disagree with the All tab.
    artist ? artistDiscography(artist, 100) : Promise.resolve([]),
    wantSongs ? songSearch(term, artist?.id ?? null) : Promise.resolve([]),
    artistsPromise,
  ]);

  let albums: SearchItem[] = [];
  if (wantAlbums) {
    const textMatches = groups
      // Singles and EPs earned their place in the query above, but this is the
      // albums list.
      .filter((rg) => (rg["primary-type"] ?? "Album") === "Album")
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
    albums = dedupe([...discography, ...textMatches], limit, { exemptTitle: normalizedQuery });
  }

  return {
    albums,
    songs: wantSongs
      ? rankSongs(
          query,
          recordings,
          limit,
          artist?.id ?? null,
          discography.length,
          new Set(
            groups
              .map((g) => g["artist-credit"]?.[0]?.artist?.id)
              .filter((id): id is string => !!id)
          )
        )
      : [],
    artists: artistResults,
  };
}
