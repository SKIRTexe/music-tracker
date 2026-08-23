/**
 * The list of switchable blocks on `/stats`.
 *
 * One registry, read by both the settings page (to draw the switches) and the
 * stats page (to decide what to render), so the two can't drift apart. Adding a
 * module means adding it here *and* wrapping the block in `show(id)` — a module
 * listed here but never checked is a switch that does nothing, which is worse
 * than no switch.
 *
 * **No imports.** This is pulled into a client component, and anything reaching
 * prisma from here would drag the server into the browser bundle.
 *
 * Ids are stored in the database, so renaming one silently un-hides that module
 * for everyone who had switched it off. Treat them as permanent.
 */

export const STATS_SECTIONS = [
  "Overview",
  "Ratings",
  "Taste",
  "Activity",
  "Want to listen",
] as const;

export type StatsSection = (typeof STATS_SECTIONS)[number];

export type StatsModule = {
  id: string;
  label: string;
  section: StatsSection;
  hint: string;
};

export const STATS_MODULES: StatsModule[] = [
  { id: "hero", section: "Overview", label: "Average rating", hint: "The headline number." },
  { id: "totals", section: "Overview", label: "Library totals", hint: "Albums, listened, hours, artists, rated share, streak." },

  { id: "rating-distribution", section: "Ratings", label: "Rating distribution", hint: "How many items sit in each whole-point band." },
  { id: "rating-trend", section: "Ratings", label: "Rating given over time", hint: "Whether you are getting more generous." },
  { id: "rated-highest", section: "Ratings", label: "Rated highest", hint: "Your top of the pile." },
  { id: "rated-lowest", section: "Ratings", label: "Rated lowest", hint: "Only appears once you have rated more than eight." },

  { id: "genre-ratings", section: "Taste", label: "Average rating by genre", hint: "Which genres you score well, not just collect." },
  { id: "genre-sizes", section: "Taste", label: "Genres by size", hint: "What the library is made of." },
  { id: "artists", section: "Taste", label: "Most-saved artists", hint: "By how many of their records you keep." },
  { id: "decades", section: "Taste", label: "Library by decade", hint: "When the music you save was released." },

  { id: "activity", section: "Activity", label: "What you did", hint: "Adds, listens and ratings over time, with the range control." },
  { id: "time-of-day", section: "Activity", label: "Time of day", hint: "When you log things. UTC." },
  { id: "day-of-week", section: "Activity", label: "Day of week", hint: "Which days you reach for music." },

  { id: "backlog-tiles", section: "Want to listen", label: "Backlog summary", hint: "Queue size, follow-through, typical wait." },
  { id: "status-split", section: "Want to listen", label: "Library by status", hint: "Where everything currently sits." },
  { id: "backlog-age", section: "Want to listen", label: "Queue age", hint: "How long what is waiting has waited." },
];

/** Guards against stale ids left in the database by a removed module. */
export function knownIds(): Set<string> {
  return new Set(STATS_MODULES.map((m) => m.id));
}

export function modulesInSection(section: StatsSection): StatsModule[] {
  return STATS_MODULES.filter((m) => m.section === section);
}
