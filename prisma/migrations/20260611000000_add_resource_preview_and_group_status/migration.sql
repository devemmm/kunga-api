-- Add free-preview flag to module resources, and an archive/draft status to module groups

ALTER TABLE "module_resources" ADD COLUMN IF NOT EXISTS "isPreviewClip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "module_groups" ADD COLUMN IF NOT EXISTS "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED';
