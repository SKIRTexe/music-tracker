-- Comparison rating on by default for new accounts. Safe because it degrades:
-- comparisons stay inactive until RANKING_MIN_RATED items are rated, so the
-- first ratings still use the slider rather than an empty ladder.
ALTER TABLE "User" ALTER COLUMN "rankingEnabled" SET DEFAULT true;

-- Existing accounts were created under the old default rather than by choosing
-- it, so they are brought in line. Anyone who prefers the slider can switch it
-- back in Settings, or in Profile in the app.
UPDATE "User" SET "rankingEnabled" = true WHERE "rankingEnabled" = false;
