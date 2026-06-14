import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

describe('Ask Dr. Gad — Question Credits', () => {
  let app: FastifyInstance;
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
    plainUser = await createAndLogin(app, FIXTURES.PLAIN_USER);
    noSubUser = await createAndLogin(app, FIXTURES.NO_SUBSCRIPTION_USER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/ask-gad/credits/purchase', () => {
    it('creates a pending question credit and returns a payment link', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { link: 'https://flw.test/pay/credit' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad/credits/purchase',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.paymentLink).toBe('https://flw.test/pay/credit');
      expect(body.txRef).toMatch(new RegExp(`^QCR-${plainUser.user.id}-\\d+$`));
      expect(body.amountUsd).toBe(5);
      expect(body.credits).toBe(1);

      const credit = await prisma.questionCredit.findUnique({ where: { txRef: body.txRef } });
      expect(credit?.status).toBe('PENDING');
      expect(credit?.credits).toBe(1);
      expect(credit?.amountUsd).toBe(5);
    });

    it('increments questionAddonUsd when a subscription exists', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'flutterwave', questionAddonUsd: 0 },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { link: 'https://flw.test/pay/credit2' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad/credits/purchase',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(201);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.questionAddonUsd).toBe(5);
    });

    it('returns 402 for a user with no subscription', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad/credits/purchase',
        headers: { authorization: `Bearer ${noSubUser.token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(402);
    });

    it('returns 502 when Flutterwave reports an error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'error', message: 'failed' }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad/credits/purchase',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(502);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad/credits/purchase',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/ask-gad/credits/verify', () => {
    it('verifies and activates a pending credit', async () => {
      const credit = await prisma.questionCredit.create({
        data: { userId: plainUser.user.id, monthKey: '2026-06', credits: 1, amountUsd: 5, status: 'PENDING', txRef: 'QCR-verify-1' },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { status: 'successful' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/ask-gad/credits/verify?tx_ref=${credit.txRef}`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.verified).toBe(true);
      expect(body.activated).toBe(true);

      const updated = await prisma.questionCredit.findUnique({ where: { id: credit.id } });
      expect(updated?.status).toBe('ACTIVE');
    });

    it('short-circuits for an already-active credit without calling fetch', async () => {
      const credit = await prisma.questionCredit.create({
        data: { userId: plainUser.user.id, monthKey: '2026-06', credits: 1, amountUsd: 5, status: 'ACTIVE', txRef: 'QCR-verify-2' },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/ask-gad/credits/verify?tx_ref=${credit.txRef}`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ verified: true, alreadyActive: true, credit: expect.objectContaining({ id: credit.id }) });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown tx_ref', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ask-gad/credits/verify?tx_ref=QCR-unknown',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when tx_ref is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ask-gad/credits/verify',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
