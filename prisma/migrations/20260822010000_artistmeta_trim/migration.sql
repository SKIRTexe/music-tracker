-- Spotify withdrew `popularity` and `followers` from the artist object along with
-- `genres`, so nothing can ever populate these. Dropped rather than left nullable:
-- a column that looks like a metric but is always null is worse than no column.

-- AlterTable
ALTER TABLE "ArtistMeta" DROP COLUMN "popularity",
DROP COLUMN "followers";
