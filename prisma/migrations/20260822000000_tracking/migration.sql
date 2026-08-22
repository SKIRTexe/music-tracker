-- AlterTable
ALTER TABLE "AlbumLog" ADD COLUMN "genres" TEXT[],
ADD COLUMN "trackCount" INTEGER,
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "enrichedAt" TIMESTAMP(3),
ADD COLUMN "wantedAt" TIMESTAMP(3),
ADD COLUMN "listenedAt" TIMESTAMP(3),
ADD COLUMN "firstRatedAt" TIMESTAMP(3),
ADD COLUMN "lastRatedAt" TIMESTAMP(3),
ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LibraryEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "logId" TEXT,
    "mbid" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistId" TEXT,
    "releaseYear" INTEGER,
    "genres" TEXT[],
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "fromRating" DOUBLE PRECISION,
    "toRating" DOUBLE PRECISION,
    "waitDays" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistMeta" (
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genres" TEXT[],
    "popularity" INTEGER,
    "followers" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistMeta_pkey" PRIMARY KEY ("artistId")
);

-- CreateIndex
CREATE INDEX "AlbumLog_userId_status_idx" ON "AlbumLog"("userId", "status");

-- CreateIndex
CREATE INDEX "AlbumLog_userId_listenedAt_idx" ON "AlbumLog"("userId", "listenedAt");

-- CreateIndex
CREATE INDEX "LibraryEvent_userId_createdAt_idx" ON "LibraryEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryEvent_userId_type_createdAt_idx" ON "LibraryEvent"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryEvent_userId_mbid_idx" ON "LibraryEvent"("userId", "mbid");

-- CreateIndex
CREATE INDEX "LibraryEvent_userId_toStatus_createdAt_idx" ON "LibraryEvent"("userId", "toStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "LibraryEvent" ADD CONSTRAINT "LibraryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: rows saved before tracking existed.
--
-- This is a *reconstruction*, not observation. Only two timestamps survive on an
-- existing row — addedAt and updatedAt — so the history it can support is "added
-- then, last changed then". Anything in between (a re-rate, a pass through
-- Listening) is unrecoverable and deliberately not invented.

UPDATE "AlbumLog" SET
  "wantedAt"     = CASE WHEN "status" = 'WANT' THEN "addedAt" END,
  "listenedAt"   = CASE WHEN "status" = 'LISTENED' THEN "updatedAt" END,
  "firstRatedAt" = CASE WHEN "rating" IS NOT NULL THEN "updatedAt" END,
  "lastRatedAt"  = CASE WHEN "rating" IS NOT NULL THEN "updatedAt" END,
  "ratingCount"  = CASE WHEN "rating" IS NOT NULL THEN 1 ELSE 0 END;

-- One ADDED event per existing row, at the time it was added.
INSERT INTO "LibraryEvent" (
  "id", "userId", "type", "logId", "mbid", "itemType", "title", "artistName",
  "artistId", "releaseYear", "genres", "toStatus", "createdAt"
)
SELECT gen_random_uuid()::text, "userId", 'ADDED', "id", "mbid", "itemType",
       "albumTitle", "artistName", "artistMbid", "releaseYear", '{}', "status", "addedAt"
FROM "AlbumLog";

-- Plus its last known change, where that provably happened later than the add.
-- The one-second guard keeps rows created directly as Listened from getting a
-- duplicate event at the same instant as their ADDED.
INSERT INTO "LibraryEvent" (
  "id", "userId", "type", "logId", "mbid", "itemType", "title", "artistName",
  "artistId", "releaseYear", "genres", "toStatus", "toRating", "createdAt"
)
SELECT gen_random_uuid()::text, "userId",
       CASE WHEN "rating" IS NOT NULL THEN 'RATED' ELSE 'STATUS_CHANGED' END,
       "id", "mbid", "itemType", "albumTitle", "artistName", "artistMbid",
       "releaseYear", '{}', "status", "rating", "updatedAt"
FROM "AlbumLog"
WHERE "updatedAt" > "addedAt" + INTERVAL '1 second';
