import type { ReactNode } from "react";

/**
 * The frame every chart sits in: heading, legend, the plot, and a table twin.
 *
 * Two things here are requirements rather than decoration.
 *
 * **The table.** Every chart ships with the same numbers in a `<details>` table,
 * so no value is reachable only by hovering. It is a native disclosure element —
 * no JavaScript, so it works on the first paint and cannot be broken by a
 * hydration failure, which this app has been bitten by before.
 *
 * **The legend, whenever there are two or more series.** Colour alone must never
 * be the only thing telling two series apart. A single-series chart gets *no*
 * legend: there is one colour, and the heading already says what it is.
 */

export type LegendItem = { label: string; color: string; value?: string };

export type TableSpec = {
  columns: string[];
  rows: (string | number)[][];
};

export function ChartCard({
  title,
  subtitle,
  legend,
  /** Legends mirror their mark: a bar chart's key is a swatch, a line's is a line. */
  legendMark = "rect",
  note,
  table,
  empty,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  legendMark?: "rect" | "line";
  note?: string;
  table?: TableSpec;
  /** Shown instead of the plot when there is nothing to draw yet. */
  empty?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 sm:p-4 ${className ?? ""}`}
    >
      <header>
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500">{title}</h3>
        {subtitle && <p className="mt-1 text-[11px] leading-snug text-zinc-600">{subtitle}</p>}
      </header>

      {legend && legend.length > 1 && (
        <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              {legendMark === "line" ? (
                <span
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              ) : (
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span>{item.label}</span>
              {item.value && <span className="tabular-nums text-zinc-600">{item.value}</span>}
            </li>
          ))}
        </ul>
      )}

      {empty ? (
        <p className="py-6 text-center text-[11px] text-zinc-600">{empty}</p>
      ) : (
        <div className="mt-4">{children}</div>
      )}

      {note && <p className="mt-3 text-[10px] leading-snug text-zinc-600">{note}</p>}

      {table && table.rows.length > 0 && (
        <details className="mt-3 border-t border-zinc-800 pt-2">
          <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-zinc-600 transition-colors hover:text-zinc-400">
            Table
          </summary>
          <div className="mt-2 max-h-56 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-zinc-600">
                  {table.columns.map((column, i) => (
                    <th
                      key={column}
                      className={`pb-1 font-normal ${i === 0 ? "" : "text-right"}`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-t border-zinc-800/60">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={`py-1 ${
                          c === 0
                            ? "text-zinc-400"
                            : "text-right tabular-nums text-zinc-300"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
