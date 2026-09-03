-- Book downloads tracking table
-- Run this on the production database before deploying the new API version.

CREATE TABLE IF NOT EXISTS book_downloads (
  id           TEXT        PRIMARY KEY DEFAULT concat('c', substr(md5(random()::text), 1, 24)),
  "userId"     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "bookSlug"   TEXT        NOT NULL,
  platform     TEXT        NOT NULL DEFAULT 'web',
  ip           TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS book_downloads_userId_createdAt  ON book_downloads ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS book_downloads_bookSlug_createdAt ON book_downloads ("bookSlug", "createdAt");
CREATE INDEX IF NOT EXISTS book_downloads_createdAt          ON book_downloads ("createdAt");
