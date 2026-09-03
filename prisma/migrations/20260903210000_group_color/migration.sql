-- A hex colour per group, stored as the value rather than a palette index so
-- the palette can be reordered without recolouring everyone's shelves.
ALTER TABLE "AlbumGroup" ADD COLUMN "color" TEXT;
