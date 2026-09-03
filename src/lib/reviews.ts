import { prisma } from "@/lib/prisma";
import { friendsOf } from "@/lib/social";

/**
 * Writing about a record, and deciding who sees it.
 *
 * Three audiences, and the distinction that matters is between them and the
 * *profile* setting: a review's visibility is authoritative for that review.
 * Marking one public publishes it even from a private profile, because saying
 * "this one is for everyone" is a deliberate act. A public profile does not
 * publish a private review either. Two settings that silently override each
 * other would mean nobody could predict who was reading.
 */

export const VISIBILITIES = ["PUBLIC", "FRIENDS", "PRIVATE"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export function isVisibility(value: string): value is Visibility {
  return (VISIBILITIES as readonly string[]).includes(value);
}

/** Reviews are for records you have in your library — that is what they attach to. */
export const MAX_BODY = 4_000;

export interface ReviewAuthor {
  id: string;
  handle: string | null;
  name: string | null;
  initials: string | null;
}

export interface ReviewView {
  id: string;
  body: string;
  visibility: Visibility;
  rating: number | null;
  updatedAt: Date;
  author: ReviewAuthor;
  isMine: boolean;
  likes: number;
  dislikes: number;
  replyCount: number;
  /** 1, -1, or 0 for the viewer's own reaction. */
  myReaction: number;
  /** Album context, for feeds where the review is shown away from its record. */
  mbid: string;
  albumTitle: string | null;
  artistName: string | null;
  coverUrl: string | null;
}

export interface ReplyView {
  id: string;
  body: string;
  createdAt: Date;
  author: ReviewAuthor;
  isMine: boolean;
}

const AUTHOR = { id: true, handle: true, name: true, initials: true } as const;

/**
 * Write or replace your review of an album.
 *
 * Keyed on the library entry, so reviewing something you have not saved is not
 * possible — which is correct: a review is a note on your own copy, and the
 * rating it sits beside lives on that same row.
 */
export async function saveReview(params: {
  userId: string;
  mbid: string;
  body: string;
  visibility: Visibility;
}): Promise<{ ok: true } | { error: "not_in_library" | "empty" | "too_long" }> {
  const body = params.body.trim();
  if (!body) return { error: "empty" };
  if (body.length > MAX_BODY) return { error: "too_long" };

  const log = await prisma.albumLog.findUnique({
    where: { userId_mbid: { userId: params.userId, mbid: params.mbid } },
    select: { id: true },
  });
  if (!log) return { error: "not_in_library" };

  await prisma.review.upsert({
    where: { userId_albumLogId: { userId: params.userId, albumLogId: log.id } },
    create: {
      userId: params.userId,
      albumLogId: log.id,
      mbid: params.mbid,
      body,
      visibility: params.visibility,
    },
    update: { body, visibility: params.visibility },
  });
  return { ok: true };
}

export async function deleteReview(userId: string, mbid: string): Promise<boolean> {
  const gone = await prisma.review.deleteMany({ where: { userId, mbid } });
  return gone.count > 0;
}

/**
 * Every review of a record the viewer is allowed to read.
 *
 * Your own always, whatever its setting — a private review is private from
 * other people, not from you. Then public ones, then friends' ones, and the
 * friend list is fetched once rather than per review.
 *
 * Ordered with yours first, because on your own album page it is the one you
 * came to read or edit.
 */
/**
 * Shape a query result into a view, including the viewer's own reaction.
 *
 * Reactions are fetched for the whole page in one query rather than per review:
 * a page of twenty reviews should not be twenty round trips to learn whether
 * you liked them.
 */
const ROW = {
  id: true,
  body: true,
  visibility: true,
  updatedAt: true,
  userId: true,
  mbid: true,
  likes: true,
  dislikes: true,
  replyCount: true,
  user: { select: AUTHOR },
  albumLog: {
    select: { rating: true, albumTitle: true, artistName: true, coverUrl: true },
  },
} as const;

type Row = {
  id: string; body: string; visibility: string; updatedAt: Date; userId: string;
  mbid: string; likes: number; dislikes: number; replyCount: number;
  user: ReviewAuthor;
  albumLog: { rating: number | null; albumTitle: string; artistName: string; coverUrl: string | null } | null;
};

async function toViews(rows: Row[], viewerId: string | null): Promise<ReviewView[]> {
  const mine = new Map<string, number>();
  if (viewerId && rows.length) {
    const reactions = await prisma.reviewReaction.findMany({
      where: { userId: viewerId, reviewId: { in: rows.map((r) => r.id) } },
      select: { reviewId: true, value: true },
    });
    for (const r of reactions) mine.set(r.reviewId, r.value);
  }

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    visibility: r.visibility as Visibility,
    rating: r.albumLog?.rating ?? null,
    updatedAt: r.updatedAt,
    author: r.user,
    isMine: r.userId === viewerId,
    likes: r.likes,
    dislikes: r.dislikes,
    replyCount: r.replyCount,
    myReaction: mine.get(r.id) ?? 0,
    mbid: r.mbid,
    albumTitle: r.albumLog?.albumTitle ?? null,
    artistName: r.albumLog?.artistName ?? null,
    coverUrl: r.albumLog?.coverUrl ?? null,
  }));
}

/**
 * Every review of a record the viewer is allowed to read.
 *
 * Your own always, whatever its setting — a private review is private from
 * other people, not from you. Then public ones, then friends' ones, and the
 * friend list is fetched once rather than per review.
 *
 * Ordered with yours first, then by likes: on an album page the useful order is
 * "mine, then whatever people found worth reading", not strict recency.
 */
export async function reviewsForAlbum(
  mbid: string,
  viewerId: string | null,
  limit = 50
): Promise<ReviewView[]> {
  const friendIds = viewerId ? (await friendsOf(viewerId)).map((f) => f.id) : [];

  const rows = await prisma.review.findMany({
    where: {
      mbid,
      OR: [
        { visibility: "PUBLIC" },
        ...(viewerId ? [{ userId: viewerId }] : []),
        ...(friendIds.length ? [{ visibility: "FRIENDS", userId: { in: friendIds } }] : []),
      ],
    },
    orderBy: [{ likes: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: ROW,
  });

  const views = await toViews(rows as Row[], viewerId);
  return views.sort((a, b) => Number(b.isMine) - Number(a.isMine));
}

/**
 * Reviews worth reading, for a feed rather than an album page.
 *
 * Two lists, deliberately not merged. A friend's review matters because of who
 * wrote it; a popular one matters because of how it landed. Blending them by
 * one score would bury a friend with two likes under a stranger with fifty,
 * which inverts why you would open the section at all.
 *
 * Your own are excluded from both — you know what you think.
 */
export async function reviewsFeed(
  viewerId: string,
  limit = 12
): Promise<{ friends: ReviewView[]; popular: ReviewView[] }> {
  const friendIds = (await friendsOf(viewerId)).map((f) => f.id);

  const [friendRows, popularRows] = await Promise.all([
    friendIds.length
      ? prisma.review.findMany({
          where: {
            userId: { in: friendIds },
            visibility: { in: ["PUBLIC", "FRIENDS"] },
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: ROW,
        })
      : Promise.resolve([]),
    prisma.review.findMany({
      where: {
        visibility: "PUBLIC",
        userId: { not: viewerId },
        // A review nobody has reacted to is not popular, it is just recent.
        // Without this the "popular" list is a second recency list.
        likes: { gt: 0 },
      },
      orderBy: [{ likes: "desc" }, { updatedAt: "desc" }],
      take: limit,
      select: ROW,
    }),
  ]);

  const [friends, popular] = await Promise.all([
    toViews(friendRows as Row[], viewerId),
    toViews(popularRows as Row[], viewerId),
  ]);

  // A friend's review that is also popular belongs in the friends list, where
  // the reason it is being shown is stronger.
  const seen = new Set(friends.map((r) => r.id));
  return { friends, popular: popular.filter((r) => !seen.has(r.id)) };
}

/** Just your own, for the editor to load into. */
export async function myReview(userId: string, mbid: string) {
  const row = await prisma.review.findFirst({
    where: { userId, mbid },
    select: { body: true, visibility: true, updatedAt: true },
  });
  if (!row) return null;
  return { ...row, visibility: row.visibility as Visibility };
}

// ── Who may read a given review ──────────────────────────────────────────────

/**
 * The single gate for anything done *to* a review.
 *
 * Replying and reacting both require being able to read it in the first place,
 * and both are separate endpoints that would otherwise each re-derive the rule.
 * A private review therefore cannot be replied to at all, which is correct: it
 * has no audience to reply.
 */
export async function canSeeReview(
  reviewId: string,
  viewerId: string | null
): Promise<{ ok: boolean; authorId?: string }> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { userId: true, visibility: true },
  });
  if (!review) return { ok: false };
  if (review.userId === viewerId) return { ok: true, authorId: review.userId };
  if (review.visibility === "PUBLIC") return { ok: true, authorId: review.userId };
  if (review.visibility === "PRIVATE" || !viewerId) return { ok: false };

  const friends = await friendsOf(viewerId);
  return {
    ok: friends.some((f) => f.id === review.userId),
    authorId: review.userId,
  };
}

// ── Reactions ────────────────────────────────────────────────────────────────

/**
 * Like, dislike, or take it back.
 *
 * Sending the reaction you already hold removes it, so the same button is press
 * and un-press. The counts on the review are updated in the same transaction as
 * the reaction row, so a like is never counted twice or lost.
 */
export async function react(params: {
  reviewId: string;
  userId: string;
  value: 1 | -1;
}): Promise<{ likes: number; dislikes: number; myReaction: number } | null> {
  const seen = await canSeeReview(params.reviewId, params.userId);
  if (!seen.ok) return null;

  const existing = await prisma.reviewReaction.findUnique({
    where: { reviewId_userId: { reviewId: params.reviewId, userId: params.userId } },
    select: { value: true },
  });

  // Deltas rather than recounts: two people reacting at once must not read the
  // same total and both write it back.
  let likeDelta = 0;
  let dislikeDelta = 0;
  let myReaction = params.value as number;

  if (existing?.value === params.value) {
    await prisma.reviewReaction.delete({
      where: { reviewId_userId: { reviewId: params.reviewId, userId: params.userId } },
    });
    if (params.value === 1) likeDelta = -1;
    else dislikeDelta = -1;
    myReaction = 0;
  } else if (existing) {
    await prisma.reviewReaction.update({
      where: { reviewId_userId: { reviewId: params.reviewId, userId: params.userId } },
      data: { value: params.value },
    });
    likeDelta = params.value === 1 ? 1 : -1;
    dislikeDelta = params.value === 1 ? -1 : 1;
  } else {
    await prisma.reviewReaction.create({
      data: { reviewId: params.reviewId, userId: params.userId, value: params.value },
    });
    if (params.value === 1) likeDelta = 1;
    else dislikeDelta = 1;
  }

  const updated = await prisma.review.update({
    where: { id: params.reviewId },
    data: {
      likes: { increment: likeDelta },
      dislikes: { increment: dislikeDelta },
    },
    select: { likes: true, dislikes: true },
  });

  return { ...updated, myReaction };
}

/** Repair the denormalised counts on one review, if they ever drift. */
export async function recountReview(reviewId: string): Promise<void> {
  const [likes, dislikes, replyCount] = await Promise.all([
    prisma.reviewReaction.count({ where: { reviewId, value: 1 } }),
    prisma.reviewReaction.count({ where: { reviewId, value: -1 } }),
    prisma.reviewReply.count({ where: { reviewId } }),
  ]);
  await prisma.review.update({ where: { id: reviewId }, data: { likes, dislikes, replyCount } });
}

// ── Replies ──────────────────────────────────────────────────────────────────

export async function addReply(params: {
  reviewId: string;
  userId: string;
  body: string;
}): Promise<ReplyView | { error: "not_allowed" | "empty" | "too_long" }> {
  const body = params.body.trim();
  if (!body) return { error: "empty" };
  if (body.length > 1_000) return { error: "too_long" };

  const seen = await canSeeReview(params.reviewId, params.userId);
  if (!seen.ok) return { error: "not_allowed" };

  const [reply] = await prisma.$transaction([
    prisma.reviewReply.create({
      data: { reviewId: params.reviewId, userId: params.userId, body },
      select: { id: true, body: true, createdAt: true, user: { select: AUTHOR } },
    }),
    prisma.review.update({
      where: { id: params.reviewId },
      data: { replyCount: { increment: 1 } },
    }),
  ]);

  return { id: reply.id, body: reply.body, createdAt: reply.createdAt, author: reply.user, isMine: true };
}

/**
 * Remove your own reply, or any reply on your own review.
 *
 * The second half matters: a review is a thing you published, and being unable
 * to remove something someone else wrote underneath it makes publishing a risk.
 */
export async function deleteReply(replyId: string, userId: string): Promise<boolean> {
  const reply = await prisma.reviewReply.findUnique({
    where: { id: replyId },
    select: { userId: true, reviewId: true, review: { select: { userId: true } } },
  });
  if (!reply) return false;
  if (reply.userId !== userId && reply.review.userId !== userId) return false;

  await prisma.$transaction([
    prisma.reviewReply.delete({ where: { id: replyId } }),
    prisma.review.update({
      where: { id: reply.reviewId },
      data: { replyCount: { decrement: 1 } },
    }),
  ]);
  return true;
}

export async function repliesFor(
  reviewId: string,
  viewerId: string | null
): Promise<ReplyView[] | null> {
  const seen = await canSeeReview(reviewId, viewerId);
  if (!seen.ok) return null;

  const rows = await prisma.reviewReply.findMany({
    where: { reviewId },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true, userId: true, user: { select: AUTHOR } },
  });
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    author: r.user,
    isMine: r.userId === viewerId,
  }));
}
