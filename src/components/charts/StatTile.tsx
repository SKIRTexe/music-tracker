/**
 * Numbers that are not charts.
 *
 * A single current value is a stat tile, never a one-bar bar chart — the number
 * *is* the chart, and drawing a bar around it adds ink without adding meaning.
 *
 * Both use proportional figures rather than `tabular-nums`. Equal-width digits
 * are right in a column that must align vertically, and wrong on a large
 * standalone number, where they make something like "121" look gappy.
 */

/** The one number the page leads with. Exactly one per view. */
export function Hero({
  value,
  label,
  meta,
}: {
  value: string;
  label: string;
  meta?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-5xl font-semibold leading-none text-zinc-100">{value}</p>
      {meta && <p className="mt-2 text-[11px] text-zinc-500">{meta}</p>}
    </div>
  );
}

export function StatTile({
  value,
  label,
  meta,
}: {
  value: string;
  label: string;
  meta?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1.5 text-xl font-semibold leading-none text-zinc-100">{value}</p>
      {meta && <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">{meta}</p>}
    </div>
  );
}
