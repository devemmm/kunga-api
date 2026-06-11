-- Add optional title/mood/tags to journal entries

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "mood" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
