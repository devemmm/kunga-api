import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

describe('RBAC: Roles & Permissions', () => {
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

  describe('GET /api/v1/admin/permissions', () => {
    it('lists all permissions grouped by category for Super Admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/permissions',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.permissions.length).toBeGreaterThanOrEqual(23);
      expect(body.grouped).toHaveProperty('Administration');
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/permissions',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/permissions' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/admin/roles', () => {
    it('lists roles with permission codes for Super Admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const superAdmin = body.roles.find((r: any) => r.name === 'Super Admin');
      expect(superAdmin).toBeDefined();
      expect(superAdmin.permissions).toContain('MANAGE_ROLES');
      expect(superAdmin.isSystem).toBe(true);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/admin/roles', () => {
    it('creates a new custom role with permissions', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'QA Tester', description: 'Phase 1 test role', permissionCodes: ['VIEW_DASHBOARD', 'VIEW_CONTENT'] },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.role.name).toBe('QA Tester');
      expect(body.role.isSystem).toBe(false);
    });

    it('rejects a duplicate role name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Support Agent' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { name: 'Sneaky Role' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/roles/:id', () => {
    it('updates a custom role', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Editable Role' },
      });
      const { id } = created.json().role;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/roles/${id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { description: 'Updated description' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().role.description).toBe('Updated description');
    });

    it('rejects renaming a system role', async () => {
      const superAdminRole = await prisma.role.findUnique({ where: { name: 'Super Admin' } });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/roles/${superAdminRole!.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Renamed Admin' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/v1/admin/roles/:id/permissions', () => {
    it('updates permissions for a custom role and writes an audit log', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Permission Target Role' },
      });
      const { id } = created.json().role;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/roles/${id}/permissions`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { permissionCodes: ['VIEW_DASHBOARD', 'VIEW_USERS'] },
      });

      expect(res.statusCode).toBe(200);

      const log = await prisma.auditLog.findFirst({ where: { action: 'role.update_permissions', entityId: id } });
      expect(log).not.toBeNull();
      expect(log!.newValue).toEqual(expect.objectContaining({ permissionCodes: expect.arrayContaining(['VIEW_DASHBOARD', 'VIEW_USERS']) }));
    });
  });

  describe('DELETE /api/v1/admin/roles/:id', () => {
    it('deletes an unused custom role', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Deletable Role' },
      });
      const { id } = created.json().role;

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/roles/${id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('rejects deleting a system role', async () => {
      const superAdminRole = await prisma.role.findUnique({ where: { name: 'Super Admin' } });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/roles/${superAdminRole!.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects deleting a role with assigned users', async () => {
      const supportAgentRole = await prisma.role.findUnique({ where: { name: 'Support Agent' } });
      await createAndLogin(app, FIXTURES.SUPPORT_AGENT);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/roles/${supportAgentRole!.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
