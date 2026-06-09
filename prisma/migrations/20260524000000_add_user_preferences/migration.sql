-- AlterTable: add admin portal preference columns to users
-- theme      — UI theme preference: "system" | "light" | "dark"
-- lang       — UI language preference: "en" | "fr" | "kin"
-- mfaEnabled — whether Two-Factor Authentication is enabled for this admin

ALTER TABLE "users"
  ADD COLUMN "theme"      TEXT    NOT NULL DEFAULT 'system',
  ADD COLUMN "lang"       TEXT    NOT NULL DEFAULT 'en',
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
