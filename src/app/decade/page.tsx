import Link from "next/link";

const DECADES = [
  { label: "1950s", slug: "1950s", tagline: "Birth of Rock 'n' Roll" },
  { label: "1960s", slug: "1960s", tagline: "Revolution & Psychedelia" },
  { label: "1970s", slug: "1970s", tagline: "Disco, Funk & Punk" },
  { label: "1980s", slug: "1980s", tagline: "Synths, MTV & New Wave" },
  { label: "1990s", slug: "1990s", tagline: "Grunge, Hip-Hop & Britpop" },
  { label: "2000s", slug: "2000s", tagline: "Digital Revolution" },
  { label: "2010s", slug: "2010s", tagline: "Streaming Era" },
  { label: "2020s", slug: "2020s", tagline: "A New Decade" },
];

export default function DecadesPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/"
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-8 inline-block"
      >
        ← Discover
      </Link>

      <h1 className="text-2xl font-semibold text-zinc-100 mb-1">Decades</h1>
      <p className="text-sm text-zinc-500 mb-10">Browse albums by era.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {DECADES.map(({ label, slug, tagline }) => (
          <Link
            key={slug}
            href={`/decade/${slug}`}
            className="group relative rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors overflow-hidden aspect-square flex flex-col justify-end p-5"
          >
            {/* Subtle noise texture via radial gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/30 to-transparent pointer-events-none" />
            <p className="text-3xl font-bold text-zinc-100 group-hover:text-white transition-colors leading-none mb-1">
              {label}
            </p>
            <p className="text-[11px] text-zinc-500 group-hover:text-zinc-400 transition-colors leading-snug">
              {tagline}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
