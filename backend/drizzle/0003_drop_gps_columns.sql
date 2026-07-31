-- Remove GPS tracking columns (yard workers are trusted at logged-in yard).
ALTER TABLE "scans" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "scans" DROP COLUMN IF EXISTS "longitude";
ALTER TABLE "scans" DROP COLUMN IF EXISTS "gps_accuracy_meters";
ALTER TABLE "yards" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "yards" DROP COLUMN IF EXISTS "longitude";
ALTER TABLE "yards" DROP COLUMN IF EXISTS "gps_radius_meters";
DELETE FROM "flags" WHERE "flag_type" = 'gps_outside_yard';
