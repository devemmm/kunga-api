-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'ESCALATED';

-- AlterTable
ALTER TABLE "ask_gad_submissions"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "escalationReason" TEXT,
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalatedById" TEXT;

-- AddForeignKey
ALTER TABLE "ask_gad_submissions" ADD CONSTRAINT "ask_gad_submissions_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
