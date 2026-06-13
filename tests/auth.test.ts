import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createUser, DEFAULT_PASSWORD, FIXTURES } from './helpers/auth.js';

describe('Auth', () => {
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

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user and returns tokens', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'new-user@test.kungabasics.com', name: 'New User', password: 'Password@123' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user.email).toBe('new-user@test.kungabasics.com');
      expect(body.user.role).toBe('PARENT');
      expect(body.accessToken).toBeTypeOf('string');
      expect(body.refreshToken).toBeTypeOf('string');
    });

    it('rejects a duplicate email', async () => {
      await createUser({ email: 'dup@test.kungabasics.com' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'dup@test.kungabasics.com', name: 'Dup User', password: 'Password@123' },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in with valid credentials', async () => {
      await createUser({ email: 'login@test.kungabasics.com' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'login@test.kungabasics.com', password: DEFAULT_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.email).toBe('login@test.kungabasics.com');
      expect(body.accessToken).toBeTypeOf('string');
      expect(body.refreshToken).toBeTypeOf('string');
    });

    it('rejects an invalid password', async () => {
      await createUser({ email: 'login2@test.kungabasics.com' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'login2@test.kungabasics.com', password: 'WrongPassword!' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects a non-existent email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@test.kungabasics.com', password: DEFAULT_PASSWORD },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('issues a new access token from a valid refresh token', async () => {
      await createUser({ email: 'refresh@test.kungabasics.com' });
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'refresh@test.kungabasics.com', password: DEFAULT_PASSWORD },
      });
      const { refreshToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeTypeOf('string');
    });

    it('rejects an invalid refresh token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      expect(res.statusCode).toBe(401);
    });

    it('returns the current user with roles + effectivePermissions for an admin', async () => {
      await createUser(FIXTURES.SUPER_ADMIN);
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: FIXTURES.SUPER_ADMIN.email, password: DEFAULT_PASSWORD },
      });
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.email).toBe(FIXTURES.SUPER_ADMIN.email);
      expect(body.user.roles).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Super Admin' })]));
      expect(body.user.effectivePermissions).toEqual(expect.arrayContaining(['VIEW_DASHBOARD', 'MANAGE_ROLES']));
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('requires auth and returns a confirmation message', async () => {
      await createUser({ email: 'logout@test.kungabasics.com' });
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'logout@test.kungabasics.com', password: DEFAULT_PASSWORD },
      });
      const { accessToken } = login.json();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/logged out/i);
    });
  });

  describe('Password reset flow', () => {
    it('forgot-password always returns a generic success message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email: 'nobody@test.kungabasics.com' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/reset link/i);
    });

    it('resets the password with a valid reset token', async () => {
      const user = await createUser({ email: 'reset@test.kungabasics.com' });
      const resetToken = app.jwt.sign({ sub: user.id, type: 'password_reset' }, { expiresIn: '1h' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { token: resetToken, newPassword: 'NewPassword@456' },
      });

      expect(res.statusCode).toBe(200);

      // New password works for login
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'reset@test.kungabasics.com', password: 'NewPassword@456' },
      });
      expect(login.statusCode).toBe(200);
    });

    it('rejects an invalid reset token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { token: 'not-a-real-token', newPassword: 'NewPassword@456' },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
