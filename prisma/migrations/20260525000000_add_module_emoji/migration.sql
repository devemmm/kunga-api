-- Add optional emoji field to Module.
-- When null, the API falls back to the parent ModuleGroup's emoji.
ALTER TABLE "modules" ADD COLUMN "emoji" TEXT;
