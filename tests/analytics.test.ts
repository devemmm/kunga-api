import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

describe('Analytics', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let plainUser: { user: any; token: string };

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
    ({ token: superAdminToken } = await createAndLogin(app, FIXTURES.SUPER_ADMIN));
    plainUser = await createAndLogin(app, FIXTURES.PLAIN_USER);
  });

  describe('GET /api/v1/analytics/overview', () => {
    it('returns DAU/MAU/stickiness for SUPER_ADMIN', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/overview',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('dau');
      expect(body).toHaveProperty('mau');
      expect(body).toHaveProperty('stickiness');
      expect(body).toHaveProperty('avgSessionMin');
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/overview',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/analytics/funnel', () => {
    it('returns a funnel array', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/funnel',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.funnel)).toBe(true);
      expect(body.funnel[0]).toHaveProperty('step');
      expect(body.funnel[0]).toHaveProperty('count');
      expect(body.funnel[0]).toHaveProperty('pct');
    });
  });

  describe('GET /api/v1/analytics/retention', () => {
    it('returns cohort retention data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/retention',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.cohorts)).toBe(true);
      expect(body.cohorts.length).toBeGreaterThan(0);
      expect(body.cohorts[0]).toHaveProperty('cohort');
      expect(body.cohorts[0]).toHaveProperty('users');
    });
  });

  describe('GET /api/v1/analytics/mobile-money', () => {
    it('returns mobile money provider breakdown', async () => {
      await prisma.subscription.create({
        data: {
          userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE',
          platform: 'flutterwave', mobileMoneyProvider: 'mtn_momo',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/mobile-money',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.providers)).toBe(true);
      const mtn = body.providers.find((p: any) => p.mobileMoneyProvider === 'mtn_momo');
      expect(mtn._count._all).toBe(1);
    });
  });

  describe('POST /api/v1/analytics/track', () => {
    it('creates a visitor session on first beacon', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/track',
        payload: { sessionId: 'sess-track-1', source: 'portal', eventType: 'pageview', path: '/' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });

      const session = await prisma.visitorSession.findUnique({ where: { sessionId: 'sess-track-1' } });
      expect(session?.pageViews).toBe(1);
      expect(session?.isBounce).toBe(true);
    });

    it('increments pageViews and clears the bounce flag on a second pageview', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/track',
        payload: { sessionId: 'sess-track-2', source: 'portal', eventType: 'pageview', path: '/' },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/track',
        payload: { sessionId: 'sess-track-2', source: 'portal', eventType: 'pageview', path: '/about' },
      });
      expect(res.statusCode).toBe(200);

      const session = await prisma.visitorSession.findUnique({ where: { sessionId: 'sess-track-2' } });
      expect(session?.pageViews).toBe(2);
      expect(session?.isBounce).toBe(false);
      expect(session?.exitPath).toBe('/about');
    });

    it('returns 400 when sessionId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/track',
        payload: { source: 'portal', eventType: 'pageview' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/analytics/site/overview', () => {
    it('returns visitor overview totals', async () => {
      await prisma.visitorSession.create({
        data: { sessionId: 'ov-1', source: 'portal', pageViews: 3, isBounce: false },
      });
      await prisma.visitorSession.create({
        data: { sessionId: 'ov-2', source: 'portal', pageViews: 1, isBounce: true },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/overview',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalVisitors).toBe(2);
      expect(body.pageViews).toBe(4);
      expect(body.bounceRate).toBe(50);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/overview',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/analytics/site/geo', () => {
    it('groups visitors by country', async () => {
      await prisma.visitorSession.create({
        data: { sessionId: 'geo-1', source: 'portal', country: 'Rwanda', countryCode: 'RW', city: 'Kigali' },
      });
      await prisma.visitorSession.create({
        data: { sessionId: 'geo-2', source: 'portal', country: 'Rwanda', countryCode: 'RW', city: 'Kigali' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/geo',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.countries[0]).toMatchObject({ country: 'Rwanda', countryCode: 'RW', count: 2 });
      expect(body.cities[0]).toMatchObject({ city: 'Kigali', count: 2 });
    });
  });

  describe('GET /api/v1/analytics/site/devices', () => {
    it('returns browser/os/device breakdowns', async () => {
      await prisma.visitorSession.create({
        data: { sessionId: 'dev-1', source: 'portal', browser: 'Chrome', os: 'Android', deviceType: 'mobile' },
      });
      await prisma.visitorSession.create({
        data: { sessionId: 'dev-2', source: 'portal', browser: 'Chrome', os: 'Android', deviceType: 'mobile' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/devices',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.browsers[0]).toMatchObject({ name: 'Chrome', count: 2 });
      expect(body.os[0]).toMatchObject({ name: 'Android', count: 2 });
      expect(body.deviceTypes[0]).toMatchObject({ name: 'mobile', count: 2 });
    });
  });

  describe('GET /api/v1/analytics/site/pages', () => {
    it('returns most-visited pages', async () => {
      const session = await prisma.visitorSession.create({
        data: { sessionId: 'pages-1', source: 'portal' },
      });
      await prisma.analyticsEvent.createMany({
        data: [
          { sessionId: session.sessionId, source: 'portal', eventType: 'pageview', path: '/popular' },
          { sessionId: session.sessionId, source: 'portal', eventType: 'pageview', path: '/popular' },
          { sessionId: session.sessionId, source: 'portal', eventType: 'pageview', path: '/rare' },
        ],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/pages',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pages[0]).toMatchObject({ path: '/popular', views: 2 });
    });
  });

  describe('GET /api/v1/analytics/site/sources', () => {
    it('classifies traffic sources', async () => {
      await prisma.visitorSession.create({
        data: { sessionId: 'src-1', source: 'portal', referrer: null, utmSource: null },
      });
      await prisma.visitorSession.create({
        data: { sessionId: 'src-2', source: 'portal', referrer: 'https://www.google.com/search', utmSource: null },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/sources',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const direct = body.sources.find((s: any) => s.source === 'Direct');
      const search = body.sources.find((s: any) => s.source === 'Search');
      expect(direct?.count).toBe(1);
      expect(search?.count).toBe(1);
    });
  });

  describe('GET /api/v1/analytics/site/trends', () => {
    it('returns a daily trend series', async () => {
      await prisma.visitorSession.create({
        data: { sessionId: 'trend-1', source: 'portal', pageViews: 2, isBounce: false },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/trends',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.trend)).toBe(true);
      expect(body.trend.length).toBeGreaterThan(0);
      expect(body.trend[0]).toHaveProperty('visitors');
      expect(body.trend[0]).toHaveProperty('pageViews');
    });
  });

  describe('GET /api/v1/analytics/site/realtime', () => {
    it('only counts sessions seen within the last 5 minutes', async () => {
      await prisma.visitorSession.create({
        data: { sessionId: 'rt-recent', source: 'portal', lastSeenAt: new Date() },
      });
      await prisma.visitorSession.create({
        data: { sessionId: 'rt-stale', source: 'portal', lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/realtime',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.count).toBe(1);
      expect(body.sessions[0].sessionId).toBe('rt-recent');
    });
  });

  describe('GET /api/v1/analytics/site/export', () => {
    it('returns a CSV export', async () => {
      await prisma.visitorSession.create({
        data: { sessionId: 'export-1', source: 'portal' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/export',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.body).toContain('sessionId');
      expect(res.body).toContain('export-1');
    });
  });

  describe('GET /api/v1/analytics/site/public-stats', () => {
    it('returns public headline stats without auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/site/public-stats',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('familiesSupported');
      expect(body).toHaveProperty('caregiverSatisfaction');
      expect(body).toHaveProperty('languagesSupported');
    });
  });
});
