import { ACCENT, compact, niceMax, share } from "@/lib/viz";

/**
 * The three bar forms, built from HTML boxes rather than SVG.
 *
 * That choice is deliberate. An SVG chart scaled down to phone width scales its
 * *text* down with it — a 10px axis label becomes 5px and unreadable. HTML marks
 * reflow instead: the bars shrink, the labels stay 10px real text that a screen
 * reader and a text zoom both understand. Only the line chart, which needs a path,
 * uses SVG.
 *
 * Marks follow fixed specs: never thicker than 24px, a 4px rounded data-end with
 * the baseline end left square, and a 2px gap of the card colour between touching
 * bars instead of a border.
 */

const BAR_GAP = "2px";

/**
 * The top gridline value.
 *
 * Counts get an *even* top so the midpoint tick is a whole number — a "how many
 * items" axis reading 1 / 0.5 / 0 is nonsense, since half an album is not a thing.
 */
export function axisTop(peak: number, values: number[]): number {
  const top = niceMax(peak);
  const counts = values.every((v) => Number.isInteger(v));
  if (counts && top < 10) return Math.max(2, top % 2 === 0 ? top : top + 1);
  return top;
}

// ── Columns (vertical) ────────────────────────────────────────────────────────

export type Column = { label: string; value: number; color?: string };

/**
 * Vertical columns for an ordered x axis — a rating histogram, hours of the day,
 * decades.
 *
 * Values are read off the y-axis ticks, so only the peak is direct-labelled; a
 * number above every column is noise that goes unread.
 */
export function ColumnChart({
  data,
  height = 132,
  max,
  labelEvery,
  format = (v) => compact(v),
  unit,
}: {
  data: Column[];
  height?: number;
  max?: number;
  /** Show every nth x label. Defaults to whatever keeps them from colliding. */
  labelEvery?: number;
  format?: (value: number) => string;
  unit?: string;
}) {
  const peak = Math.max(0, ...data.map((d) => d.value));
  const top = max ?? axisTop(peak, data.map((d) => d.value));
  const step = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));
  const peakIndex = data.findIndex((d) => d.value === peak && peak > 0);

  return (
    // Top padding is headroom for the peak label, which sits above its column.
    <div className="flex gap-2 pt-4">
      <div
        className="relative w-7 shrink-0 text-[10px] tabular-nums text-zinc-600"
        style={{ height }}
        aria-hidden
      >
        <span className="absolute right-0 top-0 -translate-y-1/2">{format(top)}</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2">{format(top / 2)}</span>
        <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          <div className="absolute inset-x-0 top-0 border-t border-zinc-800" />
          <div className="absolute inset-x-0 top-1/2 border-t border-zinc-800" />
          <div className="absolute inset-x-0 bottom-0 border-t border-zinc-700" />

          <div className="absolute inset-0 flex items-end" style={{ gap: BAR_GAP }}>
            {data.map((d, i) => {
              const pct = top > 0 ? (d.value / top) * 100 : 0;
              return (
                // `h-full` is load-bearing: the bar's height is a percentage, and a
                // percentage against an auto-height parent collapses to nothing.
                <div
                  key={`${d.label}-${i}`}
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end items-center"
                >
                  <div
                    className="relative w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-70"
                    style={{
                      height: `${pct}%`,
                      minHeight: d.value > 0 ? 2 : 0,
                      backgroundColor: d.color ?? ACCENT,
                    }}
                    title={`${d.label}: ${format(d.value)}${unit ? ` ${unit}` : ""}`}
                  >
                    {i === peakIndex && (
                      <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-zinc-400">
                        {format(d.value)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-1.5 flex" style={{ gap: BAR_GAP }}>
          {data.map((d, i) => (
            <div
              key={`${d.label}-label-${i}`}
              className="min-w-0 flex-1 truncate text-center text-[10px] text-zinc-600"
            >
              {i % step === 0 ? d.label : " "}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Bars (horizontal) ─────────────────────────────────────────────────────────

export type Bar = {
  label: string;
  value: number;
  /** Small trailing context, e.g. how many items the average is over. */
  meta?: string;
};

/**
 * Horizontal bars for named categories — genres, artists, albums.
 *
 * Horizontal because the names are long: as columns they would need rotated
 * labels, and a rotated label is harder to read than a rearranged chart. Every
 * bar is the same colour on purpose — genres have no natural order, so shading
 * them by size would say twice what the length already says.
 */
export function BarChart({
  data,
  max,
  format = (v) => compact(v),
  labelWidth = "w-24 sm:w-32",
  unit,
}: {
  data: Bar[];
  max?: number;
  format?: (value: number) => string;
  labelWidth?: string;
  unit?: string;
}) {
  const top = max ?? niceMax(Math.max(0, ...data.map((d) => d.value)));
  const hasMeta = data.some((row) => row.meta);

  return (
    <ul className="space-y-1.5">
      {data.map((d, i) => (
        <li
          key={`${d.label}-${i}`}
          className="group flex items-center gap-2 text-[11px]"
          title={`${d.label}: ${format(d.value)}${unit ? ` ${unit}` : ""}`}
        >
          <span className={`${labelWidth} shrink-0 truncate capitalize text-zinc-400`}>
            {d.label}
          </span>
          <span className="relative h-3.5 min-w-0 flex-1 rounded-sm bg-zinc-800/50">
            <span
              className="absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity group-hover:opacity-70"
              style={{
                width: `${share(d.value, top)}%`,
                minWidth: d.value > 0 ? 2 : 0,
                backgroundColor: ACCENT,
              }}
            />
          </span>
          <span className="w-7 shrink-0 text-right tabular-nums text-zinc-300">
            {format(d.value)}
          </span>
          {hasMeta && (
            <span className="w-10 shrink-0 truncate text-right tabular-nums text-zinc-600">
              {d.meta}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Stack (part-to-whole) ─────────────────────────────────────────────────────

export type Segment = { label: string; value: number; color: string };

/**
 * One horizontal stacked bar for a part-to-whole split.
 *
 * A stacked bar rather than a pie: three shares of a library are compared far
 * more accurately along a common baseline than as wedges, and it degrades
 * gracefully when one share is tiny.
 */
export function StackedBar({ data, total }: { data: Segment[]; total: number }) {
  const present = data.filter((d) => d.value > 0);

  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-[4px]" style={{ gap: BAR_GAP }}>
        {present.map((d) => (
          <div
            key={d.label}
            className="min-w-0 transition-opacity hover:opacity-70"
            style={{
              flexBasis: `${share(d.value, total)}%`,
              backgroundColor: d.color,
            }}
            title={`${d.label}: ${d.value} of ${total}`}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-1">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-[11px]">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: d.color }}
            />
            <span className="flex-1 text-zinc-400">{d.label}</span>
            <span className="tabular-nums text-zinc-300">{d.value}</span>
            <span className="w-9 text-right tabular-nums text-zinc-600">
              {Math.round(share(d.value, total))}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
