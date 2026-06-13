# Kunga Basics — API

Fastify REST API powering the Kunga Basics mobile app and admin portal. Handles authentication, subscriptions, content delivery, payments, and all business logic.

---

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `dev` | Active development. All new work is merged here first. |
| `staging` | Pre-production verification. Promote from `dev` when ready for QA. |
| `prod` | Production. Promote from `staging` after sign-off; this is what's deployed to `api.kungabasics.com`. |

Workflow: `dev` → `staging` → `prod`. Open PRs against `dev`; promote via merge/fast-forward to `staging` and `prod` once verified.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 (Alpine Docker) |
| Framework | Fastify 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL (Supabase) |
| Cache / Queue | Redis 7 + BullMQ |
| Auth | JWT (access 15m · refresh 30d) + Google OAuth |
| Payments | Flutterwave · Stripe · RevenueCat (Apple IAP / Google Play) |
| Storage | MinIO (S3-compatible) |
| Video | Cloudflare Stream |
| Push | Expo Push Notifications |
| Email | Nodemailer (SMTP) |
| 2FA | Email OTP (Redis TTL: 10 min, max 3 attempts) |

---

## Project Structure

```
kunga-api/
├── Dockerfile              # Multi-stage: builder (tsc) → production (node)
├── docker-compose.yml      # Redis + kunga-api services
├── entrypoint.sh           # Runs migrations → starts server
├── prisma/
│   ├── schema.prisma       # Full database schema
│   ├── migrations/         # SQL migration history
│   ├── seed.ts             # Development seed data
│   └── seed-prod.ts        # Production seed (admin user only)
└── src/
    ├── server.ts           # Fastify app setup, plugins, route registration
    ├── config/index.ts     # All env vars (single source of truth)
    ├── controllers/        # Request handlers
    ├── lib/                # prisma, redis, email, expo-push, minio, r2, logger
    ├── middleware/auth.ts  # requireAuth / requireAdmin / requireSubscription
    ├── models/             # Zod DTOs for all request bodies
    ├── routes/             # Route registrations + webhook handlers
    └── services/           # Business logic (admin, ask-gad, auth, donations, etc.)
```

---

## Setup

### With Docker (Recommended)

```bash
cp .env.example .env   # fill in all secrets
docker compose up --build -d

# View logs
docker compose logs -f kunga-api

# Run migrations manually (auto-runs on container start)
docker compose exec kunga-api npx prisma migrate deploy

# Seed development data
docker compose exec kunga-api npx tsx prisma/seed.ts
```

### Without Docker

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev          # tsx watch — hot reload
```

---

## Database Migrations

As of **V1**, the entire schema history has been consolidated into a single baseline migration: `prisma/migrations/20260613100000_init_v1`. This replaces the 14 incremental migrations accumulated during pre-V1 development (init, RBAC, audit log, question credits, etc.) — they have been removed from `prisma/migrations` and archived out of the repo.

**Fresh database setup:**

```bash
# Creates every table, enum, index, FK, and default from a completely empty database
npx prisma migrate deploy
npx prisma generate

# Seed RBAC roles/permissions + a super-admin account
npx tsx prisma/seed-prod.ts
```

**Notes:**

- `app_config` (admin-configurable pricing/feature flags, see below) is now a first-class Prisma model (`AppConfig` → `@@map("app_config")`) instead of being created at runtime via raw SQL.
- The consolidated baseline was validated by deploying it to a clean `kungav1` database and diffing the resulting schema (tables, columns, types, indexes, foreign keys) against the live `kunga` production database — zero structural differences.
- Existing environments (e.g. `kunga`) had their migration history resolved to this single baseline via `prisma migrate resolve --applied 20260613100000_init_v1`, with no data loss — only the `_prisma_migrations` bookkeeping table was affected.
- Going forward, all schema changes should be new migrations created with `npx prisma migrate dev --name <change>` on top of `20260613100000_init_v1`.

---

## Environment Variables

```env
# ── App ────────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://admin.kungabasics.com
PORTAL_URL=https://admin.kungabasics.com

# ── Database ───────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@host:5432/kunga

# ── JWT ────────────────────────────────────────────────────────────────────────
JWT_SECRET=your-64-char-secret
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d

# ── Google OAuth ───────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# ── SMTP (Nodemailer) ──────────────────────────────────────────────────────────
SMTP_HOST=mail.devemm.rw
SMTP_PORT=587
SMTP_USER=noreply
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=Kunga Basics <noreply@devemm.rw>

# ── Flutterwave ────────────────────────────────────────────────────────────────
# TEST keys: FLWSECK_TEST-... | LIVE keys: FLWSECK_LIVE-...
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxxx
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-xxxx
FLUTTERWAVE_WEBHOOK_HASH=your-webhook-hash
FLUTTERWAVE_REDIRECT_URL=kungabasics://payment

# ── Stripe ─────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# ── RevenueCat ─────────────────────────────────────────────────────────────────
REVENUECAT_API_KEY=appl_xxxx
REVENUECAT_WEBHOOK_AUTH_KEY=your-revenuecat-webhook-key

# ── Storage (MinIO) ────────────────────────────────────────────────────────────
MINIO_ENDPOINT=https://api.resources.devemm.rw
MINIO_PUBLIC_URL=https://api.resources.devemm.rw
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=kunga

# ── Cloudflare ─────────────────────────────────────────────────────────────────
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_STREAM_API_TOKEN=your-stream-token

# ── Redis ──────────────────────────────────────────────────────────────────────
REDIS_URL=redis://kunga-redis:6379

# ── Expo Push ──────────────────────────────────────────────────────────────────
EXPO_ACCESS_TOKEN=your-expo-access-token
```

---

## Database Key Models

```
User
  ├─ ChildProfile       childName, dateOfBirth, ageMonths, challenges[]
  ├─ Subscription       plan, status, platform, periodEnd, questionAddonUsd
  ├─ UserPreferences    notification toggles, theme, language, cookieConsent
  ├─ QuestionCredit     monthKey, credits, status (PENDING|ACTIVE|FAILED)
  ├─ AskGadSubmission   questionText, videoR2Key, responseText, status
  ├─ MilestoneReport    weekStart, scores (1-5), notes
  ├─ JournalEntry       date, noteText, photoR2Key
  ├─ UserProgress       per-module completion, watchedPercent
  ├─ RoutineEntry       date, category, taskKey, completed
  └─ ActivityLog        action, ipAddress, userAgent, country

ModuleGroup → Module → Video
Announcement → UserAnnouncementDismissal
Donation → (Flutterwave|Stripe)
ScholarshipGrant
app_config                (pricing + feature flags — admin editable)
```

---

## Admin-Configurable Pricing (`app_config` table)

| Key | Default | Description |
|-----|---------|-------------|
| `price_monthly_usd` | `14.00` | Monthly subscription price |
| `price_annual_usd` | `140.00` | Annual subscription price |
| `askgad_monthly_limit` | `2` | Free Ask Dr. Gad questions/month |
| `askgad_credit_price` | `5.00` | Price per Question Credit (USD) |
| `askgad_credits_per_pack` | `1` | Questions per credit purchase |
| `trial_days` | `7` | Free trial duration in days |

These can be changed live from the admin portal Pricing page — no redeploy needed.

---

## Email Templates

| Function | Trigger |
|----------|---------|
| `sendOtpEmail` | 2FA login, MFA setup |
| `sendPasswordResetEmail` | Forgot password flow |
| `sendWelcomeEmail` | User registration |
| `sendAdminEmail` | Admin direct message to user |
| `sendSubscriptionActivatedEmail` | Payment confirmed |

---

## Payment Flows

### Flutterwave (Subscriptions)
1. `POST /payments/flutterwave/initiate` → creates hosted payment link
2. User pays on Flutterwave's page (in-app WebView)
3. Redirect to `kungabasics://payment?status=successful&tx_ref=KB-...`
4. `GET /payments/flutterwave/verify?tx_ref=...` → server verifies + activates
5. `POST /webhooks/flutterwave` → backup activation on `charge.completed`

### Question Credits
1. `POST /ask-gad/credits/purchase` → creates Flutterwave link (tx_ref: `QCR-...`)
2. Same WebView flow as subscription
3. `POST /webhooks/flutterwave` → activates credit on `charge.completed`
4. `GET /ask-gad/credits/verify?tx_ref=...` → belt-and-suspenders verify

### Flutterwave Donations
1. `POST /donations/initiate` with `method: flutterwave` → hosted link (tx_ref: `DON-...`)
2. `POST /webhooks/flutterwave` → marks donation COMPLETED

---

## Security

- All routes require `requireAuth` (valid JWT) unless explicitly public
- Admin routes require `requireAdmin` (role = ADMIN) or a granular `requirePermission(...)` check (see RBAC below)
- Premium content requires `requireSubscription` (ACTIVE/TRIAL/SCHOLARSHIP)
- Webhook routes verified by signature header
- Passwords: bcrypt cost factor 12
- 2FA: 6-digit OTP, 10-min TTL, max 3 attempts, Redis-backed
- Rate limiting on all routes

---

## Roles & Permissions (RBAC)

Admin/support-team users are authorized via a role-based permission system layered on top of `requireAuth`.

### Models

```
Role          name, description, isSystem
Permission    code, description, category
RolePermission   (Role ↔ Permission)
UserRole          (User ↔ Role)
UserPermission    (User ↔ Permission — direct overrides, optional `granted: false` to revoke)
AuditLog          userId, action, module, entityType?, entityId?,
                  previousValue?, newValue?, ipAddress, userAgent, browser, device, createdAt
```

A user's **effective permissions** = union of all permissions from their assigned roles, plus any direct `UserPermission` grants, minus any direct revokes. `Role.permissions = '*'` (Super Admin) grants every permission.

`requirePermission('CODE_A', 'CODE_B', ...)` (in `src/middleware/auth.ts`) allows the request if the user has **any** of the listed permission codes.

### Permission catalogue (`prisma/rbac-seed.ts`)

| Category | Codes |
|----------|-------|
| Dashboard | `VIEW_DASHBOARD` |
| Analytics | `VIEW_ANALYTICS` |
| Users | `VIEW_USERS`, `MANAGE_USERS`, `VIEW_SUBSCRIPTIONS`, `MANAGE_SUBSCRIPTIONS` |
| Ask Dr. Gad | `VIEW_QUESTIONS`, `ASSIGN_QUESTIONS`, `ANSWER_QUESTIONS`, `ESCALATE_QUESTIONS` |
| Content | `VIEW_CONTENT`, `MANAGE_CONTENT`, `MANAGE_VIDEOS`, `MANAGE_ANNOUNCEMENTS` |
| Revenue | `VIEW_DONATIONS`, `VIEW_MOBILE_MONEY`, `VIEW_CARD_PAYMENTS`, `MANAGE_PRICING` |
| Administration | `MANAGE_ROLES`, `MANAGE_PERMISSIONS`, `VIEW_SUPPORT_TEAM`, `MANAGE_SUPPORT_TEAM`, `VIEW_AUDIT_LOGS` |

### Default roles

| Role | Access |
|------|--------|
| Super Admin | `*` — every permission, including role/permission/audit management |
| Support Manager | Dashboard, Users (view), Subscriptions (view), Ask Dr. Gad (full), Support Team (view) |
| Support Agent | Dashboard, Ask Dr. Gad (answer/escalate) |
| Content Manager | Content, Videos, Announcements |
| Finance Officer | Revenue views + Pricing |

Re-run the seed (idempotent) with `npx tsx prisma/rbac-seed.ts` or via the main `prisma/seed.ts`.

### Roles & Permissions API (`/admin/roles`, `/admin/permissions`)

| Method & Path | Permission | Description |
|----------------|------------|-------------|
| `GET /admin/roles` | `MANAGE_ROLES` | List roles |
| `POST /admin/roles` | `MANAGE_ROLES` | Create role |
| `PATCH /admin/roles/:id` | `MANAGE_ROLES` | Update role |
| `DELETE /admin/roles/:id` | `MANAGE_ROLES` | Delete role (non-system, unused only) |
| `GET /admin/roles/:id/users` | `MANAGE_ROLES` | List users assigned to a role |
| `PATCH /admin/roles/:id/permissions` | `MANAGE_ROLES` | Replace a role's permission set |
| `GET /admin/permissions` | `MANAGE_ROLES` or `MANAGE_PERMISSIONS` | List all permissions grouped by category |

### Support Team API (`/admin/support-team`)

| Method & Path | Permission | Description |
|----------------|------------|-------------|
| `GET /admin/support-team` | `MANAGE_SUPPORT_TEAM` or `VIEW_SUPPORT_TEAM` | List support team members |
| `POST /admin/support-team` | `MANAGE_SUPPORT_TEAM` | Create member — generates a temp password, returns it once (`tempPassword`) and emails a setup link |
| `PATCH /admin/support-team/:id` | `MANAGE_SUPPORT_TEAM` | Update member |
| `POST /admin/support-team/:id/deactivate` | `MANAGE_SUPPORT_TEAM` | Deactivate member |
| `POST /admin/support-team/:id/activate` | `MANAGE_SUPPORT_TEAM` | Reactivate member |
| `POST /admin/support-team/:id/reset-password` | `MANAGE_SUPPORT_TEAM` | Send password-reset email |
| `POST /admin/support-team/:id/regenerate-password` | `MANAGE_SUPPORT_TEAM` | Generate a new one-time temp password (overwrites the previous one — returned once, not stored in plaintext) |
| `PATCH /admin/support-team/:id/roles` | `MANAGE_SUPPORT_TEAM` | Assign roles to member |
| `PATCH /admin/support-team/:id/permissions` | `MANAGE_SUPPORT_TEAM` | Direct permission overrides (grant/revoke) |

### Audit Log

Every RBAC, Support Team, and Ask Dr. Gad assign/escalate action is recorded via `RbacService.writeAuditLog(...)`:

- `entityType` / `entityId` — what was affected (`Role`, `User`, `AskGadSubmission`, etc.) — `null` for log rows written before this field existed.
- `previousValue` / `newValue` — JSON snapshots for diffing.
- `browser` / `device` — parsed from `userAgent` via `parseUserAgent()` (`src/lib/ua.ts`) at read time.
- `sessionId` — not currently tracked (JWTs are stateless); reserved column, always `null`.

Exposed read-only via `GET /admin/audit-log` (`VIEW_AUDIT_LOGS`), with `search` and `module` filters.

---

## Public Routes (No Auth)

| Route | Description |
|-------|-------------|
| `POST /auth/register` | Registration |
| `POST /auth/login` | Login |
| `POST /auth/google` | Google OAuth |
| `POST /auth/refresh` | Token refresh |
| `POST /auth/forgot-password` | Password reset request |
| `POST /auth/reset-password` | Password reset confirm |
| `POST /auth/mfa/verify` | 2FA OTP verification |
| `POST /auth/mfa/resend` | Resend OTP |
| `POST /donations/initiate` | Donation (public) |
| `GET /donations/donor-wall` | Public donor wall |
| `POST /webhooks/*` | Payment webhooks |

---

## Deployment

**Production server**: `root@devemm.rw` → `/opt/kunga-basics/kunga-api`

```bash
# Deploy changes
rsync -avz src/ root@devemm.rw:/opt/kunga-basics/kunga-api/src/
ssh root@devemm.rw "cd /opt/kunga-basics/kunga-api && docker compose up --build -d kunga-api"

# Update env only (no rebuild)
ssh root@devemm.rw "cd /opt/kunga-basics/kunga-api && docker compose up -d"

# Check logs
ssh root@devemm.rw "docker logs kunga-api --tail 50"
```

### Webhook URLs

| Provider | URL |
|----------|-----|
| Flutterwave | `https://api.kungabasics.com/api/v1/webhooks/flutterwave` |
| Stripe | `https://api.kungabasics.com/api/v1/webhooks/stripe` |
| RevenueCat | `https://api.kungabasics.com/api/v1/webhooks/revenuecat` |

---

## API Docs (Swagger)

```
https://api.kungabasics.com/docs
http://localhost:3001/docs   (development)
```

---

## App Version Management

The API exposes a public endpoint the mobile app calls on every startup to check if an update is required.

### Endpoint

```
GET /api/v1/app/version
```

No authentication required. Returns:

```json
{
  "minVersion":      "1.0.0",
  "latestVersion":   "1.0.0",
  "storeUrlIos":     "https://apps.apple.com/app/kunga-basics/id...",
  "storeUrlAndroid": "https://play.google.com/store/apps/details?id=..."
}
```

### Configuring via Admin Portal

All four values are stored in the `app_config` table and editable from **Admin Portal → Pricing** without any redeploy:

| Key | Default | Description |
|-----|---------|-------------|
| `app_min_version` | `1.0.0` | Minimum version — users below are forced to update (cannot use app) |
| `app_latest_version` | `1.0.0` | Latest version — users below see an optional update prompt |
| `app_store_url_ios` | *(empty)* | iOS App Store link shown in update dialogs |
| `app_store_url_android` | *(empty)* | Android Play Store link shown in update dialogs |

### How the Mobile App Uses This

On every app launch:
1. Calls `GET /api/v1/app/version`
2. Compares `currentVersion` (from `app.json`) with `minVersion` and `latestVersion`
3. If `currentVersion < minVersion` → **forced update dialog** (blocks app, cannot dismiss)
4. If `minVersion ≤ currentVersion < latestVersion` → **optional update dialog** (dismissible)
5. If `currentVersion ≥ latestVersion` → no dialog

### Workflow When Releasing a New Version

```bash
# 1. Build and submit to App Store
eas build --platform all --profile production
eas submit --platform all --profile production

# 2. Once approved and live — update in Admin Portal Pricing page:
#    app_latest_version = "1.1.0"         ← optional prompt for existing users
#    app_store_url_ios  = "https://..."   ← update if App Store ID changed

# 3. If the new version has breaking changes (old app won't work):
#    app_min_version = "1.1.0"            ← forces all users to update
```
