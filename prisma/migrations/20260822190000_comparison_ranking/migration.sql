-- AlterTable
ALTER TABLE "User" ADD COLUMN "rankingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AlbumLog" ADD COLUMN "bucket" TEXT,
ADD COLUMN "rankPosition" DOUBLE PRECISION,
ADD COLUMN "ratingSource" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX "AlbumLog_userId_itemType_bucket_rankPosition_idx" ON "AlbumLog"("userId", "itemType", "bucket", "rankPosition");
