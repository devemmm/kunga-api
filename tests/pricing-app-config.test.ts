import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';

describe('Pricing & App Config', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let supportAgentToken: string;
  let plainUserToken: string;

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
    ({ token: supportAgentToken } = await createAndLogin(app, FIXTURES.SUPPORT_AGENT));
    ({ token: plainUserToken } = await createAndLogin(app, FIXTURES.PLAIN_USER));
  });

  describe('GET /api/v1/admin/pricing', () => {
    it('returns config for a user with VIEW_DASHBOARD', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const keys = body.config.map((c: any) => c.key);
      expect(keys).toContain('price_monthly_usd');
      expect(keys).toContain('price_annual_usd');
    });

    it('returns 403 for a plain user (no admin role)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/pricing', () => {
    it('updates a pricing value for a user with MANAGE_PRICING', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { key: 'price_monthly_usd', value: '19.99' },
      });

      expect(res.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      const entry = getRes.json().config.find((c: any) => c.key === 'price_monthly_usd');
      expect(entry.value).toBe('19.99');
    });

    it('returns 403 for a Support Agent (no MANAGE_PRICING)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${supportAgentToken}` },
        payload: { key: 'price_monthly_usd', value: '19.99' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects an unknown config key', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { key: 'not_a_real_key', value: '1' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Public app config endpoints', () => {
    it('GET /api/v1/app/version returns version info without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/app/version' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.minVersion).toBeTypeOf('string');
      expect(body.latestVersion).toBeTypeOf('string');
    });

    it('GET /api/v1/app/contact returns WhatsApp contact config without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/app/contact' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.enabled).toBeTypeOf('boolean');
      expect(body.number).toBeTypeOf('string');
    });

    it('GET /api/v1/app/pricing returns subscription pricing without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/app/pricing' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.monthly).toBeTypeOf('number');
      expect(body.annual).toBeTypeOf('number');
    });
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('ok');
    });
  });
});
