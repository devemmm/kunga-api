-- Add questionAddonUsd to subscriptions (extra monthly cost from credit purchases)
ALTER TABLE "subscriptions" ADD COLUMN "questionAddonUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Create question_credits table
CREATE TABLE "question_credits" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "monthKey"  TEXT NOT NULL,
  "credits"   INTEGER NOT NULL DEFAULT 1,
  "amountUsd" DOUBLE PRECISION NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'PENDING',
  "txRef"     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "question_credits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "question_credits_txRef_key"            ON "question_credits"("txRef");
CREATE        INDEX "question_credits_userId_monthKey_idx"  ON "question_credits"("userId", "monthKey");

ALTER TABLE "question_credits"
  ADD CONSTRAINT "question_credits_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
