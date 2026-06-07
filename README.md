# Kunga Basics — API

Fastify REST API powering the Kunga Basics mobile app and admin portal. Handles authentication, subscriptions, content delivery, payments, and all business logic.

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

## Environment Variables

```env
# ── App ────────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://portal.kunga.devemm.rw
PORTAL_URL=https://portal.kunga.devemm.rw

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
- Admin routes require `requireAdmin` (role = ADMIN)
- Premium content requires `requireSubscription` (ACTIVE/TRIAL/SCHOLARSHIP)
- Webhook routes verified by signature header
- Passwords: bcrypt cost factor 12
- 2FA: 6-digit OTP, 10-min TTL, max 3 attempts, Redis-backed
- Rate limiting on all routes

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
| Flutterwave | `https://api.kunga.devemm.rw/api/v1/webhooks/flutterwave` |
| Stripe | `https://api.kunga.devemm.rw/api/v1/webhooks/stripe` |
| RevenueCat | `https://api.kunga.devemm.rw/api/v1/webhooks/revenuecat` |

---

## API Docs (Swagger)

```
https://api.kunga.devemm.rw/docs
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
