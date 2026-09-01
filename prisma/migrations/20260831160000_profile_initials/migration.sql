-- One or two letters for the avatar circle, chosen rather than uploaded.
-- Null means "derive from the name or handle".
ALTER TABLE "User" ADD COLUMN "initials" TEXT;
