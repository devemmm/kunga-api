# Testing — kunga-api

Phase 1 of the automated testing framework: backend API tests for `kunga-api`
using **Vitest** + Fastify's built-in `.inject()` (no HTTP server, no supertest).

## Quick start

### 1. Create the test database

Tests run against a dedicated `kunga_test` database (same Postgres instance as
`kunga`/`kungav1`, just a separate database so test runs never touch real data):

```sql
CREATE DATABASE kunga_test;
```

### 2. Configure `.env.test`

Create `.env.test` (gitignored) in `kunga-api/`:

```env
NODE_ENV=test
PORT=3099
HOST=0.0.0.0
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/kunga_test"
JWT_SECRET=test-jwt-secret-do-not-use-in-production-min-32-chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d
```

### 3. Apply migrations to `kunga_test`

```bash
DATABASE_URL="<your kunga_test URL>" npx prisma migrate deploy
```

### 4. Run the tests

```bash
npm run test            # run once
npm run test:watch      # watch mode
npm run test:coverage   # run with coverage report (coverage/html-report/index.html)
```

## How it works

- `src/server.ts` exports `buildServer(): Promise<FastifyInstance>` — builds
  the full Fastify app (plugins, routes, swagger) without calling `.listen()`.
  Tests call this and use `.inject()` to make requests with no real network
  socket.
- `vitest.config.ts` loads `.env.test` before any other module (via `dotenv`),
  so Prisma connects to `kunga_test` instead of the dev/prod database. Tests
  run with `pool: 'forks'` + `singleFork: true` so they execute serially
  against the shared test database.
- `tests/helpers/app.ts` — `getTestApp()` returns a singleton Fastify instance
  per test file; `closeTestApp()` tears it down.
- `tests/helpers/db.ts`:
  - `resetDb()` — truncates every app table (cascading), restarts identity
    sequences. Use once in `beforeAll`.
  - `seedBase()` — seeds RBAC roles/permissions (`prisma/rbac-seed.ts`),
    pricing/app-config defaults, and the module-group taxonomy. Use once in
    `beforeAll`, right after `resetDb()`.
  - `resetMutableData()` — truncates only `users`, `audit_logs`, and
    `activity_logs` (FK cascade cleans up role assignments, submissions,
    subscriptions, etc.). Use in `beforeEach` so each test starts with a clean
    set of users but doesn't pay the cost of re-seeding RBAC/config every time.
- `tests/helpers/auth.ts` — `createUser()`, `loginAs()`, `createAndLogin()`,
  and `FIXTURES` (`SUPER_ADMIN`, `SUPPORT_AGENT`, `SUPPORT_MANAGER`,
  `PLAIN_USER`, `NO_SUBSCRIPTION_USER`, `CONTENT_MANAGER`,
  `FINANCE_OFFICER`) matching the roles seeded by `seedRbac`.
- `tests/helpers/db.ts` also exports `seedModuleFixtures()` — creates a stable
  set of `Module`/`Video` fixtures (one PUBLISHED + one DRAFT module, two
  videos under the published module) for suites that need real module/video
  ids. `modules`/`videos` have no FK to `users`, so they aren't cleared by
  `resetMutableData()` — call `seedModuleFixtures()` once in `beforeAll`.

## Writing a new test file

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';

describe('My feature', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
    await resetDb();
    await seedBase();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await resetMutableData();
  });

  it('does the thing', async () => {
    const { token } = await createAndLogin(app, FIXTURES.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/my-endpoint',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

For protected routes, assert: `401` (no token), `403` (wrong role/permission),
and `200`/`201` (authorized) — that's the pattern used throughout Phase 1.

## Phase 1, 2a & 2b coverage

- `tests/auth.test.ts` — register, login, refresh, `/auth/me`
  (roles + effectivePermissions), logout, forgot/reset password.
- `tests/rbac-roles.test.ts` — roles & permissions CRUD, audit logging on
  permission changes.
- `tests/rbac-support-team.test.ts` — support team member CRUD, role/permission
  assignment, password regeneration.
- `tests/ask-gad.test.ts` — submit/list questions, admin queue, assign,
  escalate, respond, permission gating, subscription requirement.
- `tests/audit-log.test.ts` — audit log listing, filtering, permission gating.
- `tests/pricing-app-config.test.ts` — admin pricing config CRUD, public
  `/app/version`, `/app/contact`, `/app/pricing`, `/health`.
- `tests/modules.test.ts` — module group CRUD (incl. 409 on deleting a group
  with modules), module CRUD + publish/unpublish lifecycle, admin details,
  resource CRUD + presigned upload URL (mocked `lib/r2.js`), module feedback,
  `VIEW_CONTENT`/`MANAGE_CONTENT` permission gating, DRAFT-module visibility.
- `tests/videos.test.ts` — video CRUD (`MANAGE_VIDEOS`), upload-url endpoints
  (placeholder + mocked `lib/minio.js` presigned URL), stream URL subscription
  gating (402/200), bookmark toggle, notes CRUD incl. 403 ownership check.
- `tests/progress.test.ts` — progress GET/POST (incl. watchedPercent≥90
  auto-complete), module feedback via progress route, routine GET/`sync`/PATCH
  + streak, journal CRUD (upsert by date), milestones CRUD (upsert by
  weekStart) — all asserting 402 without an active subscription.
- `tests/users-profile.test.ts` — `GET`/`PATCH /users/me`, change-password
  (incl. 401 on wrong current password), child profile create/update,
  progress-summary HomeScreen shape.
- `tests/subscriptions.test.ts` — subscription status/list/details, admin
  override/cancel/restore (`MANAGE_SUBSCRIPTIONS` vs `VIEW_SUBSCRIPTIONS`
  permission gating), RevenueCat sync (active/expired). Mocks
  `lib/email.js`'s `sendSubscriptionCancelledEmail`/`sendSubscriptionRestoredEmail`.
- `tests/payments.test.ts` — Flutterwave initiate/verify/callback (incl.
  alreadyActive short-circuit and "no matching subscription"), Stripe
  checkout placeholder, mobile-money list (`VIEW_MOBILE_MONEY`) and manual
  activation (`MANAGE_SUBSCRIPTIONS`). Mocks `global.fetch` per-test via
  `vi.spyOn(globalThis, 'fetch')` (Flutterwave REST calls).
- `tests/donations.test.ts` — donation initiate (Flutterwave + Stripe),
  admin list/stats (`VIEW_DONATIONS`), public donor wall, scholarship
  grant/list (incl. grant to non-existent email). Mocks `global.fetch` and
  `lib/email.js`'s `sendScholarshipGrantedEmail`.
- `tests/webhooks.test.ts` — Flutterwave webhook signature verification
  (`verif-hash` vs `FLUTTERWAVE_WEBHOOK_HASH`) and all three `tx_ref`
  branches (`KB-`/`DON-`/`QCR-`), Stripe webhook (subscription
  updated/deleted, donation payment_intent — note: signature verification is
  *not yet implemented* in the route, so these tests don't assert on it),
  RevenueCat webhook (status map incl. `INITIAL_PURCHASE`/`EXPIRATION`).
  Mocks `lib/email.js` and `lib/expo-push.js`.
- `tests/ask-gad-credits.test.ts` — question-credit purchase
  (`POST /ask-gad/credits/purchase`, 402 without subscription, `fetch` mock)
  and verification (`GET /ask-gad/credits/verify`, incl. alreadyActive
  short-circuit and 404 for unknown `tx_ref`).

New `.env.test` keys for Phase 2b: `FLUTTERWAVE_SECRET_KEY` (placeholder —
all Flutterwave `fetch()` calls are mocked) and `FLUTTERWAVE_WEBHOOK_HASH`
(used by `tests/webhooks.test.ts` to build a valid `verif-hash` header).

## CI

`.github/workflows/test.yml` runs the full suite on push/PR to `dev`,
`staging`, `prod` using a `postgres:16` service container, `prisma migrate
deploy`, and `npm run test:coverage`. The coverage report is uploaded as a
build artifact.

## Phase 2c roadmap (not yet implemented)

Phase 2a covered the core app domains (Tier A — modules, videos, progress/
routine/journal/milestones, user profiles) and Phase 2b covered payments/
subscriptions/donations/webhooks (Tier B). Remaining API coverage:

- **Phase 2c — announcements & analytics**: `tests/announcements.test.ts`,
  `tests/analytics.test.ts` — admin CRUD + viewer tracking, site analytics
  aggregation. Needs Expo push and GeoIP mocking.

## Phase 3+ roadmap (not yet implemented)

- **Admin portal E2E (Playwright)** — login flow, RBAC-gated navigation,
  Support Team / Roles / Ask Dr. Gad / Audit Log pages, pricing config.
- **Frontend component tests** — admin portal React components in isolation
  (Vitest + React Testing Library).
- **Mobile app E2E** — Detox/Maestro flows for onboarding, subscription,
  Ask Dr. Gad submission, module playback.
- **Coverage targets** — 90% API route coverage, 80% overall code coverage,
  enforced via CI coverage thresholds.
- **Regression suite documentation** — a maintained checklist of
  user-facing flows to manually verify before each release, until E2E
  coverage replaces it.
