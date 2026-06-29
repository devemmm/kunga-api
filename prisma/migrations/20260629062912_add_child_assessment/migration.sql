-- CreateTable
CREATE TABLE "child_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "gender" TEXT,
    "country" TEXT,
    "parentName" TEXT,
    "parentEmail" TEXT,
    "parentPhone" TEXT,
    "answers" JSONB NOT NULL,
    "domainScores" JSONB NOT NULL,
    "recommendedProgram" TEXT,
    "selectedProgram" TEXT,
    "strengths" TEXT[],
    "areasToSupport" TEXT[],
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_assessments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "child_assessments" ADD CONSTRAINT "child_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

