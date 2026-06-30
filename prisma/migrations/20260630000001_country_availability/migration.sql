-- CreateEnum
CREATE TYPE "CountryStatus" AS ENUM ('AVAILABLE', 'NOT_AVAILABLE', 'MAINTENANCE', 'SCHEDULED');

-- CreateTable
CREATE TABLE "country_availability" (
    "id" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "countryName" TEXT NOT NULL,
    "countryFlag" TEXT NOT NULL DEFAULT '',
    "status" "CountryStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
    "launchDate" TIMESTAMP(3),
    "notes" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_audit_logs" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "prevStatus" "CountryStatus",
    "newStatus" "CountryStatus",
    "prevLaunch" TIMESTAMP(3),
    "newLaunch" TIMESTAMP(3),
    "action" TEXT NOT NULL,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_access_attempts" (
    "id" TEXT NOT NULL,
    "countryId" TEXT,
    "countryCode" TEXT,
    "countryName" TEXT,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_access_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country_availability_countryCode_key" ON "country_availability"("countryCode");

-- CreateIndex
CREATE INDEX "country_availability_status_idx" ON "country_availability"("status");

-- CreateIndex
CREATE INDEX "country_availability_launchDate_idx" ON "country_availability"("launchDate");

-- CreateIndex
CREATE INDEX "country_audit_logs_countryId_createdAt_idx" ON "country_audit_logs"("countryId", "createdAt");

-- CreateIndex
CREATE INDEX "country_audit_logs_performedById_idx" ON "country_audit_logs"("performedById");

-- CreateIndex
CREATE INDEX "country_access_attempts_countryId_createdAt_idx" ON "country_access_attempts"("countryId", "createdAt");

-- CreateIndex
CREATE INDEX "country_access_attempts_createdAt_idx" ON "country_access_attempts"("createdAt");

-- AddForeignKey
ALTER TABLE "country_availability" ADD CONSTRAINT "country_availability_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_audit_logs" ADD CONSTRAINT "country_audit_logs_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country_availability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_audit_logs" ADD CONSTRAINT "country_audit_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_access_attempts" ADD CONSTRAINT "country_access_attempts_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country_availability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

