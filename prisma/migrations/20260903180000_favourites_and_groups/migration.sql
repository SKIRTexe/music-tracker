-- Favourite tracks, keyed by album id plus track title. Not a track id: the same
-- studio song carries a different id on every release, which is the rule the
-- rest of the library already follows for songs.
CREATE TABLE "FavouriteTrack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mbid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FavouriteTrack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FavouriteTrack_userId_mbid_title_key" ON "FavouriteTrack"("userId", "mbid", "title");
CREATE INDEX "FavouriteTrack_userId_mbid_idx" ON "FavouriteTrack"("userId", "mbid");
ALTER TABLE "FavouriteTrack" ADD CONSTRAINT "FavouriteTrack_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User-made groupings of albums.
CREATE TABLE "AlbumGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlbumGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlbumGroup_userId_name_key" ON "AlbumGroup"("userId", "name");
CREATE INDEX "AlbumGroup_userId_updatedAt_idx" ON "AlbumGroup"("userId", "updatedAt");
ALTER TABLE "AlbumGroup" ADD CONSTRAINT "AlbumGroup_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Membership. mbid is not a foreign key to AlbumLog on purpose: an album can be
-- grouped and later removed from the library, and losing the grouping to that
-- would be surprising.
CREATE TABLE "AlbumGroupItem" (
    "groupId" TEXT NOT NULL,
    "mbid" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlbumGroupItem_pkey" PRIMARY KEY ("groupId", "mbid")
);
CREATE INDEX "AlbumGroupItem_mbid_idx" ON "AlbumGroupItem"("mbid");
ALTER TABLE "AlbumGroupItem" ADD CONSTRAINT "AlbumGroupItem_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "AlbumGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
