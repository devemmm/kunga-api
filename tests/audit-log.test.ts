import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';

describe('Audit Log', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
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
    ({ token: plainUserToken } = await createAndLogin(app, FIXTURES.PLAIN_USER));
  });

  describe('GET /api/v1/admin/audit-log', () => {
    it('returns entries with action/entityType/entityId after a role permission update', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Audit Target Role' },
      });
      const { id } = created.json().role;

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/roles/${id}/permissions`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { permissionCodes: ['VIEW_DASHBOARD'] },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-log',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const entry = body.logs.find((l: any) => l.action === 'role.update_permissions' && l.entityId === id);
      expect(entry).toBeDefined();
      expect(entry.entityType).toBe('Role');
      expect(entry.userEmail).toBe(FIXTURES.SUPER_ADMIN.email);
    });

    it('filters by action search', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Search Target Role' },
      });
      const { id } = created.json().role;

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/roles/${id}/permissions`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { permissionCodes: ['VIEW_DASHBOARD'] },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-log?action=role.update_permissions',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.logs.length).toBeGreaterThanOrEqual(1);
      for (const log of body.logs) {
        expect(log.action).toBe('role.update_permissions');
      }
    });

    it('returns 403 for a plain user without VIEW_AUDIT_LOGS', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-log',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/audit-log' });
      expect(res.statusCode).toBe(401);
    });
  });
});
