import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

vi.mock('../src/lib/email.js', () => ({
  sendSubscriptionActivatedEmail: vi.fn(async () => {}),
  sendDonationReceiptEmail: vi.fn(async () => {}),
}));

vi.mock('../src/lib/expo-push.js', () => ({
  sendExpoPush: vi.fn(async () => {}),
  buildMessages: vi.fn(() => [{}]),
}));

import { sendSubscriptionActivatedEmail, sendDonationReceiptEmail } from '../src/lib/email.js';
import { sendExpoPush } from '../src/lib/expo-push.js';

const WEBHOOK_HASH = process.env.FLUTTERWAVE_WEBHOOK_HASH!;

describe('Webhooks', () => {
  let app: FastifyInstance;
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
    plainUser = await createAndLogin(app, FIXTURES.PLAIN_USER);
    vi.clearAllMocks();
  });

  describe('POST /api/v1/webhooks/flutterwave', () => {
    it('returns 401 when the verif-hash header is missing or wrong', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        payload: { event: 'charge.completed', data: { status: 'successful', tx_ref: 'KB-x-1', amount: 14, id: 1 } },
      });
      expect(res.statusCode).toBe(401);

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        headers: { 'verif-hash': 'wrong-hash' },
        payload: { event: 'charge.completed', data: { status: 'successful', tx_ref: 'KB-x-1', amount: 14, id: 1 } },
      });
      expect(res2.statusCode).toBe(401);
    });

    it('activates an annual subscription for a KB- tx_ref with amount >= 140', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        headers: { 'verif-hash': WEBHOOK_HASH },
        payload: { event: 'charge.completed', data: { status: 'successful', tx_ref: `KB-${plainUser.user.id}-1`, amount: 140, currency: 'USD', id: 'flw-1' } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ received: true });

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('ACTIVE');
      expect(sub?.plan).toBe('annual');
      expect(sub?.platform).toBe('flutterwave');

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('ACTIVE');

      expect(sendSubscriptionActivatedEmail).toHaveBeenCalledWith(user!.email, user!.name ?? '', 'annual');
    });

    it('activates a monthly subscription for a KB- tx_ref with amount < 140', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        headers: { 'verif-hash': WEBHOOK_HASH },
        payload: { event: 'charge.completed', data: { status: 'successful', tx_ref: `KB-${plainUser.user.id}-2`, amount: 9.99, currency: 'USD', id: 'flw-2' } },
      });
      expect(res.statusCode).toBe(200);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.plan).toBe('monthly');
      expect(sendSubscriptionActivatedEmail).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'monthly');
    });

    it('marks a matching DON- donation as completed and sends a receipt', async () => {
      const donation = await prisma.donation.create({
        data: { amountUsd: 25, currency: 'USD', email: 'donor@example.com', donorName: 'Donor', paymentMethod: 'FLUTTERWAVE', status: 'PENDING', flutterwaveTxId: 'flw-don-1', campaign: 'general' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        headers: { 'verif-hash': WEBHOOK_HASH },
        payload: { event: 'charge.completed', data: { status: 'successful', tx_ref: 'DON-1234567890', amount: 25, currency: 'USD', id: 'flw-don-1' } },
      });
      expect(res.statusCode).toBe(200);

      const updated = await prisma.donation.findUnique({ where: { id: donation.id } });
      expect(updated?.status).toBe('COMPLETED');
      expect(sendDonationReceiptEmail).toHaveBeenCalledWith('donor@example.com', 'Donor', 25, 'USD', 'general');
    });

    it('activates a matching QCR- question credit and sends a push notification when the user has a pushToken', async () => {
      await prisma.user.update({ where: { id: plainUser.user.id }, data: { pushToken: 'ExponentPushToken[xxx]' } });
      const credit = await prisma.questionCredit.create({
        data: { userId: plainUser.user.id, monthKey: '2026-06', credits: 1, amountUsd: 2, status: 'PENDING', txRef: 'QCR-abc-1' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        headers: { 'verif-hash': WEBHOOK_HASH },
        payload: { event: 'charge.completed', data: { status: 'successful', tx_ref: 'QCR-abc-1', amount: 2, currency: 'USD', id: 'flw-qcr-1' } },
      });
      expect(res.statusCode).toBe(200);

      const updated = await prisma.questionCredit.findUnique({ where: { id: credit.id } });
      expect(updated?.status).toBe('ACTIVE');
      expect(sendExpoPush).toHaveBeenCalledTimes(1);
    });

    it('activates a QCR- question credit without a push when the user has no pushToken', async () => {
      const credit = await prisma.questionCredit.create({
        data: { userId: plainUser.user.id, monthKey: '2026-06', credits: 1, amountUsd: 2, status: 'PENDING', txRef: 'QCR-abc-2' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        headers: { 'verif-hash': WEBHOOK_HASH },
        payload: { event: 'charge.completed', data: { status: 'successful', tx_ref: 'QCR-abc-2', amount: 2, currency: 'USD', id: 'flw-qcr-2' } },
      });
      expect(res.statusCode).toBe(200);

      const updated = await prisma.questionCredit.findUnique({ where: { id: credit.id } });
      expect(updated?.status).toBe('ACTIVE');
      expect(sendExpoPush).not.toHaveBeenCalled();
    });

    it('ignores non charge.completed / non-successful events', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/flutterwave',
        headers: { 'verif-hash': WEBHOOK_HASH },
        payload: { event: 'charge.failed', data: { status: 'failed', tx_ref: `KB-${plainUser.user.id}-3`, amount: 14, id: 'flw-3' } },
      });
      expect(res.statusCode).toBe(200);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub).toBeNull();
    });
  });

  describe('POST /api/v1/webhooks/stripe', () => {
    it('upserts an ACTIVE subscription on customer.subscription.updated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/stripe',
        payload: {
          type: 'customer.subscription.updated',
          data: {
            object: {
              status: 'active',
              metadata: { userId: plainUser.user.id },
              items: { data: [{ price: { id: 'price_monthly_123' } }] },
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          },
        },
      });
      expect(res.statusCode).toBe(200);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('ACTIVE');
      expect(sub?.platform).toBe('stripe');
      expect(sub?.stripePriceId).toBe('price_monthly_123');

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('ACTIVE');
    });

    it('cancels a subscription on customer.subscription.deleted', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'stripe' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/stripe',
        payload: {
          type: 'customer.subscription.deleted',
          data: { object: { metadata: { userId: plainUser.user.id } } },
        },
      });
      expect(res.statusCode).toBe(200);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('CANCELLED');
      expect(sub?.cancelledAt).not.toBeNull();

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('CANCELLED');
    });

    it('marks a donation completed on payment_intent.succeeded with metadata.type=donation', async () => {
      const donation = await prisma.donation.create({
        data: { amountUsd: 30, currency: 'USD', email: 'stripe-donor@example.com', donorName: 'Stripe Donor', paymentMethod: 'STRIPE', status: 'PENDING', stripePaymentIntentId: 'pi_123', campaign: 'general' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/stripe',
        payload: {
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_123', metadata: { type: 'donation' } } },
        },
      });
      expect(res.statusCode).toBe(200);

      const updated = await prisma.donation.findUnique({ where: { id: donation.id } });
      expect(updated?.status).toBe('COMPLETED');
      expect(sendDonationReceiptEmail).toHaveBeenCalledWith('stripe-donor@example.com', 'Stripe Donor', 30, 'USD', 'general');
    });

    it('ignores unhandled event types', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/stripe',
        payload: { type: 'invoice.created', data: { object: {} } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ received: true });
    });
  });

  describe('POST /api/v1/webhooks/revenuecat', () => {
    it('returns 400 when no event is present', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/webhooks/revenuecat', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('activates a subscription on INITIAL_PURCHASE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/revenuecat',
        payload: {
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: plainUser.user.id,
            subscriber: { subscriber_id: 'rc-sub-1' },
            store: 'PLAY_STORE',
          },
        },
      });
      expect(res.statusCode).toBe(200);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('ACTIVE');
      expect(sub?.revenuecatSubscriberId).toBe('rc-sub-1');
      expect(sub?.platform).toBe('play_store');

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('ACTIVE');
    });

    it('expires a subscription on EXPIRATION', async () => {
      await prisma.subscription.create({
        data: { userId: plainUser.user.id, plan: 'monthly', status: 'ACTIVE', platform: 'apple_iap' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/revenuecat',
        payload: { event: { type: 'EXPIRATION', app_user_id: plainUser.user.id } },
      });
      expect(res.statusCode).toBe(200);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('EXPIRED');

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('EXPIRED');
    });

    it('ignores unmapped event types', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/revenuecat',
        payload: { event: { type: 'SOME_UNKNOWN_EVENT', app_user_id: plainUser.user.id } },
      });
      expect(res.statusCode).toBe(200);

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub).toBeNull();
    });
  });
});
