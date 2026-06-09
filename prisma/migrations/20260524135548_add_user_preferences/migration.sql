-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PDF', 'BOOK', 'LINK', 'AUDIO', 'WORKSHEET', 'IMAGE');

-- CreateTable
CREATE TABLE "module_resources" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "fileSize" INTEGER,
    "pageCount" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_resources_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "module_resources" ADD CONSTRAINT "module_resources_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
