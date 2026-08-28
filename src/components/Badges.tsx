import type { Status } from "@/lib/statuses";

/**
 * The badges that sit on top of cover art.
 *
 * Ported from the app's `CoverBadge`, and shared for the same reason it is
 * there: a rating, a bookmark and a rank laid on four different covers should
 * be one object in four costumes, not four unrelated chips. The website had
 * drifted the other way — a rating was grey text under the title, a status was
 * a word, and a rank did not exist — so the two products no longer read as one.
 *
 * iOS gets real Liquid Glass from the system. The web cannot, so this is the
 * honest approximation: a blur, a translucent fill, and a hairline light edge.
 * The blur is what makes it read as glass rather than as a flat pill, and the
 * ring is what keeps it legible on a white sleeve.
 */

const GLASS =
  "backdrop-blur-md ring-1 ring-inset ring-white/20 shadow-lg shadow-black/40";

/** Artwork can be any colour; without this a badge vanishes into a pale sleeve. */
const LEGIBLE = "[text-shadow:0_1px_2px_rgb(0_0_0/0.45)]";

export function CoverBadge({
  tone = "neutral",
  prominent = false,
  className = "",
  children,
}: {
  tone?: "neutral" | "brand";
  prominent?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const fill = tone === "brand" ? "bg-brand-500/60" : "bg-zinc-900/45";
  const pad = prominent ? "px-[11px] py-1.5" : "px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full text-white ${fill} ${GLASS} ${pad} ${LEGIBLE} ${className}`}
    >
      {children}
    </span>
  );
}

/** A score. The one number that should carry a cover, so it gets the brand tint. */
export function ScoreBadge({ rating, compact = false }: { rating: number; compact?: boolean }) {
  return (
    <CoverBadge tone="brand" prominent={!compact}>
      <span className={`font-semibold tabular-nums ${compact ? "text-sm" : "text-base"}`}>
        {rating.toFixed(1)}
      </span>
    </CoverBadge>
  );
}

/** Listened, or waiting to be. */
export function StatusMarker({ status }: { status: Status }) {
  return (
    <CoverBadge>
      <span className="sr-only">{status === "LISTENED" ? "Listened" : "Want to listen"}</span>
      {status === "LISTENED" ? <CheckIcon /> : <BookmarkIcon />}
    </CoverBadge>
  );
}

/**
 * Where something places among its peers.
 *
 * Deliberately a rank rather than the figure behind it. That figure is Deezer's
 * follower count, which is European-weighted, so printing it invites a
 * comparison it cannot support. A place says only what it knows: this one is
 * listened to more than that one.
 */
export function PlaceBadge({ place }: { place: number }) {
  return (
    <CoverBadge>
      <span className="text-[11px] font-semibold tabular-nums">#{place}</span>
    </CoverBadge>
  );
}

/** A short tag on a cover — "Song", a track count. */
export function CoverTag({ text }: { text: string }) {
  return (
    <CoverBadge>
      <span className="text-[10px] font-medium">{text}</span>
    </CoverBadge>
  );
}

// The app uses SF Symbols; these are the two shapes it uses, drawn to match at
// the same optical weight.
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="w-3.5 h-3.5 fill-current">
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.9-3.9 4a.75.75 0 0 1-1.08 0L4.8 8.9a.75.75 0 1 1 1.08-1.04l.9.93 3.34-3.44A.75.75 0 1 1 11.2 6.4Z" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="w-3.5 h-3.5 fill-current">
      <path d="M4 2.25A1.25 1.25 0 0 0 2.75 3.5v10.2c0 .6.67.95 1.16.6L8 11.4l4.09 2.9c.49.35 1.16 0 1.16-.6V3.5A1.25 1.25 0 0 0 12 2.25H4Z" />
    </svg>
  );
}
