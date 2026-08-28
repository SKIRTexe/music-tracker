/**
 * How a title becomes a key in a popularity map.
 *
 * Its own module, with **no imports**, because both the server (building the
 * map) and client components (looking titles up in it) need it, and
 * `popularity.ts` reaches prisma — importing this from there would pull the
 * database client into the browser bundle. The same reason `statuses.ts` stays
 * import-free.
 *
 * The map's keys are only meaningful through this function, so a second copy
 * that drifted would silently match nothing at all rather than fail loudly.
 */
export function popularityKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
