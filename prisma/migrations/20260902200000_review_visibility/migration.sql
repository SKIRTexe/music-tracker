-- Reviews were modelled but never used: no rows, no code. Filling in what a
-- review actually needs before anything writes one.

-- Who a review is for. Private by default: someone writing for the first time
-- has not decided yet, and publishing is the choice that cannot be taken back.
ALTER TABLE "Review" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';

-- Denormalised from AlbumLog so an album page can find every review of a record
-- without joining through one row per user.
ALTER TABLE "Review" ADD COLUMN "mbid" TEXT NOT NULL DEFAULT '';

-- One review per person per entry, enforced here rather than by whichever
-- caller happens to check first.
CREATE UNIQUE INDEX "Review_userId_albumLogId_key" ON "Review"("userId", "albumLogId");
CREATE INDEX "Review_mbid_visibility_idx" ON "Review"("mbid", "visibility");
CREATE INDEX "Review_userId_updatedAt_idx" ON "Review"("userId", "updatedAt");
