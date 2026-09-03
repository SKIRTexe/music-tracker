-- Counts kept on the review rather than aggregated on read, so "popular" is an
-- index scan. Written in the same transaction as the rows they count.
ALTER TABLE "Review" ADD COLUMN "likes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Review" ADD COLUMN "dislikes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Review" ADD COLUMN "replyCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Review_visibility_likes_idx" ON "Review"("visibility", "likes");

-- One row per person per review. Changing your mind is an update, so nobody can
-- hold a like and a dislike at once. No zero value: removing a reaction deletes
-- the row.
CREATE TABLE "ReviewReaction" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewReaction_reviewId_userId_key" ON "ReviewReaction"("reviewId", "userId");
CREATE INDEX "ReviewReaction_userId_idx" ON "ReviewReaction"("userId");
ALTER TABLE "ReviewReaction" ADD CONSTRAINT "ReviewReaction_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewReaction" ADD CONSTRAINT "ReviewReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Flat replies. Threading needs moderation tools and collapsing rules that do
-- not exist here yet.
CREATE TABLE "ReviewReply" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewReply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewReply_reviewId_createdAt_idx" ON "ReviewReply"("reviewId", "createdAt");
CREATE INDEX "ReviewReply_userId_idx" ON "ReviewReply"("userId");
ALTER TABLE "ReviewReply" ADD CONSTRAINT "ReviewReply_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewReply" ADD CONSTRAINT "ReviewReply_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
