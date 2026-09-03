import { prisma } from "@/lib/prisma";

/**
 * Favourite tracks, and user-made groups of albums.
 *
 * Both are private to their owner and neither is shared anywhere yet — the
 * favourites appear in your own reviews if you choose to include them, and a
 * group is a shelf in your own library.
 */

/**
 * Five, and the number is the feature.
 *
 * A favourites list without a cap is a second copy of the tracklist. Five is
 * few enough that picking the fifth means dropping one, which is what makes the
 * list say anything.
 */
export const MAX_FAVOURITES = 5;

export interface FavouriteTrackView {
  title: string;
  position: number;
}

export async function favouritesFor(userId: string, mbid: string): Promise<FavouriteTrackView[]> {
  const rows = await prisma.favouriteTrack.findMany({
    where: { userId, mbid },
    orderBy: { position: "asc" },
    select: { title: true, position: true },
  });
  return rows;
}

export type FavouriteOutcome =
  | { favourites: FavouriteTrackView[] }
  | { error: "full" };

/**
 * Add or remove one track. Sending a title that is already a favourite removes
 * it, so the same tap is on and off.
 *
 * Positions are renumbered on every change rather than left sparse: they exist
 * to order a short list in a review, and a gap would show up there as nothing
 * at all while quietly making the next insert's position ambiguous.
 */
export async function toggleFavourite(params: {
  userId: string;
  mbid: string;
  title: string;
}): Promise<FavouriteOutcome> {
  const { userId, mbid, title } = params;

  const existing = await prisma.favouriteTrack.findUnique({
    where: { userId_mbid_title: { userId, mbid, title } },
    select: { id: true },
  });

  if (existing) {
    await prisma.favouriteTrack.delete({ where: { id: existing.id } });
  } else {
    const count = await prisma.favouriteTrack.count({ where: { userId, mbid } });
    if (count >= MAX_FAVOURITES) return { error: "full" };
    await prisma.favouriteTrack.create({
      data: { userId, mbid, title, position: count },
    });
  }

  // Renumber from zero so the list is always 0..n-1.
  const after = await prisma.favouriteTrack.findMany({
    where: { userId, mbid },
    orderBy: { position: "asc" },
    select: { id: true, title: true },
  });
  await prisma.$transaction(
    after.map((row, index) =>
      prisma.favouriteTrack.update({ where: { id: row.id }, data: { position: index } })
    )
  );

  return { favourites: after.map((row, index) => ({ title: row.title, position: index })) };
}

// ── Groups ───────────────────────────────────────────────────────────────────

export interface GroupView {
  id: string;
  name: string;
  /// Hex, or null for a group with no colour.
  color: string | null;
  count: number;
  /// Whether the album being asked about is in this group. Only meaningful when
  /// a specific album was named, which is what the add-to-group sheet needs.
  contains?: boolean;
}

export const MAX_GROUP_NAME = 40;

/**
 * Every group, with counts, and optionally whether one album is in each.
 *
 * The `contains` flag is computed here rather than by the client asking per
 * group: the sheet that offers "add to group" needs all of it at once, and a
 * request per group would make a five-group list five round trips.
 */
export async function groupsFor(userId: string, mbid?: string): Promise<GroupView[]> {
  /*
   * Alphabetical, and deliberately not "most recently used".
   *
   * Recency reorders the list *while you are using it* — ticking a group moved
   * it to the top and everything else shuffled under your finger, so the next
   * tick landed on the wrong row. A constant order is worth more here than a
   * clever one.
   */
  const rows = await prisma.albumGroup.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { items: true } },
      items: mbid ? { where: { mbid }, select: { mbid: true } } : false,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    count: row._count.items,
    ...(mbid ? { contains: (row.items ?? []).length > 0 } : {}),
  }));
}

export type GroupOutcome =
  | { group: GroupView }
  | { error: "empty" | "too_long" | "exists" };

export async function createGroup(
  userId: string,
  name: string,
  color?: string | null
): Promise<GroupOutcome> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { error: "empty" };
  if (clean.length > MAX_GROUP_NAME) return { error: "too_long" };

  const existing = await prisma.albumGroup.findFirst({
    where: { userId, name: { equals: clean, mode: "insensitive" } },
    select: { id: true },
  });
  // Matched case-insensitively even though the constraint is exact: "Country"
  // and "country" are the same shelf to the person making them, and letting
  // both exist means never knowing which one an album went into.
  if (existing) return { error: "exists" };

  const group = await prisma.albumGroup.create({
    data: { userId, name: clean, color: cleanColor(color) },
    select: { id: true, name: true, color: true },
  });
  return { group: { ...group, count: 0, contains: false } };
}

/**
 * Only `#rrggbb`, lowercased.
 *
 * The value is stored and later handed to a client to render, so anything not
 * matching is dropped rather than passed through — a colour field is a small
 * place to accept arbitrary strings.
 */
function cleanColor(value?: string | null): string | null {
  if (!value) return null;
  const hex = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

export async function updateGroup(
  userId: string,
  groupId: string,
  changes: { name?: string; color?: string | null }
): Promise<boolean> {
  const data: { name?: string; color?: string | null } = {};

  if (changes.name !== undefined) {
    const clean = changes.name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > MAX_GROUP_NAME) return false;
    data.name = clean;
  }
  // Distinguishes "leave it alone" from "clear it": undefined skips the field,
  // null writes null.
  if (changes.color !== undefined) data.color = cleanColor(changes.color);

  if (Object.keys(data).length === 0) return false;

  const done = await prisma.albumGroup.updateMany({ where: { id: groupId, userId }, data });
  return done.count > 0;
}

export async function deleteGroup(userId: string, groupId: string): Promise<boolean> {
  const done = await prisma.albumGroup.deleteMany({ where: { id: groupId, userId } });
  return done.count > 0;
}

/**
 * Put an album in a group, or take it out. Scoped by userId on the *group*, so
 * a stray id cannot write into someone else's shelf.
 */
export async function setGroupMembership(params: {
  userId: string;
  groupId: string;
  mbid: string;
  member: boolean;
}): Promise<boolean> {
  const owned = await prisma.albumGroup.findFirst({
    where: { id: params.groupId, userId: params.userId },
    select: { id: true },
  });
  if (!owned) return false;

  if (params.member) {
    await prisma.albumGroupItem.upsert({
      where: { groupId_mbid: { groupId: params.groupId, mbid: params.mbid } },
      create: { groupId: params.groupId, mbid: params.mbid },
      update: {},
    });
  } else {
    await prisma.albumGroupItem.deleteMany({
      where: { groupId: params.groupId, mbid: params.mbid },
    });
  }

  return true;
}

/** Which groups each of these albums belongs to, for the library grid. */
export async function groupMembership(
  userId: string,
  mbids: string[]
): Promise<Record<string, string[]>> {
  if (mbids.length === 0) return {};
  const rows = await prisma.albumGroupItem.findMany({
    where: { mbid: { in: mbids }, group: { userId } },
    // Ordered by name so a cover's ring segments are in the same order every
    // time it is drawn, rather than whatever the database felt like returning.
    orderBy: { group: { name: "asc" } },
    select: { mbid: true, groupId: true },
  });
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.mbid] ??= []).push(row.groupId);
  return out;
}
