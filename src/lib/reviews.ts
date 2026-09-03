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
export async function reviewsForAlbum(
  mbid: string,
  viewerId: string | null
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
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      body: true,
      visibility: true,
      updatedAt: true,
      userId: true,
      user: { select: AUTHOR },
      albumLog: { select: { rating: true } },
    },
  });

  const views: ReviewView[] = rows.map((r) => ({
    id: r.id,
    body: r.body,
    visibility: r.visibility as Visibility,
    rating: r.albumLog?.rating ?? null,
    updatedAt: r.updatedAt,
    author: r.user,
    isMine: r.userId === viewerId,
  }));

  return views.sort((a, b) => Number(b.isMine) - Number(a.isMine));
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
