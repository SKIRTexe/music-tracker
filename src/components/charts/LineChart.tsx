import { compact } from "@/lib/viz";
import { axisTop } from "@/components/charts/Bars";

/**
 * A multi-series line chart: HTML for everything that is text or a dot, SVG for
 * the paths only.
 *
 * The split matters. The SVG stretches to its container with
 * `preserveAspectRatio="none"`, which would squash a circle into an ellipse and
 * thin a stroke on a narrow screen — so strokes carry `vectorEffect`
 * (fixed at 2px whatever the scale) and the end-markers are positioned HTML
 * elements instead of SVG circles. Gridlines and labels are HTML for the same
 * reason: they stay a real 10px at every width.
 *
 * There are no end-of-line labels. With three series converging on a small chart
 * they collide, and nudging them apart detaches a label from its line — so the
 * current value rides the legend instead, where it cannot overlap anything.
 */

export type LineSeries = { label: string; color: string; points: number[] };

export function LineChart({
  series,
  xLabels,
  height = 132,
  max,
}: {
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  max?: number;
}) {
  const peak = Math.max(0, ...series.flatMap((s) => s.points));
  const top = max ?? axisTop(peak, series.flatMap((s) => s.points));
  const count = Math.max(...series.map((s) => s.points.length), 0);

  /** Percent across the plot for point i. A lone point sits in the middle. */
  const xAt = (i: number) => (count <= 1 ? 50 : (i / (count - 1)) * 100);
  const yAt = (v: number) => (top > 0 ? 100 - (v / top) * 100 : 100);

  // Which x labels to print: first, middle and last only. Every bucket labelled
  // would collide at any width a phone can offer.
  const labelIndexes = new Set(
    count <= 1 ? [0] : [0, Math.floor((count - 1) / 2), count - 1]
  );

  return (
    <div className="flex gap-2">
      <div
        className="relative w-7 shrink-0 text-[10px] tabular-nums text-zinc-600"
        style={{ height }}
        aria-hidden
      >
        <span className="absolute right-0 top-0 -translate-y-1/2">{compact(top)}</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2">{compact(top / 2)}</span>
        <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          <div className="absolute inset-x-0 top-0 border-t border-zinc-800" />
          <div className="absolute inset-x-0 top-1/2 border-t border-zinc-800" />
          <div className="absolute inset-x-0 bottom-0 border-t border-zinc-700" />

          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {series.map((s) => {
              const points = s.points.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
              return (
                <g key={s.label}>
                  {/* A single series gets a 10% wash under it; several would muddy. */}
                  {series.length === 1 && s.points.length > 1 && (
                    <polygon
                      points={`0,100 ${points} 100,100`}
                      fill={s.color}
                      opacity={0.1}
                    />
                  )}
                  {s.points.length > 1 && (
                    <polyline
                      points={points}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* End-markers: HTML, so they stay circular at every container width. */}
          {series.map((s) => {
            const last = s.points.length - 1;
            if (last < 0) return null;
            return (
              <span
                key={`${s.label}-marker`}
                className="absolute h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-zinc-900"
                style={{
                  left: `${xAt(last)}%`,
                  bottom: `${100 - yAt(s.points[last])}%`,
                  backgroundColor: s.color,
                }}
                title={`${s.label}: ${s.points[last]}`}
              />
            );
          })}
        </div>

        <div
          className={`mt-1.5 flex text-[10px] text-zinc-600 ${
            count <= 1 ? "justify-center" : "justify-between"
          }`}
        >
          {xLabels
            .filter((_, i) => labelIndexes.has(i))
            .map((label, i) => (
              <span key={`${label}-${i}`}>{label}</span>
            ))}
        </div>
      </div>
    </div>
  );
}
