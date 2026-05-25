# kunga-api — Fastify REST API

> Fastify + Prisma + TypeScript REST API for the Kunga Basics child development platform.

---

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Deployment Troubleshooting](#deployment-troubleshooting)

---

## Architecture

kunga-api follows a **4-layer architecture** for clean separation of concerns:

```
Request → Route → Controller → Service → Database (Prisma)
```

| Layer | Responsibility |
|-------|---------------|
| **Route** (`src/routes/`) | Registers HTTP method + path, Swagger schema, middleware guards |
| **Controller** (`src/controllers/`) | Parses & validates request, calls service, formats response |
| **Service** (`src/services/`) | All business logic, database queries, external API calls |
| **Model** (`src/models/`) | Zod DTOs — shared validation schemas used by controllers |

---

## Project Structure

```
kunga-api/
├── prisma/
│   └── schema.prisma          # Database schema (Prisma ORM)
├── src/
│   ├── config/
│   │   └── index.ts           # Centralised config (reads from env vars)
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces & enums
│   ├── models/                # Zod DTOs — request validation schemas
│   │   ├── auth.model.ts
│   │   ├── user.model.ts
│   │   ├── module.model.ts
│   │   └── index.ts           # All remaining models (video, payment, etc.)
│   ├── services/              # Business logic layer
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── module.service.ts
│   │   ├── video.service.ts
│   │   ├── announcement.service.ts
│   │   ├── subscription.service.ts
│   │   ├── donation.service.ts
│   │   ├── ask-gad.service.ts
│   │   └── admin.service.ts
│   ├── controllers/           # Request/response layer
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   ├── module.controller.ts
│   │   └── index.ts           # All remaining controllers
│   ├── routes/                # Route registration + Swagger schemas
│   │   ├── auth.route.ts
│   │   ├── users.route.ts
│   │   ├── index.ts           # All feature routes
│   │   ├── progress.route.ts  # Progress, routine, milestones, journal
│   │   └── webhooks.route.ts  # Flutterwave, Stripe, RevenueCat webhooks
│   ├── middleware/
│   │   └── auth.ts            # requireAuth, requireAdmin, requireSubscription
│   ├── lib/
│   │   └── prisma.ts          # Prisma client singleton
│   └── server.ts              # Fastify app setup + plugin registration
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (or Supabase)
- Redis (for BullMQ job queues)

### Installation

```bash
# 1. Install dependencies
cd kunga-api
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — see DATABASE_URL note below

# 3. Set up the database (see Database Setup section)

# 4. Start development server
npm run dev
```

The API starts at **http://localhost:3001**  
Swagger UI docs at **http://localhost:3001/docs**

---

### Database Setup

#### ⚠️ Special characters in the database password

If your PostgreSQL password contains any of these characters — `@ : / ? # [ ] ! $ \ + ( )` — they **must be percent-encoded** in the `DATABASE_URL`, otherwise Prisma will fail to parse the connection string (common error: *"invalid port number in database URL"*).

Encode only the **password** part using Node.js:

```bash
node -e "console.log(encodeURIComponent('your-raw-password-here'))"
```

Then build the URL manually:

```
postgresql://USERNAME:ENCODED_PASSWORD@HOST:5432/DATABASE
```

**Example** — raw password `$k\ppYMY+(?:#`:

```bash
# Raw (broken — # cuts off @host:port/db)
DATABASE_URL="postgresql://kunga:$k\ppYMY+(?:#@devemm.rw:5432/kunga"

# Correct — password percent-encoded
DATABASE_URL="postgresql://kunga:%24k%5CppYMY%2B%28%3F%23@devemm.rw:5432/kunga"
```

| Character | Encoded |
|-----------|---------|
| `$`       | `%24`   |
| `\`       | `%5C`   |
| `+`       | `%2B`   |
| `(`       | `%28`   |
| `?`       | `%3F`   |
| `:`       | `%3A`   |
| `#`       | `%23`   |
| `@`       | `%40`   |

---

#### Option A — Development (full schema + dummy data)

Use this when setting up a local or staging database for the first time. It creates all tables and inserts realistic dummy data so every dashboard widget and analytics chart is populated.

```bash
# 1. Create tables from schema.prisma (no migration history — fastest for fresh DBs)
npx prisma db push

# 2. Seed with admin + 30 dummy users, modules, videos, subscriptions, donations, etc.
npx prisma db seed
```

**What the seed creates:**

| Data | Count |
|------|-------|
| Admin account | 1 |
| Parent users (6 countries) | 30 |
| Module groups | 3 |
| Modules | 8 |
| Videos | 12 |
| Subscriptions (Apple / Google / Stripe / Flutterwave) | 30 |
| Ask Dr. Gad submissions | 6 |
| Donations + scholarship grants | ~15 |
| Activity logs (for retention charts) | ~447 |
| Announcements | 3 |

**Default admin credentials:**

| Field    | Value                      |
|----------|----------------------------|
| Email    | `admin@kungabasics.com`    |
| Password | `Admin@1234`               |

---

#### Option B — Production (full schema + super admin only)

Use this when deploying to a live environment. It creates all tables and inserts **only** the super-admin account — no test users, no dummy transactions, no fake data.

```bash
# 1. Apply migrations in order (safe for production — preserves existing data)
npx prisma migrate deploy

# 2. Create the super admin account only
npx tsx prisma/seed-prod.ts
```

**What `seed-prod.ts` creates:**

| Field    | Value                      |
|----------|----------------------------|
| Email    | `admin@kungabasics.com`    |
| Password | `Admin@1234`               |
| Role     | `ADMIN`                    |

> ⚠️ **Change the admin password immediately after first login.**  
> The script is idempotent — running it again updates the role and status without duplicating the account.

**In Docker:**

```bash
docker compose exec kunga-api npx prisma migrate deploy
docker compose exec kunga-api npx tsx prisma/seed-prod.ts
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npx prisma studio` | Open Prisma database browser |
| `npx prisma migrate dev` | Run & create migrations |
| `npx prisma migrate deploy` | Apply migrations in production |

### Docker

kunga-api ships with its own `docker-compose.yml` that includes Redis.

```bash
cd kunga-api
cp .env.example .env        # fill in secrets
docker compose up --build -d

# Tail logs
docker compose logs -f

# Shell into the container
docker compose exec kunga-api sh

# Stop everything
docker compose down
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) |
| `JWT_ACCESS_EXPIRES` | Access token expiry (default: `15m`) |
| `JWT_REFRESH_EXPIRES` | Refresh token expiry (default: `30d`) |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_STREAM_API_TOKEN` | Cloudflare Stream API token |
| `CLOUDFLARE_R2_ACCESS_KEY` | R2 access key |
| `CLOUDFLARE_R2_SECRET_KEY` | R2 secret key |
| `CLOUDFLARE_R2_BUCKET` | R2 bucket name |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_MONTHLY_PRICE_ID` | Stripe Price ID for monthly plan |
| `STRIPE_ANNUAL_PRICE_ID` | Stripe Price ID for annual plan |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave secret key |
| `FLUTTERWAVE_WEBHOOK_HASH` | Flutterwave webhook verification hash |
| `REVENUECAT_WEBHOOK_AUTH_KEY` | RevenueCat webhook auth key |
| `EXPO_ACCESS_TOKEN` | Expo push notification access token |
| `RESEND_API_KEY` | Resend transactional email API key |
| `REDIS_URL` | Redis connection URL for BullMQ |

---

## API Reference

Interactive Swagger docs available at `/docs` when the server is running.

### Base URL
```
http://localhost:3001/api/v1
```

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | Public | Create account with email + password |
| `POST` | `/auth/login` | Public | Login and receive JWT tokens |
| `POST` | `/auth/google` | Public | Exchange Google ID token for app JWT |
| `POST` | `/auth/refresh` | Public | Rotate access token using refresh token |
| `POST` | `/auth/forgot-password` | Public | Request password reset email |
| `POST` | `/auth/reset-password` | Public | Confirm password reset |
| `POST` | `/auth/logout` | 🔒 User | Logout (client discards tokens) |
| `GET`  | `/auth/me` | 🔒 User | Get current user with subscription info |

### User Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/users/me` | 🔒 User | Get full profile |
| `PATCH`  | `/users/me` | 🔒 User | Update name, email, avatar, push token |
| `POST`   | `/users/me/change-password` | 🔒 User | Change password |
| `POST`   | `/users/me/child-profile` | 🔒 User | Create / update child profile |
| `GET`    | `/users/me/data-export` | 🔒 User | GDPR Article 20 — download all data |
| `DELETE` | `/users/me` | 🔒 User | GDPR Article 17 — delete account |
| `GET`    | `/users` | 🔒 Admin | List all users (paginated + search) |
| `GET`    | `/users/:id` | 🔒 Admin | Get single user details |

### Module Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/modules/groups` | 🔒 User | List groups with gated content |
| `GET`    | `/modules/groups/list` | 🔒 Admin | Groups list for dropdowns |
| `POST`   | `/modules/groups` | 🔒 Admin | Create module group |
| `GET`    | `/modules` | 🔒 User | List modules |
| `GET`    | `/modules/:id` | 🔒 User | Get module detail with videos |
| `POST`   | `/modules` | 🔒 Admin | Create module |
| `PATCH`  | `/modules/:id` | 🔒 Admin | Update module |
| `POST`   | `/modules/:id/publish` | 🔒 Admin | Publish module |
| `POST`   | `/modules/:id/unpublish` | 🔒 Admin | Unpublish module |
| `DELETE` | `/modules/:id` | 🔒 Admin | Archive module |
| `POST`   | `/modules/:moduleId/feedback` | 🔒 User | Rate and review module |

### Video Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/videos` | 🔒 Admin | List all videos |
| `POST`   | `/videos` | 🔒 Admin | Create video record |
| `PATCH`  | `/videos/:id` | 🔒 Admin | Update video metadata |
| `DELETE` | `/videos/:id` | 🔒 Admin | Archive video |
| `POST`   | `/videos/upload-url` | 🔒 Admin | Get Cloudflare Stream TUS upload URL |
| `GET`    | `/videos/:id/stream` | 🔒 Sub | Get signed HLS stream URL (2h) |
| `POST`   | `/videos/:id/bookmark` | 🔒 User | Toggle bookmark |
| `GET`    | `/videos/:id/notes` | 🔒 User | Get timestamped notes |
| `POST`   | `/videos/:id/notes` | 🔒 User | Add a note |

### Mobile App Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET/POST` | `/progress/:moduleId` | 🔒 User | Module progress |
| `POST`     | `/progress/:moduleId/feedback` | 🔒 User | Rate module |
| `GET`      | `/routine/:date` | 🔒 User | Daily routine (`YYYY-MM-DD`) |
| `POST`     | `/routine/sync` | 🔒 User | Bulk sync routine entries |
| `PATCH`    | `/routine/:date/:category/:taskKey` | 🔒 User | Toggle task |
| `GET`      | `/routine/streak/current` | 🔒 User | Current streak count |
| `GET/POST` | `/milestones` | 🔒 User | Milestone reports |
| `GET/PATCH`| `/preferences` | 🔒 User | Notification preferences |
| `GET/POST` | `/journal` | 🔒 User | Journal entries |
| `GET`      | `/journal/photo-upload-url` | 🔒 User | R2 presigned upload URL |

### Subscription & Payment Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/subscriptions/status` | 🔒 User | My subscription + access check |
| `GET`  | `/subscriptions` | 🔒 Admin | All subscriptions |
| `POST` | `/subscriptions/:userId/override` | 🔒 Admin | Override subscription |
| `POST` | `/subscriptions/:userId/cancel` | 🔒 Admin | Cancel subscription |
| `POST` | `/subscriptions/:userId/restore` | 🔒 Admin | Restore subscription |
| `POST` | `/subscriptions/revenuecat/sync` | 🔒 User | Sync after Apple/Google IAP |
| `POST` | `/payments/flutterwave/initiate` | 🔒 User | Start Mobile Money checkout |
| `GET`  | `/payments/flutterwave/callback` | Public | Flutterwave redirect callback |
| `POST` | `/payments/stripe/create-checkout` | 🔒 User | Create Stripe checkout session |
| `GET`  | `/payments/mobile-money` | 🔒 Admin | List Mobile Money transactions |
| `POST` | `/payments/mobile-money/:txId/activate` | 🔒 Admin | Manual subscription activation |

### Donation Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/donations/initiate` | Public | Start a donation |
| `GET`  | `/donations` | 🔒 Admin | List all donations |
| `GET`  | `/donations/stats` | 🔒 Admin | Donation totals by method |
| `GET`  | `/donations/donor-wall` | Public | Public donor wall |
| `POST` | `/donations/scholarships/grant` | 🔒 Admin | Grant scholarship by email |
| `GET`  | `/donations/scholarships` | 🔒 Admin | Active scholarship grants |

### Ask Dr. Gad Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/ask-gad` | 🔒 User | My submissions |
| `POST` | `/ask-gad` | 🔒 Sub | Submit question (2/month limit) |
| `GET`  | `/ask-gad/upload-url` | 🔒 User | R2 presigned URL for video upload |
| `GET`  | `/ask-gad/admin/queue` | 🔒 Admin | Submission queue |
| `POST` | `/ask-gad/admin/:id/respond` | 🔒 Admin | Send response |
| `GET`  | `/ask-gad/admin/response-upload-url` | 🔒 Admin | R2 URL for video response |

### Announcement Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`    | `/announcements` | 🔒 User | Active announcements |
| `GET`    | `/announcements/active-banner` | 🔒 User | Current in-app banner |
| `POST`   | `/announcements/:id/dismiss` | 🔒 User | Dismiss announcement |
| `GET`    | `/announcements/admin` | 🔒 Admin | All announcements |
| `POST`   | `/announcements/admin` | 🔒 Admin | Create announcement |
| `PATCH`  | `/announcements/admin/:id` | 🔒 Admin | Update announcement |
| `DELETE` | `/announcements/admin/:id` | 🔒 Admin | Delete announcement |
| `POST`   | `/announcements/admin/:id/publish` | 🔒 Admin | Publish + send push |

### Admin & Analytics Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/dashboard` | 🔒 Admin | Aggregated dashboard stats |
| `GET` | `/admin/activity-log` | 🔒 Admin | Paginated activity log |
| `GET` | `/admin/module-stats` | 🔒 Admin | Module completion rates |
| `GET` | `/admin/payment-stats` | 🔒 Admin | Revenue by platform |
| `GET` | `/admin/signup-trend` | 🔒 Admin | 8-week signup trend |
| `GET` | `/analytics/overview` | 🔒 Admin | DAU, MAU, stickiness |
| `GET` | `/analytics/funnel` | 🔒 Admin | Subscription conversion funnel |
| `GET` | `/analytics/retention` | 🔒 Admin | Cohort retention table |
| `GET` | `/analytics/mobile-money` | 🔒 Admin | Mobile Money provider breakdown |

### Webhook Endpoints (No Auth — Signature Verified)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/flutterwave` | Flutterwave payment events |
| `POST` | `/webhooks/stripe` | Stripe subscription lifecycle + donations |
| `POST` | `/webhooks/revenuecat` | RevenueCat Apple/Google IAP events |

---

## Authentication

### Flow

```
1. POST /auth/login → { accessToken, refreshToken }
2. Include in requests: Authorization: Bearer <accessToken>
3. On 401: POST /auth/refresh → new { accessToken, refreshToken }
4. On logout: discard both tokens client-side
```

### Middleware Guards

| Guard | Description |
|-------|-------------|
| `requireAuth` | Valid JWT required, loads `req.currentUser` |
| `requireAdmin` | `requireAuth` + `role === 'ADMIN'` |
| `requireSubscription` | `requireAuth` + active/trial/scholarship status |

---

## Database Schema

Key models in `prisma/schema.prisma`:

| Model | Description |
|-------|-------------|
| `User` | Account, auth, subscription status |
| `ChildProfile` | Child name, DOB, challenges |
| `UserPreferences` | Notification settings |
| `Subscription` | Plan, platform, status, dates |
| `ModuleGroup` | Content group (Speech, Calm, etc.) |
| `Module` | Individual module with code + content |
| `Video` | Cloudflare Stream video metadata |
| `UserProgress` | Per-module completion tracking |
| `VideoBookmark` | Saved videos |
| `VideoNote` | Timestamped notes on videos |
| `RoutineEntry` | Daily checklist entries |
| `MilestoneReport` | Weekly progress reports |
| `JournalEntry` | Text + photo journal |
| `ModuleFeedback` | Rating + comment |
| `AskGadSubmission` | Q&A submission + response |
| `Announcement` | Push + in-app announcements |
| `Donation` | Donation records |
| `ScholarshipGrant` | Free access grants |
| `ActivityLog` | Audit trail |

---

## Deployment

### Docker (Recommended)

kunga-api has its own `docker-compose.yml` that starts Redis and the API together. It also creates the shared `kunga-network` bridge that `kunga-admin-portal` joins.

```bash
cd kunga-api
cp .env.example .env                               # fill in secrets
docker compose up --build -d                       # build & start Redis + API

# Run migrations manually inside the container
docker compose exec kunga-api npx prisma migrate deploy

# Seed development data
docker compose exec kunga-api npx tsx prisma/seed.ts

# Open a shell
docker compose exec kunga-api sh
```

### Manual Build

```bash
npm run build
npx prisma migrate deploy
node dist/server.js
```

### Recommended Stack
- **Runtime**: Railway, Render, or Fly.io
- **Database**: Supabase (managed PostgreSQL)
- **Cache/Queue**: Upstash Redis
- **Video**: Cloudflare Stream
- **Files**: Cloudflare R2
- **Email**: Resend
- **Push**: Expo Push API
- **Payments**: Stripe + Flutterwave
- **IAP**: RevenueCat

### Webhook Registration

Register these URLs in your payment provider dashboards:

| Provider | Webhook URL |
|----------|-------------|
| Stripe | `https://api.kungabasics.com/api/v1/webhooks/stripe` |
| Flutterwave | `https://api.kungabasics.com/api/v1/webhooks/flutterwave` |
| RevenueCat | `https://api.kungabasics.com/api/v1/webhooks/revenuecat` |

---

## Deployment Troubleshooting

Real-world issues encountered during VPS deployment and how they were resolved.

---

### 1. `.env` file — never quote values

When Docker reads `.env` via `--env-file` or the `env_file:` key in `docker-compose.yml`, it treats quotation marks as **literal characters**, not string delimiters.

```bash
# WRONG — Docker passes the literal " character into the variable
DATABASE_URL="postgresql://..."

# CORRECT — no quotes
DATABASE_URL=postgresql://...
```

If you copied `.env` from a shell-style file that uses quotes, strip them before starting the container:

```bash
# Remove surrounding double-quotes from any value in .env
sed -i 's/^\([A-Z_]*\)="\(.*\)"$/\1=\2/' .env
```

---

### 2. Special characters in `DATABASE_URL`

Characters like `$`, `\`, `+`, `(`, `?`, `#`, `@`, `:` in a PostgreSQL password **must be percent-encoded** in the connection string or Prisma will fail to parse the URL (common error: *"invalid port number"* or the `@host` part gets cut off).

Encode only the password:

```bash
node -e "console.log(encodeURIComponent('your-raw-password-here'))"
```

Example — raw password `$k\ppYMY+(?:#`:

```
# Wrong
DATABASE_URL=postgresql://kunga:$k\ppYMY+(?:#@devemm.rw:5432/kunga

# Correct
DATABASE_URL=postgresql://kunga:%24k%5CppYMY%2B%28%3F%23@devemm.rw:5432/kunga
```

See the [encoding table](#️-special-characters-in-the-database-password) in the Database Setup section for the full list.

---

### 3. P3005 — database exists but has no migration history

**Symptom:** Container restarts in a loop with Prisma error `P3005: The database schema is not empty`.

**Cause:** The database was created with `prisma db push` which creates tables directly without writing to the `_prisma_migrations` table. When `prisma migrate deploy` runs in the container it sees tables it doesn't own and refuses to proceed.

**Fix (automatic):** `entrypoint.sh` already handles this. When it detects P3005, it loops through every directory in `prisma/migrations/` and runs:

```bash
npx prisma migrate resolve --applied "<migration_name>"
```

This tells Prisma "treat these migrations as already applied", then retries `migrate deploy`. No manual action needed — the container self-heals on the next restart.

**If you need to baseline manually:**

```bash
docker compose exec kunga-api sh -c '
  for dir in prisma/migrations/*/; do
    m=$(basename "$dir")
    [ "$m" = "migration_lock.toml" ] && continue
    npx prisma migrate resolve --applied "$m"
  done
  npx prisma migrate deploy
'
```

---

### 4. Log directory — create and set permissions before first start

The API writes rotating logs to `/opt/kunga/logs` on the host (bind-mounted into the container). The container runs as a non-root `kunga` user and **cannot create the directory itself**.

Run this once on the host before starting the container:

```bash
sudo mkdir -p /opt/kunga/logs
sudo chmod 777 /opt/kunga/logs
```

**Symptom if you skip this:**

```
Error: EACCES: permission denied, open '/opt/kunga/logs/kunga-api...'
```

> `chmod 777` is intentionally permissive so the non-root container user can write logs. Tighten it to `chmod 755` and `chown <container-uid>:root` if your security policy requires it.

---

### 5. Install docker compose v2 (not the old `docker-compose` v1)

Ubuntu's default `apt` repo ships the old Python-based `docker-compose` v1, which has a known bug where it cannot read container configs after image rebuilds (`KeyError: 'ContainerConfig'`).

Install the official v2 plugin from Docker's repo:

```bash
# Add Docker's official GPG key and repo (if not already done)
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

# Install the compose plugin
sudo apt-get install -y docker-compose-plugin
```

Verify:

```bash
docker compose version
# Docker Compose version v2.x.x
```

From now on use `docker compose` (space, no hyphen). The old `docker-compose` command can be removed:

```bash
sudo apt-get remove docker-compose   # optional
```

---

### 6. Stale container blocking a new deployment

**Symptom:**

```
Error response from daemon: Conflict. The container name "/kunga-api" is already in use.
```

**Cause:** A previous container with the same name still exists (even if stopped). This happens when you run `docker run` manually and then switch to `docker compose`.

Find and remove it:

```bash
# List all containers (including stopped)
docker ps -a

# Remove by name or ID
docker rm -f kunga-api
docker rm -f kunga-redis

# Then start fresh
docker compose up --build -d
```

---

### 7. Checking container health

```bash
# Real-time logs for all services
docker compose logs -f

# Logs for a single service
docker compose logs -f kunga-api

# Exec into the running container
docker compose exec kunga-api sh

# Check the API health endpoint
curl http://localhost:3001/health
```

A healthy startup looks like:

```
✅ Migrations applied.
▶  Starting server…

🌿 Kunga Basics API  |  PRODUCTION  |  port:3001  node:v20.x.x  ...
```
