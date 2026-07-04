-- Add card tokenization fields to subscriptions for Flutterwave auto-renewal
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "cardToken"            TEXT,
  ADD COLUMN IF NOT EXISTS "cardLast4"            TEXT,
  ADD COLUMN IF NOT EXISTS "cardBrand"            TEXT,
  ADD COLUMN IF NOT EXISTS "autoRenewAttemptedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "autoRenewFailedAt"    TIMESTAMPTZ;
