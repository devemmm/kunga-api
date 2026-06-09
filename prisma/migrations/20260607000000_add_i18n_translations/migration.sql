-- Add i18n translation JSON columns to content models
-- English text stays in the existing columns as the default/fallback.

ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "titleTranslations" JSONB;
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "descriptionTranslations" JSONB;
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "whatToExpectTranslations" JSONB;

ALTER TABLE "module_groups" ADD COLUMN IF NOT EXISTS "nameTranslations" JSONB;
ALTER TABLE "module_groups" ADD COLUMN IF NOT EXISTS "descriptionTranslations" JSONB;

ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "titleTranslations" JSONB;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "bodyTranslations" JSONB;

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "titleTranslations" JSONB;

ALTER TABLE "module_resources" ADD COLUMN IF NOT EXISTS "titleTranslations" JSONB;
ALTER TABLE "module_resources" ADD COLUMN IF NOT EXISTS "descriptionTranslations" JSONB;
