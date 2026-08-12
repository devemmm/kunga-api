-- Make userId optional on child_assessments to support guest (no-auth) submissions
ALTER TABLE "child_assessments" ALTER COLUMN "userId" DROP NOT NULL;

-- Drop the existing CASCADE foreign key and recreate with SET NULL
ALTER TABLE "child_assessments" DROP CONSTRAINT IF EXISTS "child_assessments_userId_fkey";
ALTER TABLE "child_assessments"
  ADD CONSTRAINT "child_assessments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
