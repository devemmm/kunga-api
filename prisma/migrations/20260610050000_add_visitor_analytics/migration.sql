-- Website / app analytics: visitor sessions + events

CREATE TABLE IF NOT EXISTS "visitor_sessions" (
    "id"             TEXT NOT NULL,
    "sessionId"      TEXT NOT NULL,
    "userId"         TEXT,
    "source"         TEXT NOT NULL,

    "firstSeenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageViews"      INTEGER NOT NULL DEFAULT 0,
    "isBounce"       BOOLEAN NOT NULL DEFAULT true,

    "entryPath"      TEXT,
    "exitPath"       TEXT,
    "referrer"       TEXT,
    "utmSource"      TEXT,
    "utmMedium"      TEXT,
    "utmCampaign"    TEXT,

    "ip"             TEXT,
    "country"        TEXT,
    "countryCode"    TEXT,
    "region"         TEXT,
    "city"           TEXT,
    "timezone"       TEXT,
    "language"       TEXT,

    "browser"        TEXT,
    "browserVersion" TEXT,
    "os"             TEXT,
    "osVersion"      TEXT,
    "deviceType"     TEXT,
    "screenWidth"    INTEGER,
    "screenHeight"   INTEGER,
    "appVersion"     TEXT,

    CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "visitor_sessions_sessionId_key" ON "visitor_sessions"("sessionId");
CREATE INDEX IF NOT EXISTS "visitor_sessions_source_firstSeenAt_idx" ON "visitor_sessions"("source", "firstSeenAt");
CREATE INDEX IF NOT EXISTS "visitor_sessions_countryCode_idx" ON "visitor_sessions"("countryCode");
CREATE INDEX IF NOT EXISTS "visitor_sessions_userId_idx" ON "visitor_sessions"("userId");
CREATE INDEX IF NOT EXISTS "visitor_sessions_lastSeenAt_idx" ON "visitor_sessions"("lastSeenAt");

DO $$ BEGIN
  ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "analytics_events" (
    "id"        TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId"    TEXT,
    "source"    TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "path"      TEXT,
    "label"     TEXT,
    "meta"      JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "analytics_events_source_eventType_createdAt_idx" ON "analytics_events"("source", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_path_idx" ON "analytics_events"("path");
CREATE INDEX IF NOT EXISTS "analytics_events_sessionId_idx" ON "analytics_events"("sessionId");

DO $$ BEGIN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "visitor_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
