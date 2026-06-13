import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase, seedModuleFixtures } from './helpers/db.js';
import { createAndLogin, DEFAULT_PASSWORD, FIXTURES } from './helpers/auth.js';

describe('User Profile', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();
    await resetDb();
    await seedBase();
    await seedModuleFixtures();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await resetMutableData();
    ({ token } = await createAndLogin(app, FIXTURES.PLAIN_USER));
  });

  describe('GET /api/v1/users/me', () => {
    it('returns profile, child profile, preferences & subscription', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.email).toBe(FIXTURES.PLAIN_USER.email);
      expect(body.childProfile).toBeNull();
      expect(body.preferences).toBeDefined();
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('updates name and avatarUrl', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name', avatarUrl: 'https://example.com/avatar.png' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.name).toBe('Updated Name');
    });
  });

  describe('POST /api/v1/users/me/change-password', () => {
    it('changes the password with the correct current password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/change-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: DEFAULT_PASSWORD, newPassword: 'NewPassword@456' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Password updated successfully');

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: FIXTURES.PLAIN_USER.email, password: 'NewPassword@456' },
      });
      expect(loginRes.statusCode).toBe(200);
    });

    it('returns 401 with the wrong current password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/change-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: 'WrongPassword@123', newPassword: 'NewPassword@456' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/users/me/child-profile', () => {
    it('creates and then updates the child profile', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/child-profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { childName: 'Test Child', challenges: ['speech'], ageMonths: 36 },
      });
      expect(createRes.statusCode).toBe(201);
      expect(createRes.json().childProfile.childName).toBe('Test Child');

      const updateRes = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/child-profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { childName: 'Updated Child', challenges: ['speech', 'motor'], ageMonths: 40 },
      });
      expect(updateRes.statusCode).toBe(201);
      expect(updateRes.json().childProfile.childName).toBe('Updated Child');
      expect(updateRes.json().childProfile.challenges).toEqual(['speech', 'motor']);
    });
  });

  describe('GET /api/v1/users/me/progress-summary', () => {
    it('returns the HomeScreen summary shape', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/progress-summary',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.streak).toBe('number');
      expect(Array.isArray(body.weekActivity)).toBe(true);
      expect(body.weekActivity.length).toBe(7);
      expect(typeof body.completedModules).toBe('number');
      expect(typeof body.totalModules).toBe('number');
      expect(typeof body.milestonesCount).toBe('number');
      expect(typeof body.todayRoutinePercent).toBe('number');
      expect(typeof body.todayCompleted).toBe('number');
      expect(typeof body.todayTotal).toBe('number');
    });
  });
});
