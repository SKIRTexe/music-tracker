-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackUri" TEXT NOT NULL,
    "sourceMbid" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_userId_playlistId_trackUri_key" ON "PlaylistTrack"("userId", "playlistId", "trackUri");

-- CreateIndex
CREATE INDEX "PlaylistTrack_userId_sourceMbid_idx" ON "PlaylistTrack"("userId", "sourceMbid");

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
