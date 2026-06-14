import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

describe('Payments', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let financeOfficerToken: string;
  let plainUser: { user: any; token: string };
  let supportAgentToken: string;

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
    ({ token: financeOfficerToken } = await createAndLogin(app, FIXTURES.FINANCE_OFFICER));
    ({ token: supportAgentToken } = await createAndLogin(app, FIXTURES.SUPPORT_AGENT));
    plainUser = await createAndLogin(app, FIXTURES.PLAIN_USER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/payments/flutterwave/initiate', () => {
    it('creates a payment link and upserts a pending subscription', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { link: 'https://flw.test/pay/abc' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/flutterwave/initiate',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: { plan: 'monthly' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.paymentLink).toBe('https://flw.test/pay/abc');
      expect(body.txRef).toMatch(new RegExp(`^KB-${plainUser.user.id}-\\d+$`));
      expect(body.currency).toBe('USD');

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.flutterwaveTxId).toBe(body.txRef);
      expect(sub?.platform).toBe('flutterwave');
    });

    it('returns 502 when Flutterwave reports an error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'error', message: 'card declined' }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/flutterwave/initiate',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: { plan: 'monthly' },
      });
      expect(res.statusCode).toBe(502);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/flutterwave/initiate',
        payload: { plan: 'monthly' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/payments/flutterwave/verify', () => {
    it('activates a matching pending subscription', async () => {
      const txRef = `KB-${plainUser.user.id}-${Date.now()}`;
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'TRIAL', platform: 'flutterwave', flutterwaveTxId: txRef },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { status: 'successful', amount: 9.99, id: 'flw-tx-1' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/flutterwave/verify?tx_ref=${encodeURIComponent(txRef)}`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.verified).toBe(true);
      expect(body.activated).toBe(true);
      expect(body.plan).toBe('monthly');

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('ACTIVE');
    });

    it('short-circuits when the subscription is already active', async () => {
      const txRef = `KB-${plainUser.user.id}-${Date.now()}`;
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'flutterwave', flutterwaveTxId: txRef },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { status: 'successful', amount: 9.99, id: 'flw-tx-2' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/flutterwave/verify?tx_ref=${encodeURIComponent(txRef)}`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ verified: true, activated: true, alreadyActive: true });
    });

    it('returns activated:false when no subscription matches the tx_ref', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { status: 'successful', amount: 9.99, id: 'flw-tx-3' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/flutterwave/verify?tx_ref=KB-unknown-123',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.verified).toBe(true);
      expect(body.activated).toBe(false);
    });

    it('returns 400 when tx_ref query param is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/flutterwave/verify',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/payments/flutterwave/callback', () => {
    it('redirects to the configured deep link', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/flutterwave/callback?tx_ref=KB-abc-123&status=successful',
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('status=successful');
      expect(res.headers.location).toContain('tx_ref=KB-abc-123');
    });
  });

  describe('POST /api/v1/payments/stripe/create-checkout', () => {
    it('returns a placeholder checkout session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/stripe/create-checkout',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: { plan: 'annual' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.checkoutUrl).toContain('checkout.stripe.com');
      expect(body.sessionId).toMatch(/^cs_test_placeholder_/);
    });
  });

  describe('GET /api/v1/payments/mobile-money', () => {
    it('allows FINANCE_OFFICER (VIEW_MOBILE_MONEY) to list mobile money transactions', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'flutterwave', mobileMoneyProvider: 'mtn_momo' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/mobile-money',
        headers: { authorization: `Bearer ${financeOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.transactions)).toBe(true);
      expect(body.transactions.some((t: any) => t.userId === plainUser.user.id)).toBe(true);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/mobile-money',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for support agent', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/mobile-money',
        headers: { authorization: `Bearer ${supportAgentToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/payments/mobile-money/:txId/activate', () => {
    it('allows SUPER_ADMIN to manually activate a transaction', async () => {
      const sub = await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'NONE', platform: 'flutterwave', mobileMoneyProvider: 'mtn_momo' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/payments/mobile-money/${sub.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Subscription manually activated');

      const updated = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updated?.status).toBe('ACTIVE');

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('ACTIVE');

      const logs = await prisma.activityLog.findMany({ where: { userId: plainUser.user.id, action: 'admin.payment.manual_activate' } });
      expect(logs).toHaveLength(1);
    });

    it('returns 403 for FINANCE_OFFICER (no MANAGE_SUBSCRIPTIONS)', async () => {
      const sub = await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'NONE', platform: 'flutterwave' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/payments/mobile-money/${sub.id}/activate`,
        headers: { authorization: `Bearer ${financeOfficerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 for an unknown transaction id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/payments/mobile-money/00000000-0000-0000-0000-000000000000/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
