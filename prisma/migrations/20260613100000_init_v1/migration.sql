-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'SCHOLARSHIP');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PDF', 'BOOK', 'LINK', 'AUDIO', 'WORKSHEET', 'IMAGE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VideoType" AS ENUM ('EXPLANATION', 'PRACTICE', 'TASTER', 'DEMONSTRATION', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "AnnTarget" AS ENUM ('ALL_SUBSCRIBERS', 'ACTIVE_ONLY', 'SPEECH_MODULE_USERS', 'ALL_REGISTERED');

-- CreateEnum
CREATE TYPE "AnnStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DonationMethod" AS ENUM ('STRIPE', 'FLUTTERWAVE', 'APPLE_PAY', 'GOOGLE_PAY');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PARENT',
    "subscriptionStatus" "SubStatus" NOT NULL DEFAULT 'NONE',
    "platform" TEXT,
    "pushToken" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "theme" TEXT NOT NULL DEFAULT 'system',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "ageMonths" INTEGER,
    "challenges" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "routineReminderOn" BOOLEAN NOT NULL DEFAULT true,
    "routineReminderTime" TEXT NOT NULL DEFAULT '08:00',
    "streakAlertsOn" BOOLEAN NOT NULL DEFAULT true,
    "milestoneRemindersOn" BOOLEAN NOT NULL DEFAULT true,
    "drGadResponseOn" BOOLEAN NOT NULL DEFAULT true,
    "announcementsOn" BOOLEAN NOT NULL DEFAULT true,
    "marketingOn" BOOLEAN NOT NULL DEFAULT false,
    "donationsOn" BOOLEAN NOT NULL DEFAULT false,
    "darkMode" TEXT NOT NULL DEFAULT 'system',
    "textSize" TEXT NOT NULL DEFAULT 'medium',
    "language" TEXT NOT NULL DEFAULT 'en',
    "cookieConsent" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revenuecatSubscriberId" TEXT,
    "flutterwaveTxId" TEXT,
    "stripePriceId" TEXT,
    "plan" TEXT NOT NULL,
    "status" "SubStatus" NOT NULL DEFAULT 'NONE',
    "platform" TEXT NOT NULL,
    "mobileMoneyProvider" TEXT,
    "mobileMoneyPhone" TEXT,
    "cardToken" TEXT,
    "cardLast4" TEXT,
    "cardBrand" TEXT,
    "autoRenewAttemptedAt" TIMESTAMPTZ,
    "autoRenewFailedAt" TIMESTAMPTZ,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "promoCode" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "questionAddonUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_credits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 1,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "txRef" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nameTranslations" JSONB,
    "descriptionTranslations" JSONB,

    CONSTRAINT "module_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "whatToExpect" TEXT,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "titleTranslations" JSONB,
    "descriptionTranslations" JSONB,
    "whatToExpectTranslations" JSONB,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

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
    "isPreviewClip" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "titleTranslations" JSONB,
    "descriptionTranslations" JSONB,

    CONSTRAINT "module_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleTranslations" JSONB,
    "type" "VideoType" NOT NULL DEFAULT 'EXPLANATION',
    "cloudflareStreamId" TEXT,
    "hlsUrl" TEXT,
    "thumbnailUrl" TEXT,
    "durationSecs" INTEGER,
    "hasdrm" BOOLEAN NOT NULL DEFAULT true,
    "captionsUrl" TEXT,
    "captionsLang" TEXT DEFAULT 'en',
    "isPreviewClip" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "watchedPercent" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "lastWatchedAt" TIMESTAMP(3),
    "lastVideoId" TEXT,
    "resumePositionSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "timestampSec" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "timestampSec" INTEGER NOT NULL,
    "noteText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "responseName" INTEGER,
    "eyeContact" INTEGER,
    "sitting" INTEGER,
    "sounds" INTEGER,
    "calmness" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "childResponse" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ask_gad_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "videoR2Key" TEXT,
    "videoDurationSec" INTEGER,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "responseText" TEXT,
    "responseVideoR2Key" TEXT,
    "respondedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ask_gad_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT,
    "mood" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "noteText" TEXT,
    "photoR2Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "titleTranslations" JSONB,
    "bodyTranslations" JSONB,
    "deepLink" TEXT,
    "targetAudience" "AnnTarget" NOT NULL DEFAULT 'ALL_SUBSCRIBERS',
    "status" "AnnStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "pushSentCount" INTEGER NOT NULL DEFAULT 0,
    "bannerViewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_announcement_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_announcement_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" "DonationMethod" NOT NULL,
    "flutterwaveTxId" TEXT,
    "stripePaymentIntentId" TEXT,
    "campaign" TEXT,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "showOnDonorWall" BOOLEAN NOT NULL DEFAULT false,
    "donorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_grants" (
    "id" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "scholarship_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "meta" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "isBounce" BOOLEAN NOT NULL DEFAULT true,
    "entryPath" TEXT,
    "exitPath" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "timezone" TEXT,
    "language" TEXT,
    "browser" TEXT,
    "browserVersion" TEXT,
    "os" TEXT,
    "osVersion" TEXT,
    "deviceType" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "appVersion" TEXT,

    CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "path" TEXT,
    "label" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "key" VARCHAR(120) NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "child_profiles_userId_key" ON "child_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "question_credits_txRef_key" ON "question_credits"("txRef");

-- CreateIndex
CREATE INDEX "question_credits_userId_monthKey_idx" ON "question_credits"("userId", "monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "module_groups_name_key" ON "module_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "videos_cloudflareStreamId_key" ON "videos"("cloudflareStreamId");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_userId_moduleId_key" ON "user_progress"("userId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "routine_entries_userId_date_category_taskKey_key" ON "routine_entries"("userId", "date", "category", "taskKey");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_reports_userId_weekStart_key" ON "milestone_reports"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "module_feedback_userId_moduleId_key" ON "module_feedback"("userId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_userId_date_key" ON "journal_entries"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "user_announcement_dismissals_userId_announcementId_key" ON "user_announcement_dismissals"("userId", "announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_sessions_sessionId_key" ON "visitor_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "visitor_sessions_source_firstSeenAt_idx" ON "visitor_sessions"("source", "firstSeenAt");

-- CreateIndex
CREATE INDEX "visitor_sessions_countryCode_idx" ON "visitor_sessions"("countryCode");

-- CreateIndex
CREATE INDEX "visitor_sessions_userId_idx" ON "visitor_sessions"("userId");

-- CreateIndex
CREATE INDEX "visitor_sessions_lastSeenAt_idx" ON "visitor_sessions"("lastSeenAt");

-- CreateIndex
CREATE INDEX "analytics_events_source_eventType_createdAt_idx" ON "analytics_events"("source", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_path_idx" ON "analytics_events"("path");

-- CreateIndex
CREATE INDEX "analytics_events_sessionId_idx" ON "analytics_events"("sessionId");

-- AddForeignKey
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_credits" ADD CONSTRAINT "question_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "module_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_resources" ADD CONSTRAINT "module_resources_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_bookmarks" ADD CONSTRAINT "video_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_bookmarks" ADD CONSTRAINT "video_bookmarks_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_notes" ADD CONSTRAINT "video_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_notes" ADD CONSTRAINT "video_notes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_entries" ADD CONSTRAINT "routine_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_reports" ADD CONSTRAINT "milestone_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_feedback" ADD CONSTRAINT "module_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_feedback" ADD CONSTRAINT "module_feedback_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ask_gad_submissions" ADD CONSTRAINT "ask_gad_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ask_gad_submissions" ADD CONSTRAINT "ask_gad_submissions_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_announcement_dismissals" ADD CONSTRAINT "user_announcement_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_announcement_dismissals" ADD CONSTRAINT "user_announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_grants" ADD CONSTRAINT "scholarship_grants_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "visitor_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "child_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "gender" TEXT,
    "country" TEXT,
    "parentName" TEXT,
    "parentEmail" TEXT,
    "parentPhone" TEXT,
    "answers" JSONB NOT NULL,
    "domainScores" JSONB NOT NULL,
    "recommendedProgram" TEXT,
    "selectedProgram" TEXT,
    "strengths" TEXT[],
    "areasToSupport" TEXT[],
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_assessments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "child_assessments" ADD CONSTRAINT "child_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "CountryStatus" AS ENUM ('AVAILABLE', 'NOT_AVAILABLE', 'MAINTENANCE', 'SCHEDULED');

-- CreateTable
CREATE TABLE "country_availability" (
    "id" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "countryName" TEXT NOT NULL,
    "countryFlag" TEXT NOT NULL DEFAULT '',
    "status" "CountryStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
    "launchDate" TIMESTAMP(3),
    "notes" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_audit_logs" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "prevStatus" "CountryStatus",
    "newStatus" "CountryStatus",
    "prevLaunch" TIMESTAMP(3),
    "newLaunch" TIMESTAMP(3),
    "action" TEXT NOT NULL,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_access_attempts" (
    "id" TEXT NOT NULL,
    "countryId" TEXT,
    "countryCode" TEXT,
    "countryName" TEXT,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_access_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country_availability_countryCode_key" ON "country_availability"("countryCode");

-- CreateIndex
CREATE INDEX "country_availability_status_idx" ON "country_availability"("status");

-- CreateIndex
CREATE INDEX "country_availability_launchDate_idx" ON "country_availability"("launchDate");

-- CreateIndex
CREATE INDEX "country_audit_logs_countryId_createdAt_idx" ON "country_audit_logs"("countryId", "createdAt");

-- CreateIndex
CREATE INDEX "country_audit_logs_performedById_idx" ON "country_audit_logs"("performedById");

-- CreateIndex
CREATE INDEX "country_access_attempts_countryId_createdAt_idx" ON "country_access_attempts"("countryId", "createdAt");

-- CreateIndex
CREATE INDEX "country_access_attempts_createdAt_idx" ON "country_access_attempts"("createdAt");

-- AddForeignKey
ALTER TABLE "country_availability" ADD CONSTRAINT "country_availability_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_audit_logs" ADD CONSTRAINT "country_audit_logs_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country_availability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_audit_logs" ADD CONSTRAINT "country_audit_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_access_attempts" ADD CONSTRAINT "country_access_attempts_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country_availability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "txRef" TEXT,
    "gatewayTxId" TEXT,
    "plan" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "gatewayResponse" JSONB,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_transactions_userId_idx" ON "payment_transactions"("userId");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_platform_idx" ON "payment_transactions"("platform");

-- CreateIndex
CREATE INDEX "payment_transactions_txRef_idx" ON "payment_transactions"("txRef");

-- CreateIndex
CREATE INDEX "payment_transactions_initiatedAt_idx" ON "payment_transactions"("initiatedAt");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
