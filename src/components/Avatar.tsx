import { initialsFor } from "@/lib/social";

/**
 * Someone's circle: one or two letters.
 *
 * There are no uploaded pictures, on purpose. An avatar upload needs blob
 * storage, a size limit, a moderation answer for what people put in it and a
 * takedown path — a lot of surface for a circle 40 points wide, when the job is
 * only telling people apart in a list.
 *
 * The letters come from the profile if chosen, otherwise from the name or
 * handle, so an account that never set any still looks like every other row.
 */
export function Avatar({
  name,
  handle,
  initials,
  size = 40,
}: {
  name?: string | null;
  handle?: string | null;
  initials?: string | null;
  size?: number;
}) {
  const letters = initialsFor({ initials, name, handle });

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-500/15 ring-1 ring-inset ring-brand-500/30"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="font-semibold leading-none tracking-wide text-brand-500"
        style={{ fontSize: Math.max(10, size * 0.38) }}
      >
        {letters}
      </span>
    </div>
  );
}
