import { prisma } from "@/lib/prisma";

/**
 * Friends, profiles, and who is allowed to see whose ratings.
 *
 * The rule that everything else here defers to: **a library is private until
 * its owner says otherwise.** People filled these libraries in when the app was
 * a private diary, so the social layer arriving must not retroactively publish
 * them. `isPublic` defaults to false, and `canViewLibrary` is the single gate —
 * no page or route decides this for itself.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Letters, digits and underscore. No dots or hyphens, which read as typos in
 *  a name someone has to say out loud, and no unicode look-alikes. */
const HANDLE_RE = /^[a-z0-9_]+$/;

export type HandleError = "too_short" | "too_long" | "bad_chars" | "taken" | "reserved";

/** Paths that already mean something, so a handle cannot shadow one. */
const RESERVED = new Set([
  "admin", "api", "album", "artist", "settings", "login", "register", "logout",
  "library", "stats", "privacy", "support", "forgot", "reset", "friends", "me",
  "u", "user", "users", "profile", "recordcrate", "help", "about", "terms",
]);

export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

export async function validateHandle(
  raw: string,
  forUserId: string
): Promise<HandleError | null> {
  const handle = normaliseHandle(raw);
  if (handle.length < HANDLE_MIN) return "too_short";
  if (handle.length > HANDLE_MAX) return "too_long";
  if (!HANDLE_RE.test(handle)) return "bad_chars";
  if (RESERVED.has(handle)) return "reserved";

  const existing = await prisma.user.findUnique({
    where: { handle },
    select: { id: true },
  });
  // Not "taken" if it is already yours — re-saving an unchanged form should not
  // report a collision with itself.
  if (existing && existing.id !== forUserId) return "taken";
  return null;
}

// ── Friendship ───────────────────────────────────────────────────────────────

export type FriendState =
  | "none"
  | "friends"
  | "request_sent"
  | "request_received"
  | "self";

/**
 * The one row that describes any pair, in either direction.
 *
 * Every question about two people goes through this, so nothing has to remember
 * to check both orderings — which is the bug this shape exists to prevent.
 */
async function edge(a: string, b: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

export async function friendState(viewerId: string, otherId: string): Promise<FriendState> {
  if (viewerId === otherId) return "self";
  const row = await edge(viewerId, otherId);
  if (!row) return "none";
  if (row.status === "ACCEPTED") return "friends";
  return row.requesterId === viewerId ? "request_sent" : "request_received";
}

export type RequestOutcome = "sent" | "already_friends" | "already_pending" | "accepted" | "self";

/**
 * Ask to be friends.
 *
 * If they have already asked you, this accepts instead of creating a second
 * request. Two people pressing the button at the same time should end up
 * friends, not deadlocked behind each other's pending requests.
 */
export async function requestFriend(viewerId: string, otherId: string): Promise<RequestOutcome> {
  if (viewerId === otherId) return "self";

  const row = await edge(viewerId, otherId);
  if (row?.status === "ACCEPTED") return "already_friends";

  if (row) {
    if (row.requesterId === viewerId) return "already_pending";
    await prisma.friendship.update({
      where: { id: row.id },
      data: { status: "ACCEPTED" },
    });
    return "accepted";
  }

  await prisma.friendship.create({
    data: { requesterId: viewerId, addresseeId: otherId, status: "PENDING" },
  });
  return "sent";
}

/** Accept a request addressed to you. Scoped so you cannot accept your own. */
export async function acceptFriend(viewerId: string, otherId: string): Promise<boolean> {
  const done = await prisma.friendship.updateMany({
    where: { requesterId: otherId, addresseeId: viewerId, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });
  return done.count > 0;
}

/** Decline a request, or remove an existing friend, or withdraw your own ask.
 *  All three are the same operation on the same row. */
export async function removeFriend(viewerId: string, otherId: string): Promise<boolean> {
  const row = await edge(viewerId, otherId);
  if (!row) return false;
  await prisma.friendship.delete({ where: { id: row.id } });
  return true;
}

export interface Person {
  id: string;
  handle: string | null;
  name: string | null;
  initials: string | null;
  isPublic: boolean;
}

const PERSON = { id: true, handle: true, name: true, initials: true, isPublic: true } as const;

/**
 * The one or two letters to show for someone.
 *
 * Falls back to the name, then the handle, so an account that never chose any
 * still looks like every other row rather than an empty circle.
 */
export function initialsFor(person: {
  initials?: string | null;
  name?: string | null;
  handle?: string | null;
}): string {
  if (person.initials) return person.initials.toUpperCase().slice(0, 2);
  const source = person.name || person.handle || "?";
  return source
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Letters only, at most two. */
export function cleanInitials(raw: string): string {
  return raw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
}

export async function friendsOf(userId: string): Promise<Person[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: {
      requester: { select: PERSON },
      addressee: { select: PERSON },
    },
  });
  // Whichever side of the row is not you.
  return rows.map((r) => (r.requester.id === userId ? r.addressee : r.requester));
}

/** Requests waiting on you. The ones you sent are not listed: there is nothing
 *  to do about them, and a list of unanswered asks is a list of small rejections. */
export async function pendingRequests(userId: string): Promise<Person[]> {
  const rows = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { requester: { select: PERSON } },
  });
  return rows.map((r) => r.requester);
}

/**
 * Find people by handle or display name.
 *
 * Email is deliberately not searchable. Being able to look someone up by
 * address turns this into a way to check whether a given person has an account,
 * which is the same disclosure the sign-in and reset endpoints take care to
 * avoid.
 */
export async function findPeople(query: string, viewerId: string): Promise<Person[]> {
  const term = query.trim().toLowerCase().replace(/^@/, "");
  if (term.length < 2) return [];

  return prisma.user.findMany({
    where: {
      id: { not: viewerId },
      OR: [
        { handle: { startsWith: term } },
        { name: { contains: term, mode: "insensitive" } },
      ],
      // Someone who has not chosen a handle has not opted into being found.
      handle: { not: null },
    },
    select: PERSON,
    take: 20,
    orderBy: { handle: "asc" },
  });
}

// ── Visibility ───────────────────────────────────────────────────────────────

/**
 * The single gate on reading someone else's library.
 *
 * Public profiles are open; private ones are friends-only. Your own is always
 * yours. Every caller uses this rather than re-deriving the rule, because the
 * failure mode of a second copy is silently showing a private library.
 */
export async function canViewLibrary(viewerId: string | null, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { isPublic: true },
  });
  if (!owner) return false;
  if (owner.isPublic) return true;
  if (!viewerId) return false;

  return (await friendState(viewerId, ownerId)) === "friends";
}

export async function profileByHandle(handle: string): Promise<(Person & { bio: string | null }) | null> {
  return prisma.user.findUnique({
    where: { handle: normaliseHandle(handle) },
    select: { ...PERSON, bio: true },
  });
}

// ── Community rating ─────────────────────────────────────────────────────────

/**
 * How everyone has rated a record.
 *
 * Every rating counts, including those of people whose profiles are private.
 * That is a deliberate line: an average over a group is not a disclosure about
 * any member of it, and excluding private users would make the number mean
 * "the average among people who publish their library", which is both less
 * useful and a subtler thing to explain.
 *
 * What does leak is small samples — an average of one, on an obscure record, is
 * that person's rating with their name removed but not much else. Hence the
 * floor: below it, there is no number.
 */
export const COMMUNITY_MIN_RATINGS = 3;

export interface CommunityRating {
  average: number;
  count: number;
}

export async function communityRating(mbid: string): Promise<CommunityRating | null> {
  const result = await prisma.albumLog.aggregate({
    where: { mbid, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const count = result._count.rating;
  const average = result._avg.rating;
  if (!average || count < COMMUNITY_MIN_RATINGS) return null;

  return { average: Math.round(average * 10) / 10, count };
}

/** The same, for many records at once, so a grid costs one query rather than N. */
export async function communityRatings(
  mbids: string[]
): Promise<Map<string, CommunityRating>> {
  if (mbids.length === 0) return new Map();

  const rows = await prisma.albumLog.groupBy({
    by: ["mbid"],
    where: { mbid: { in: mbids }, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const out = new Map<string, CommunityRating>();
  for (const row of rows) {
    const count = row._count.rating;
    const average = row._avg.rating;
    if (!average || count < COMMUNITY_MIN_RATINGS) continue;
    out.set(row.mbid, { average: Math.round(average * 10) / 10, count });
  }
  return out;
}
