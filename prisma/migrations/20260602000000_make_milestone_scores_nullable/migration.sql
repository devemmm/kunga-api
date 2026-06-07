-- AlterTable: make all milestone score columns nullable
-- Allows partial saves (e.g. user fills only some categories)
ALTER TABLE "milestone_reports"
  ALTER COLUMN "responseName" DROP NOT NULL,
  ALTER COLUMN "eyeContact"   DROP NOT NULL,
  ALTER COLUMN "sitting"      DROP NOT NULL,
  ALTER COLUMN "sounds"       DROP NOT NULL,
  ALTER COLUMN "calmness"     DROP NOT NULL;
