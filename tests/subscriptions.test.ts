import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

vi.mock('../src/lib/email.js', () => ({
  sendSubscriptionCancelledEmail: vi.fn(async () => {}),
  sendSubscriptionRestoredEmail: vi.fn(async () => {}),
}));

import { sendSubscriptionCancelledEmail, sendSubscriptionRestoredEmail } from '../src/lib/email.js';

describe('Subscriptions', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let supportManagerToken: string;
  let plainUser: { user: any; token: string };
  let noSubUser: { user: any; token: string };

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
    ({ token: supportManagerToken } = await createAndLogin(app, FIXTURES.SUPPORT_MANAGER));
    plainUser = await createAndLogin(app, FIXTURES.PLAIN_USER);
    noSubUser = await createAndLogin(app, FIXTURES.NO_SUBSCRIPTION_USER);
    vi.clearAllMocks();
  });

  describe('GET /api/v1/subscriptions/status', () => {
    it('returns hasAccess true for an ACTIVE subscriber', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/subscriptions/status',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ACTIVE');
      expect(body.hasAccess).toBe(true);
    });

    it('returns hasAccess false for a user with no subscription', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/subscriptions/status',
        headers: { authorization: `Bearer ${noSubUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('NONE');
      expect(body.hasAccess).toBe(false);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/subscriptions/status' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/subscriptions', () => {
    it('allows SUPER_ADMIN to list subscriptions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/subscriptions',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.subscriptions)).toBe(true);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
    });

    it('allows SUPPORT_MANAGER (VIEW_SUBSCRIPTIONS) to list subscriptions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/subscriptions',
        headers: { authorization: `Bearer ${supportManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/subscriptions',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('filters by platform/status/plan/search', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'flutterwave' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/subscriptions?platform=flutterwave&status=ACTIVE&plan=monthly&search=${encodeURIComponent(plainUser.user.email)}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.subscriptions.some((s: any) => s.userId === plainUser.user.id)).toBe(true);
    });
  });

  describe('GET /api/v1/subscriptions/:userId/details', () => {
    it('returns subscription details for SUPER_ADMIN', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'flutterwave' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/subscriptions/${plainUser.user.id}/details`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.subscription.userId).toBe(plainUser.user.id);
      expect(body.subscription.user.email).toBe(plainUser.user.email);
    });

    it('returns 404 when no subscription exists', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/subscriptions/${noSubUser.user.id}/details`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/subscriptions/${plainUser.user.id}/details`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/subscriptions/:userId/override', () => {
    it('allows SUPER_ADMIN to override a subscription', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/subscriptions/${noSubUser.user.id}/override`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { status: 'ACTIVE', plan: 'annual', reason: 'manual grant' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.subscription.status).toBe('ACTIVE');
      expect(body.subscription.plan).toBe('annual');

      const user = await prisma.user.findUnique({ where: { id: noSubUser.user.id } });
      expect(user?.subscriptionStatus).toBe('ACTIVE');

      const logs = await prisma.activityLog.findMany({ where: { userId: noSubUser.user.id, action: 'admin.subscription.override' } });
      expect(logs).toHaveLength(1);
      expect(logs[0].details).toBe('manual grant');
    });

    it('returns 403 for SUPPORT_MANAGER (no MANAGE_SUBSCRIPTIONS)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/subscriptions/${noSubUser.user.id}/override`,
        headers: { authorization: `Bearer ${supportManagerToken}` },
        payload: { status: 'ACTIVE' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/subscriptions/:userId/cancel', () => {
    it('cancels an active subscription and sends an email', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'flutterwave' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/subscriptions/${plainUser.user.id}/cancel`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Subscription cancelled');

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('CANCELLED');
      expect(sub?.cancelledAt).not.toBeNull();

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('CANCELLED');

      expect(sendSubscriptionCancelledEmail).toHaveBeenCalledTimes(1);
    });

    it('returns 403 for SUPPORT_MANAGER', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'flutterwave' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/subscriptions/${plainUser.user.id}/cancel`,
        headers: { authorization: `Bearer ${supportManagerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/subscriptions/:userId/restore', () => {
    it('restores a cancelled subscription and sends an email', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'CANCELLED', platform: 'flutterwave', cancelledAt: new Date() },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/subscriptions/${plainUser.user.id}/restore`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Subscription restored');

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('ACTIVE');
      expect(sub?.cancelledAt).toBeNull();
      expect(sub?.periodEnd).not.toBeNull();
      expect(sub!.periodEnd!.getTime()).toBeGreaterThan(Date.now());

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('ACTIVE');

      expect(sendSubscriptionRestoredEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/v1/subscriptions/revenuecat/sync', () => {
    it('activates a subscription when premium entitlement is active', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/revenuecat/sync',
        headers: { authorization: `Bearer ${noSubUser.token}` },
        payload: {
          subscriberId: 'rc-sub-123',
          entitlements: {
            premium: { isActive: true, expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), store: 'play_store' },
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ACTIVE');
      expect(body.hasAccess).toBe(true);
      expect(body.subscription.revenuecatSubscriberId).toBe('rc-sub-123');
      expect(body.subscription.platform).toBe('play_store');

      const user = await prisma.user.findUnique({ where: { id: noSubUser.user.id } });
      expect(user?.subscriptionStatus).toBe('ACTIVE');
    });

    it('marks subscription expired when premium entitlement is inactive', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/revenuecat/sync',
        headers: { authorization: `Bearer ${noSubUser.token}` },
        payload: {
          subscriberId: 'rc-sub-456',
          entitlements: { premium: { isActive: false } },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('EXPIRED');
      expect(body.hasAccess).toBe(false);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/revenuecat/sync',
        payload: { subscriberId: 'x', entitlements: { premium: { isActive: true } } },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
