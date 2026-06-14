import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

vi.mock('../src/lib/email.js', () => ({
  sendScholarshipGrantedEmail: vi.fn(async () => {}),
}));

import { sendScholarshipGrantedEmail } from '../src/lib/email.js';

describe('Donations', () => {
  let app: FastifyInstance;
  let financeOfficerToken: string;
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
    ({ token: financeOfficerToken } = await createAndLogin(app, FIXTURES.FINANCE_OFFICER));
    plainUser = await createAndLogin(app, FIXTURES.PLAIN_USER);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/donations/initiate', () => {
    it('initiates a Flutterwave donation', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', data: { link: 'https://flw.test/donate/abc' } }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/donations/initiate',
        payload: { amount: 25, currency: 'USD', email: 'donor@example.com', donorName: 'Jane Donor', method: 'flutterwave', campaign: 'General' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.checkoutUrl).toBe('https://flw.test/donate/abc');
      expect(body.txRef).toMatch(/^DON-\d+$/);
      expect(body.donation.status).toBe('PENDING');
      expect(body.donation.paymentMethod).toBe('FLUTTERWAVE');
      expect(body.donation.flutterwaveTxId).toBe(body.txRef);
    });

    it('returns 502 when Flutterwave reports an error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'error', message: 'failed' }), { status: 200 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/donations/initiate',
        payload: { amount: 25, currency: 'USD', email: 'donor@example.com', method: 'flutterwave', campaign: 'General' },
      });
      expect(res.statusCode).toBe(502);
    });

    it('initiates a Stripe donation without calling fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/donations/initiate',
        payload: { amount: 10, currency: 'USD', email: 'donor2@example.com', method: 'stripe', campaign: 'General' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.checkoutUrl).toContain('https://checkout.stripe.com/c/pay/cs_donation_');
      expect(body.donation.paymentMethod).toBe('STRIPE');
      expect(body.donation.stripePaymentIntentId).toBe(body.txRef);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/donations', () => {
    it('allows FINANCE_OFFICER to list donations', async () => {
      await prisma.donation.create({
        data: { amountUsd: 50, currency: 'USD', email: 'donor3@example.com', paymentMethod: 'STRIPE', status: 'COMPLETED' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/donations',
        headers: { authorization: `Bearer ${financeOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.donations)).toBe(true);
      expect(body.donations.length).toBeGreaterThan(0);
    });

    it('filters by status', async () => {
      await prisma.donation.create({
        data: { amountUsd: 50, currency: 'USD', email: 'donor4@example.com', paymentMethod: 'STRIPE', status: 'PENDING' },
      });
      await prisma.donation.create({
        data: { amountUsd: 75, currency: 'USD', email: 'donor5@example.com', paymentMethod: 'STRIPE', status: 'COMPLETED' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/donations?status=completed',
        headers: { authorization: `Bearer ${financeOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.donations.every((d: any) => d.status === 'COMPLETED')).toBe(true);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/donations',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/donations/stats', () => {
    it('returns aggregated donation stats', async () => {
      await prisma.donation.create({
        data: { amountUsd: 100, currency: 'USD', email: 'donor6@example.com', paymentMethod: 'STRIPE', status: 'COMPLETED' },
      });
      await prisma.donation.create({
        data: { amountUsd: 50, currency: 'USD', email: 'donor7@example.com', paymentMethod: 'FLUTTERWAVE', status: 'COMPLETED' },
      });
      await prisma.donation.create({
        data: { amountUsd: 20, currency: 'USD', email: 'donor8@example.com', paymentMethod: 'STRIPE', status: 'PENDING' },
      });
      await prisma.scholarshipGrant.create({
        data: { grantedBy: plainUser.user.id, email: 'grantee@example.com', active: true },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/donations/stats',
        headers: { authorization: `Bearer ${financeOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalUsd).toBe(150);
      expect(body.activeScholarships).toBe(1);
      expect(body.pendingCount).toBe(1);
      expect(Array.isArray(body.byMethod)).toBe(true);
    });
  });

  describe('GET /api/v1/donations/donor-wall', () => {
    it('returns only completed donations marked for the donor wall', async () => {
      await prisma.donation.create({
        data: { amountUsd: 100, currency: 'USD', email: 'public-donor@example.com', donorName: 'Public Donor', paymentMethod: 'STRIPE', status: 'COMPLETED', showOnDonorWall: true, campaign: 'general' },
      });
      await prisma.donation.create({
        data: { amountUsd: 100, currency: 'USD', email: 'private-donor@example.com', donorName: 'Private Donor', paymentMethod: 'STRIPE', status: 'COMPLETED', showOnDonorWall: false, campaign: 'general' },
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/donations/donor-wall' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const names = body.donors.map((d: any) => d.donorName);
      expect(names).toContain('Public Donor');
      expect(names).not.toContain('Private Donor');
      expect(body.donors[0]).not.toHaveProperty('email');
    });
  });

  describe('POST /api/v1/donations/scholarships/grant', () => {
    it('grants a scholarship to an existing user and sends an email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/donations/scholarships/grant',
        headers: { authorization: `Bearer ${financeOfficerToken}` },
        payload: { email: plainUser.user.email, notes: 'sponsored' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.grant.userId).toBe(plainUser.user.id);
      expect(body.grant.email).toBe(plainUser.user.email);

      const user = await prisma.user.findUnique({ where: { id: plainUser.user.id } });
      expect(user?.subscriptionStatus).toBe('SCHOLARSHIP');

      const sub = await prisma.subscription.findUnique({ where: { userId: plainUser.user.id } });
      expect(sub?.status).toBe('SCHOLARSHIP');

      expect(sendScholarshipGrantedEmail).toHaveBeenCalledTimes(1);
    });

    it('grants a scholarship to a non-existent user without sending an email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/donations/scholarships/grant',
        headers: { authorization: `Bearer ${financeOfficerToken}` },
        payload: { email: 'no-such-user@example.com', notes: 'pending signup' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.grant.userId).toBeNull();
      expect(sendScholarshipGrantedEmail).not.toHaveBeenCalled();
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/donations/scholarships/grant',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: { email: 'x@example.com' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/donations/scholarships', () => {
    it('lists active scholarship grants', async () => {
      await prisma.scholarshipGrant.create({
        data: { grantedBy: plainUser.user.id, email: 'active-grant@example.com', active: true },
      });
      await prisma.scholarshipGrant.create({
        data: { grantedBy: plainUser.user.id, email: 'inactive-grant@example.com', active: false, revokedAt: new Date() },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/donations/scholarships',
        headers: { authorization: `Bearer ${financeOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const emails = body.grants.map((g: any) => g.email);
      expect(emails).toContain('active-grant@example.com');
      expect(emails).not.toContain('inactive-grant@example.com');
    });
  });
});
