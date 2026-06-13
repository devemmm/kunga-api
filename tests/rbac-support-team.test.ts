import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

describe('RBAC: Support Team', () => {
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

  describe('GET /api/v1/admin/support-team', () => {
    it('lists support team members for Super Admin (VIEW_SUPPORT_TEAM via Support Manager too)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/support-team',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeGreaterThanOrEqual(2); // super admin + support agent
      const emails = body.members.map((m: any) => m.email);
      expect(emails).toContain(FIXTURES.SUPER_ADMIN.email);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/support-team',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for a Support Agent (no VIEW_SUPPORT_TEAM/MANAGE_SUPPORT_TEAM)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/support-team',
        headers: { authorization: `Bearer ${supportAgentToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/admin/support-team', () => {
    it('creates a new support team member with role assignment', async () => {
      const supportAgentRole = await prisma.role.findUnique({ where: { name: 'Support Agent' } });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/support-team',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'New Agent', email: 'new-agent@test.kungabasics.com', roleIds: [supportAgentRole!.id] },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.member.email).toBe('new-agent@test.kungabasics.com');
      expect(body.member.roles).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Support Agent' })]));
      expect(body.tempPassword).toBeTypeOf('string');
    });

    it('rejects a duplicate email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/support-team',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Dup', email: FIXTURES.SUPER_ADMIN.email },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 403 for a Support Agent (no MANAGE_SUPPORT_TEAM)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/support-team',
        headers: { authorization: `Bearer ${supportAgentToken}` },
        payload: { name: 'Sneaky', email: 'sneaky@test.kungabasics.com' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Member lifecycle (update / deactivate / activate)', () => {
    it('updates, deactivates, and reactivates a member', async () => {
      const member = await createAndLogin(app, FIXTURES.SUPPORT_MANAGER);

      const update = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/support-team/${member.user.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { name: 'Renamed Manager' },
      });
      expect(update.statusCode).toBe(200);

      const deactivate = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/support-team/${member.user.id}/deactivate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(deactivate.statusCode).toBe(200);

      const reactivate = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/support-team/${member.user.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(reactivate.statusCode).toBe(200);

      const refreshed = await prisma.user.findUnique({ where: { id: member.user.id } });
      expect(refreshed!.name).toBe('Renamed Manager');
      expect(refreshed!.isActive).toBe(true);
    });
  });

  describe('POST /api/v1/admin/support-team/:id/regenerate-password', () => {
    it('returns a new temporary password', async () => {
      const member = await createAndLogin(app, FIXTURES.SUPPORT_MANAGER);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/support-team/${member.user.id}/regenerate-password`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().tempPassword).toBeTypeOf('string');
      expect(res.json().tempPassword.length).toBeGreaterThan(6);
    });

    it('returns 403 for a Support Agent', async () => {
      const member = await createAndLogin(app, FIXTURES.SUPPORT_MANAGER);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/support-team/${member.user.id}/regenerate-password`,
        headers: { authorization: `Bearer ${supportAgentToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/support-team/:id/roles', () => {
    it('reassigns roles for a member', async () => {
      const member = await createAndLogin(app, { ...FIXTURES.SUPPORT_AGENT, email: 'reassign-roles@test.kungabasics.com' });
      const contentManagerRole = await prisma.role.findUnique({ where: { name: 'Content Manager' } });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/support-team/${member.user.id}/roles`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { roleIds: [contentManagerRole!.id] },
      });

      expect(res.statusCode).toBe(200);

      const assignments = await prisma.userRoleAssignment.findMany({
        where: { userId: member.user.id },
        include: { role: true },
      });
      expect(assignments.map(a => a.role.name)).toEqual(['Content Manager']);
    });
  });

  describe('PATCH /api/v1/admin/support-team/:id/permissions', () => {
    it('sets direct permission overrides for a member', async () => {
      const member = await createAndLogin(app, { ...FIXTURES.SUPPORT_AGENT, email: 'permission-overrides@test.kungabasics.com' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/support-team/${member.user.id}/permissions`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: { permissionCodes: ['MANAGE_PRICING'] },
      });

      expect(res.statusCode).toBe(200);

      const overrides = await prisma.userPermission.findMany({
        where: { userId: member.user.id },
        include: { permission: true },
      });
      expect(overrides.map(o => o.permission.code)).toEqual(['MANAGE_PRICING']);
    });
  });
});
