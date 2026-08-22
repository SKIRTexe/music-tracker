/**
 * Chart palette and scale helpers.
 *
 * The palette is not a matter of taste — these exact steps were run through a
 * colourblind-safety validator against this app's card surface (`zinc-900`,
 * `#18181b`) and all of them pass: the lightness band, the chroma floor, adjacent
 * *and* all-pairs CVD separation, the normal-vision floor, and 3:1 contrast. If
 * you change a hex, re-validate the set rather than eyeballing it.
 *
 * Rules that the charts depend on and that are easy to break by accident:
 *
 * - **Three categorical slots, in fixed order, never cycled.** They are for
 *   *identity* (added vs listened vs rated). A fourth series folds into "other",
 *   becomes its own chart, or the chart changes form. Colour follows the thing,
 *   not its rank, so a series never changes colour when another is filtered out.
 * - **Nominal categories get one colour, not a ramp.** Genres and artists have no
 *   natural order, so shading them by size would double-encode the bar length and
 *   burn the only free channel on information the bar already shows.
 * - **The ordinal ramp is for genuinely ordered buckets only** (backlog age). One
 *   hue, light to dark, and no darker than `#184f95` or the last step disappears
 *   into the card.
 */

/** Categorical slots 1–3, dark-surface steps. Assign in order. */
export const SERIES = ["#3987e5", "#d95926", "#199e70"] as const;

/** The single hue every magnitude chart uses. */
export const ACCENT = SERIES[0];

/** Ordered buckets, light → dark. Four steps, validated as an ordinal ramp. */
export const ORDINAL = ["#86b6ef", "#5598e7", "#2a78d6", "#184f95"] as const;

/**
 * The card surface. Bars are separated by a 2px gap *of this colour* rather than
 * by a border — a stroke around a mark adds ink that is not data.
 */
export const SURFACE = "#18181b";

// ── Scales ────────────────────────────────────────────────────────────────────

/**
 * A round number at or above `value`, for the top gridline.
 *
 * Bars are scaled against this rather than the tallest bar, so the axis reads
 * 0 / 10 / 20 instead of 0 / 8.5 / 17.
 */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  if (value <= 5) return Math.ceil(value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/** 1284 → "1.3k". Keeps axis ticks and tile values from wrapping. */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value * 10) / 10);
}

/** Percent of a total, guarding the empty-library divide-by-zero. */
export function share(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayName(index: number): string {
  return WEEKDAYS[index] ?? "";
}

/** Axis labels for time buckets. Short, because they sit under narrow columns. */
export function bucketLabel(date: Date, grain: "day" | "week" | "month"): string {
  const d = new Date(date);
  if (grain === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
