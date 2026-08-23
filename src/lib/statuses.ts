/**
 * The statuses a library item can hold.
 *
 * One list, because the labels were previously copied into three components and
 * the stats page, and a set like this drifts the moment it is duplicated.
 *
 * **No imports.** This is used by client components, so anything reaching prisma
 * from here would drag the server into the browser bundle.
 *
 * There used to be a third, `LISTENING`, for something in progress. It was
 * removed as unused — no row ever held it. If it ever comes back, adding it here
 * and to the schema comment is most of the work.
 */

export const STATUSES = ["LISTENED", "WANT"] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  LISTENED: "Listened",
  WANT: "Want to listen",
};

/**
 * Guards the mutation entry points.
 *
 * A page cached from before a status was removed can still post the old value,
 * and an item written with a status the UI no longer offers is invisible in
 * every filter — present in the library, reachable from nothing.
 */
export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}
