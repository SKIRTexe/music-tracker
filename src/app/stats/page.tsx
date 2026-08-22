import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboard, type Grain } from "@/lib/stats";
import { ChartCard } from "@/components/charts/ChartCard";
import { BarChart, ColumnChart, StackedBar } from "@/components/charts/Bars";
import { LineChart } from "@/components/charts/LineChart";
import { Hero, StatTile } from "@/components/charts/StatTile";
import { ORDINAL, SERIES, bucketLabel, weekdayName } from "@/lib/viz";

export const dynamic = "force-dynamic";

/**
 * The stats dashboard.
 *
 * Every chart is server-rendered from `getDashboard()` — no chart library, no
 * client component, no hydration. That is not minimalism for its own sake: this
 * app has a documented failure mode where a broken hydration leaves a page that
 * looks perfect and does nothing, and a dashboard whose numbers silently stop
 * updating is worse than one that is plainly missing. Marks are HTML boxes, the
 * line paths are SVG, and every chart carries a table of its own numbers.
 *
 * The range control scopes the Activity section only. Everything above it is a
 * snapshot of the library as it stands, which has no time dimension to filter —
 * so rather than one control that silently applies to half the page, the filter
 * sits with the charts it governs.
 */

const RANGES = [
  { value: "30", label: "30 days", days: 30, grain: "day" as Grain },
  { value: "90", label: "90 days", days: 90, grain: "day" as Grain },
  { value: "365", label: "1 year", days: 365, grain: "month" as Grain },
  { value: "all", label: "All time", days: 36_500, grain: "month" as Grain },
];

const STATUS_LABELS = ["Want to listen", "Listening", "Listened"];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { range } = await searchParams;
  const selected = RANGES.find((r) => r.value === range) ?? RANGES[1];

  const dash = await getDashboard(session.user.id, {
    days: selected.days,
    grain: selected.grain,
  });

  const { totals, ratings, genres, artists, era, activity, habits, backlog, events } = dash;

  if (totals.items === 0) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <h1 className="text-lg font-medium text-zinc-200">Stats</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Nothing to chart yet. Add a few albums and your listening starts showing up here.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
        >
          Find something to listen to
        </Link>
      </div>
    );
  }

  // ── Derived series ──────────────────────────────────────────────────────────

  const ratedGenres = genres.byRating.filter((g) => g.average !== null);
  const activityLabels = activity.map((point) => bucketLabel(point.bucket, selected.grain));
  const activitySeries = [
    { label: "Added", color: SERIES[0], points: activity.map((p) => p.added) },
    { label: "Listened", color: SERIES[1], points: activity.map((p) => p.listened) },
    { label: "Rated", color: SERIES[2], points: activity.map((p) => p.rated) },
  ];
  const windowTotals = activitySeries.map((s) => s.points.reduce((a, b) => a + b, 0));

  const statusSegments = [
    { label: STATUS_LABELS[0], value: totals.byStatus.want, color: SERIES[0] },
    { label: STATUS_LABELS[1], value: totals.byStatus.listening, color: SERIES[1] },
    { label: STATUS_LABELS[2], value: totals.byStatus.listened, color: SERIES[2] },
  ];

  const ageBuckets = [
    { label: "<7d", value: backlog.ageBuckets.under7, color: ORDINAL[0] },
    { label: "7–30d", value: backlog.ageBuckets.under30, color: ORDINAL[1] },
    { label: "30–90d", value: backlog.ageBuckets.under90, color: ORDINAL[2] },
    { label: "90d+", value: backlog.ageBuckets.over90, color: ORDINAL[3] },
  ];

  const oneDecimal = (v: number) => v.toFixed(1);

  // Album and song averages ride here rather than in their own chart: with one of
  // the two empty it would be a single-bar bar chart, which is just a number
  // wearing a costume.
  const ratingsNote = [
    ratings.spread !== null ? `Spread ${oneDecimal(ratings.spread)}` : null,
    ratings.min !== null
      ? `${oneDecimal(ratings.min)} lowest, ${oneDecimal(ratings.max ?? 0)} highest`
      : null,
    ratings.averageAlbum !== null ? `albums average ${oneDecimal(ratings.averageAlbum)}` : null,
    ratings.averageSong !== null ? `songs ${oneDecimal(ratings.averageSong)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-8 sm:space-y-10">
      <header>
        <h1 className="text-lg font-medium text-zinc-200">Stats</h1>
        <p className="mt-0.5 text-xs text-zinc-600">
          {totals.items} item{totals.items === 1 ? "" : "s"} · {events.total} tracked action
          {events.total === 1 ? "" : "s"}
          {habits.lastActivity && (
            <> · last active {habits.lastActivity.toLocaleDateString("en-US", { timeZone: "UTC" })}</>
          )}
        </p>
      </header>

      {/* ── Overview ─────────────────────────────────────────────────────── */}

      <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center">
        <Hero
          label="Average rating"
          value={ratings.average !== null ? oneDecimal(ratings.average) : "—"}
          meta={
            ratings.count > 0
              ? `across ${ratings.count} rated item${ratings.count === 1 ? "" : "s"} · median ${
                  ratings.median !== null ? oneDecimal(ratings.median) : "—"
                }`
              : "nothing rated yet"
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Albums"
            value={String(totals.albums)}
            meta={`${totals.songs} song${totals.songs === 1 ? "" : "s"}`}
          />
          <StatTile
            label="Listened"
            value={String(totals.byStatus.listened)}
            meta={`${totals.byStatus.want} to go`}
          />
          <StatTile
            label="Music"
            value={totals.hours !== null ? `${oneDecimal(totals.hours)}h` : "—"}
            meta={`${totals.tracks} tracks`}
          />
          <StatTile
            label="Artists"
            value={String(totals.distinctArtists)}
            meta={`${totals.distinctGenres} genres`}
          />
          <StatTile
            label="Rated"
            value={
              totals.ratedShare !== null ? `${Math.round(totals.ratedShare * 100)}%` : "—"
            }
            meta={`${totals.unrated} unrated`}
          />
          <StatTile
            label="Streak"
            value={`${habits.currentStreak}d`}
            meta={`best ${habits.longestStreak}d · ${habits.activeDays} active days`}
          />
        </div>
      </section>

      {/* ── Ratings ──────────────────────────────────────────────────────── */}

      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">Ratings</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Rating distribution"
            subtitle="How many items sit in each whole-point band."
            empty={ratings.count === 0 ? "Rate something to see the spread." : undefined}
            table={{
              columns: ["Rating", "Items"],
              rows: ratings.distribution.map((b) => [b.bucket, b.count]),
            }}
            note={ratingsNote}
          >
            <ColumnChart
              data={ratings.distribution.map((b) => ({
                label: String(b.bucket),
                value: b.count,
              }))}
              labelEvery={1}
              unit="items"
            />
          </ChartCard>

          <ChartCard
            title="Rating given over time"
            subtitle="The average score you handed out each month, as you gave it."
            empty={
              dash.ratingTrend.length === 0 ? "No ratings recorded yet." : undefined
            }
            table={{
              columns: ["Month", "Average", "Ratings"],
              rows: dash.ratingTrend.map((p) => [
                bucketLabel(p.month, "month"),
                p.average !== null ? oneDecimal(p.average) : "—",
                p.count,
              ]),
            }}
            note={
              ratings.averageRerateDelta !== null
                ? `${ratings.reratedItems} item${
                    ratings.reratedItems === 1 ? "" : "s"
                  } re-rated, averaging ${
                    ratings.averageRerateDelta > 0 ? "+" : ""
                  }${oneDecimal(ratings.averageRerateDelta)} on second thoughts.`
                : undefined
            }
          >
            <LineChart
              max={10}
              series={[
                {
                  label: "Average rating",
                  color: SERIES[0],
                  points: dash.ratingTrend.map((p) => p.average ?? 0),
                },
              ]}
              xLabels={dash.ratingTrend.map((p) => bucketLabel(p.month, "month"))}
            />
          </ChartCard>

          <ChartCard
            title="Rated highest"
            subtitle="Your top of the pile. Artists are in the table."
            empty={ratings.count === 0 ? "Nothing rated yet." : undefined}
            table={{
              columns: ["Item", "Artist", "Rating"],
              rows: dash.extremes.highest.map((i) => [
                i.albumTitle,
                i.artistName,
                i.rating ?? "—",
              ]),
            }}
          >
            <BarChart
              max={10}
              format={oneDecimal}
              unit="out of 10"
              labelWidth="w-28 sm:w-40"
              data={dash.extremes.highest.map((i) => ({
                label: i.albumTitle,
                value: i.rating ?? 0,
              }))}
            />
          </ChartCard>

          {/* Only worth its own card once the two lists stop being the same items. */}
          {ratings.count > 8 && (
          <ChartCard
            title="Rated lowest"
            subtitle="The ones that did not land. Artists are in the table."
            table={{
              columns: ["Item", "Artist", "Rating"],
              rows: dash.extremes.lowest.map((i) => [
                i.albumTitle,
                i.artistName,
                i.rating ?? "—",
              ]),
            }}
          >
            <BarChart
              max={10}
              format={oneDecimal}
              unit="out of 10"
              labelWidth="w-28 sm:w-40"
              data={dash.extremes.lowest.map((i) => ({
                label: i.albumTitle,
                value: i.rating ?? 0,
              }))}
            />
          </ChartCard>
          )}
        </div>
      </section>

      {/* ── Taste ────────────────────────────────────────────────────────── */}

      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">Taste</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Average rating by genre"
            subtitle="Which genres you actually score well, not just collect."
            empty={ratedGenres.length === 0 ? "Rate a few items to compare genres." : undefined}
            note="An item carries every genre its artist does, so one album counts in several rows. The trailing number is how many rated items each average covers."
            table={{
              columns: ["Genre", "Average", "Rated", "Items"],
              rows: ratedGenres.map((g) => [
                g.genre,
                g.average !== null ? oneDecimal(g.average) : "—",
                g.rated,
                g.items,
              ]),
            }}
          >
            <BarChart
              max={10}
              format={oneDecimal}
              unit="out of 10"
              data={ratedGenres.slice(0, 8).map((g) => ({
                label: g.genre,
                value: g.average ?? 0,
                meta: `n=${g.rated}`,
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Genres by size"
            subtitle="What your library is actually made of."
            empty={genres.byCount.length === 0 ? "No genres resolved yet." : undefined}
            note={
              totals.pendingEnrichment > 0
                ? `${totals.pendingEnrichment} item${
                    totals.pendingEnrichment === 1 ? "" : "s"
                  } still awaiting a genre lookup.`
                : genres.unclassified > 0
                  ? `${genres.unclassified} item${
                      genres.unclassified === 1 ? "" : "s"
                    } have no genre on record.`
                  : undefined
            }
            table={{
              columns: ["Genre", "Items", "Share"],
              rows: genres.byCount.map((g) => [
                g.genre,
                g.items,
                g.share !== null ? `${Math.round(g.share * 100)}%` : "—",
              ]),
            }}
          >
            <BarChart
              unit="items"
              data={genres.byCount.slice(0, 8).map((g) => ({
                label: g.genre,
                value: g.items,
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Most-saved artists"
            subtitle="By how many of their records you have kept."
            empty={artists.length === 0 ? "Nothing saved yet." : undefined}
            table={{
              columns: ["Artist", "Items", "Average"],
              rows: artists.map((a) => [
                a.artistName,
                a.items,
                a.average !== null ? oneDecimal(a.average) : "—",
              ]),
            }}
          >
            <BarChart
              unit="items"
              labelWidth="w-24 sm:w-36"
              data={artists.slice(0, 8).map((a) => ({
                label: a.artistName,
                value: a.items,
                meta: a.average !== null ? oneDecimal(a.average) : "—",
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Library by decade"
            subtitle={
              era.averageReleaseYear !== null
                ? `Average release year ${era.averageReleaseYear}, spanning ${era.oldest}–${era.newest}.`
                : "When the music you save was released."
            }
            empty={era.byDecade.length === 0 ? "No release years on record." : undefined}
            table={{
              columns: ["Decade", "Items", "Average rating"],
              rows: era.byDecade.map((d) => [
                `${d.decade}s`,
                d.items,
                d.average !== null ? oneDecimal(d.average) : "—",
              ]),
            }}
            note="Average rating per decade is in the table — plotting it beside the counts would need a second y-axis, which invents a relationship that is not in the data."
          >
            <ColumnChart
              labelEvery={1}
              unit="items"
              data={era.byDecade.map((d) => ({ label: `${d.decade}s`, value: d.items }))}
            />
          </ChartCard>
        </div>
      </section>

      {/* ── Activity ─────────────────────────────────────────────────────── */}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] uppercase tracking-widest text-zinc-500">Activity</h2>
          <nav className="flex items-center gap-1" aria-label="Time range">
            {RANGES.map((r) => (
              <Link
                key={r.value}
                href={`/stats?range=${r.value}`}
                aria-current={r.value === selected.value ? "true" : undefined}
                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                  r.value === selected.value
                    ? "bg-zinc-800 text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            className="lg:col-span-2"
            title={`What you did — last ${selected.label.toLowerCase()}`}
            subtitle={`Per ${selected.grain}. Listened counts anything that reached Listened, including items rated straight from a search.`}
            legend={activitySeries.map((s, i) => ({
              label: s.label,
              color: s.color,
              value: String(windowTotals[i]),
            }))}
            legendMark="line"
            empty={activity.length === 0 ? "No activity in this range." : undefined}
            table={{
              columns: ["When", "Added", "Wanted", "Listened", "Rated", "Removed"],
              rows: activity.map((p) => [
                bucketLabel(p.bucket, selected.grain),
                p.added,
                p.wanted,
                p.listened,
                p.rated,
                p.removed,
              ]),
            }}
          >
            <LineChart series={activitySeries} xLabels={activityLabels} height={160} />
          </ChartCard>

          <ChartCard
            title="Time of day"
            subtitle="When you log things."
            note="Bucketed in UTC — the app does not know your timezone, so these are not your local hours."
            table={{
              columns: ["Hour (UTC)", "Actions"],
              rows: habits.byHour.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.count]),
            }}
          >
            <ColumnChart
              labelEvery={3}
              unit="actions"
              data={habits.byHour.map((h) => ({
                label: String(h.hour).padStart(2, "0"),
                value: h.count,
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Day of week"
            subtitle="Which days you reach for music."
            note="Also UTC."
            table={{
              columns: ["Day", "Actions"],
              rows: habits.byWeekday.map((d) => [weekdayName(d.weekday), d.count]),
            }}
          >
            <ColumnChart
              labelEvery={1}
              unit="actions"
              data={habits.byWeekday.map((d) => ({
                label: weekdayName(d.weekday),
                value: d.count,
              }))}
            />
          </ChartCard>
        </div>
      </section>

      {/* ── Backlog ──────────────────────────────────────────────────────── */}

      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">
          Want to listen
        </h2>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="In the queue"
            value={String(backlog.size)}
            meta={
              backlog.averageAgeDays !== null
                ? `avg ${Math.round(backlog.averageAgeDays)}d old`
                : undefined
            }
          />
          <StatTile
            label="Followed through"
            value={
              backlog.conversionRate !== null
                ? `${Math.round(backlog.conversionRate * 100)}%`
                : "—"
            }
            meta={`${backlog.converted} of ${backlog.everWanted} ever wanted`}
          />
          <StatTile
            label="Typical wait"
            value={
              backlog.medianWaitDays !== null ? `${Math.round(backlog.medianWaitDays)}d` : "—"
            }
            meta={
              backlog.averageWaitDays !== null
                ? `mean ${Math.round(backlog.averageWaitDays)}d`
                : "want → listened"
            }
          />
          <StatTile
            label="Given up on"
            value={String(backlog.removedWhileWanted)}
            meta="deleted while still wanted"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Library by status"
            subtitle="Where everything currently sits."
            table={{
              columns: ["Status", "Items"],
              rows: statusSegments.map((s) => [s.label, s.value]),
            }}
          >
            <StackedBar data={statusSegments} total={totals.items} />
          </ChartCard>

          <ChartCard
            title="How long the queue has waited"
            subtitle="Age of what is still in Want to Listen."
            empty={backlog.size === 0 ? "Nothing waiting." : undefined}
            table={{
              columns: ["Age", "Items"],
              rows: ageBuckets.map((b) => [b.label, b.value]),
            }}
            note={
              backlog.oldestWantedAt
                ? `Oldest has been waiting since ${backlog.oldestWantedAt.toLocaleDateString(
                    "en-US",
                    { timeZone: "UTC" }
                  )}.`
                : undefined
            }
          >
            <ColumnChart labelEvery={1} unit="items" data={ageBuckets} />
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
