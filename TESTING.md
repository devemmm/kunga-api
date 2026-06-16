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
  - `resetMutableData()` — truncates `users`, `audit_logs`, `activity_logs`,
    `visitor_sessions`, `analytics_events`, `announcements`, and
    `user_announcement_dismissals` (FK cascade cleans up role assignments,
    submissions, subscriptions, etc.). Use in `beforeEach` so each test starts
    with a clean set of users but doesn't pay the cost of re-seeding
    RBAC/config every time.
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

## Phase 1, 2a, 2b & 2c coverage

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

- `tests/announcements.test.ts` — user-facing list/active-banner/dismiss
  (incl. dismissal excludes from future listings, draft exclusion),
  admin CRUD (`VIEW_CONTENT`/`MANAGE_ANNOUNCEMENTS`), stats, viewers, and
  publish (push + email notifications). Mocks `lib/expo-push.js` and
  `lib/email.js`'s `sendAnnouncementEmail`. Note: the "invalid payload"
  case currently returns 500 rather than 400, because `ZodError`s thrown
  by `Dto.parse()` aren't mapped to 400 by the global error handler.
- `tests/analytics.test.ts` — marketing analytics (`overview`/`funnel`/
  `retention`/`mobile-money`, `VIEW_ANALYTICS`-gated, `SUPER_ADMIN` only)
  and site/visitor analytics: `POST /track` (session creation, pageView
  increment, bounce-flag clearing, 400 on missing `sessionId`), and the
  `site/*` aggregation endpoints (`overview`, `geo`, `devices`, `pages`,
  `sources`, `trends`, `realtime`, `export` CSV, `public-stats`) seeded
  directly via `prisma.visitorSession`/`prisma.analyticsEvent.create()`.
  GeoIP lookups on the loopback `.inject()` IP resolve to empty geo data,
  so no GeoIP mocking is needed — geo/device breakdowns are tested via
  seeded rows instead.

## CI

`.github/workflows/test.yml` runs the full suite on push/PR to `dev`,
`staging`, `prod` using a `postgres:16` service container, `prisma migrate
deploy`, and `npm run test:coverage`. The coverage report is uploaded as a
build artifact.

## Phase 3a — Admin portal E2E (Playwright) ✓

End-to-end browser tests for `kunga-admin-portal` (React 18 + Vite) using
**Playwright**. All API calls are intercepted via `page.route()` — no real
backend required (though tests are also verified to pass with `kunga-api`
running locally).

### Quick start

```bash
cd kunga-admin-portal
npx playwright install chromium   # first time only
npm run test:e2e                  # headless (fastest)
npm run test:e2e:ui               # Playwright UI — best for debugging
SLOW_MO=500 npx playwright test --headed   # watch actions at 500 ms/step
```

### Recording video

Each test writes a `.webm` video to `test-results/<test-name>/video.webm`
(enabled by `video: 'on'` in `playwright.config.ts`). To capture a single
continuous recording of all 19 tests, use QuickTime Screen Recording while
running with `--headed`.

### Test files

| File | Tests | What is covered |
|---|---|---|
| `e2e/auth.spec.ts` | 5 | Login success, invalid credentials, MFA OTP screen, MFA verify, pre-authenticated redirect |
| `e2e/dashboard.spec.ts` | 2 | Stat cards render mocked values, activity log items |
| `e2e/support-team.spec.ts` | 2 | List members, create member → credentials modal |
| `e2e/roles.spec.ts` | 3 | List roles, create role modal, permission checkboxes |
| `e2e/audit-log.spec.ts` | 3 | List rows, module filter visible, filter triggers re-fetch |
| `e2e/announcements.spec.ts` | 4 | List, form inputs, save draft, publish with confirm dialog |

### Helpers

- `e2e/helpers/auth.ts` — `loginAsAdmin()`: injects a fake JWT into
  `localStorage` via `addInitScript` (runs before page JS, essential because
  `api.js` reads the token at ES-module-eval time), mocks `/auth/me` and
  `/analytics/track` (silenced so real-backend 401s don't log the test user
  out when running alongside a live `kunga-api`).
- `e2e/helpers/routes.ts` — `mockGet/mockPost/mockPatch/mockDelete` wrappers
  using `**${path}*` patterns (trailing `*` matches query params).
- `e2e/fixtures/responses.ts` — typed mock payloads for all pages.

### CI

`.github/workflows/e2e.yml` runs all 19 tests on push/PR to `dev`/`staging`/
`prod` using Node 20 + Chromium. Playwright report uploaded as artifact always;
`test-results/` uploaded on failure.

## Phase 3b+ roadmap (not yet implemented)

- **Frontend component tests** — admin portal React components in isolation
  (Vitest + React Testing Library).
- **Mobile app E2E** — Detox/Maestro flows for onboarding, subscription,
  Ask Dr. Gad submission, module playback.
- **Coverage targets** — 90% API route coverage, 80% overall code coverage,
  enforced via CI coverage thresholds.
- **Regression suite documentation** — a maintained checklist of
  user-facing flows to manually verify before each release, until E2E
  coverage replaces it.
