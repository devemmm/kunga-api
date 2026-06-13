import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase, seedModuleFixtures } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';

vi.mock('../src/lib/r2.js', () => ({
  presignedPut: vi.fn(async (key: string) => `https://r2.example.com/presigned/${key}`),
  publicUrl: (key: string) => `https://assets.example.com/${key}`,
}));

describe('Modules & Module Groups', () => {
  let app: FastifyInstance;
  let contentManagerToken: string;
  let plainUserToken: string;
  let supportAgentToken: string;
  let fixtures: Awaited<ReturnType<typeof seedModuleFixtures>>;

  beforeAll(async () => {
    app = await getTestApp();
    await resetDb();
    await seedBase();
    fixtures = await seedModuleFixtures();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await resetMutableData();
    ({ token: contentManagerToken } = await createAndLogin(app, FIXTURES.CONTENT_MANAGER));
    ({ token: plainUserToken } = await createAndLogin(app, FIXTURES.PLAIN_USER));
    ({ token: supportAgentToken } = await createAndLogin(app, FIXTURES.SUPPORT_AGENT));
  });

  describe('GET /api/v1/modules/groups', () => {
    it('returns published groups with modules for any authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules/groups',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.groups)).toBe(true);
      const group = body.groups.find((g: any) => g.id === fixtures.group.id);
      expect(group).toBeDefined();
      const mod = group.modules.find((m: any) => m.id === fixtures.publishedModule.id);
      expect(mod).toBeDefined();
      expect(mod.locked).toBe(false);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/modules/groups' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/modules/groups/list', () => {
    it('lists all groups for Content Manager', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules/groups/list',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.groups.find((g: any) => g.id === fixtures.group.id)).toBeDefined();
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules/groups/list',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Module Group CRUD', () => {
    it('creates, updates, archives, unarchives and deletes a group (Content Manager)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/modules/groups',
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { name: 'Phase 2a Test Group', emoji: '🧪', description: 'temp group', sortOrder: 99 },
      });
      expect(createRes.statusCode).toBe(201);
      const groupId = createRes.json().group.id;

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/modules/groups/${groupId}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { description: 'updated description' },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().group.description).toBe('updated description');

      const archiveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/modules/groups/${groupId}/archive`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(archiveRes.statusCode).toBe(200);
      expect(archiveRes.json().group.status).toBe('ARCHIVED');

      const unarchiveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/modules/groups/${groupId}/unarchive`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(unarchiveRes.statusCode).toBe(200);
      expect(unarchiveRes.json().group.status).toBe('PUBLISHED');

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/modules/groups/${groupId}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
    });

    it('returns 409 deleting a group that still has modules', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/modules/groups/${fixtures.group.id}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 403 creating a group as a plain user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/modules/groups',
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { name: 'Should Fail', emoji: '🚫' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/modules', () => {
    it('only shows PUBLISHED modules to a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });

      expect(res.statusCode).toBe(200);
      const ids = res.json().modules.map((m: any) => m.id);
      expect(ids).toContain(fixtures.publishedModule.id);
      expect(ids).not.toContain(fixtures.draftModule.id);
    });

    it('shows DRAFT modules to a Content Manager (ADMIN)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const ids = res.json().modules.map((m: any) => m.id);
      expect(ids).toContain(fixtures.draftModule.id);
    });
  });

  describe('GET /api/v1/modules/:id', () => {
    it('returns the published module for any authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/modules/${fixtures.publishedModule.id}`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().module.id).toBe(fixtures.publishedModule.id);
    });

    it('returns 404 for a non-existent module', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules/nonexistent-id',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/modules/:id/details', () => {
    it('returns admin details for Content Manager', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/modules/${fixtures.publishedModule.id}/details`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.module.id).toBe(fixtures.publishedModule.id);
      expect(Array.isArray(body.module.videos)).toBe(true);
      expect(Array.isArray(body.module.resources)).toBe(true);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/modules/${fixtures.publishedModule.id}/details`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Module CRUD + publish lifecycle', () => {
    it('creates, updates, publishes, unpublishes and archives a module (Content Manager)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/modules',
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { groupId: fixtures.group.id, code: 'Z9', title: 'Temp Module', status: 'DRAFT' },
      });
      expect(createRes.statusCode).toBe(201);
      const moduleId = createRes.json().module.id;

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/modules/${moduleId}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'Updated Temp Module' },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().module.title).toBe('Updated Temp Module');

      const publishRes = await app.inject({
        method: 'POST',
        url: `/api/v1/modules/${moduleId}/publish`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: {},
      });
      expect(publishRes.statusCode).toBe(200);
      expect(publishRes.json().module.status).toBe('PUBLISHED');

      const unpublishRes = await app.inject({
        method: 'POST',
        url: `/api/v1/modules/${moduleId}/unpublish`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: {},
      });
      expect(unpublishRes.statusCode).toBe(200);
      expect(unpublishRes.json().module.status).toBe('DRAFT');

      const archiveRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/modules/${moduleId}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(archiveRes.statusCode).toBe(200);
      expect(archiveRes.json().message).toBe('Module archived');
    });

    it('returns 403 creating a module as Support Agent', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/modules',
        headers: { authorization: `Bearer ${supportAgentToken}` },
        payload: { groupId: fixtures.group.id, code: 'Z8', title: 'Should Fail' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/modules/:moduleId/feedback', () => {
    it('submits feedback for the published module', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/modules/${fixtures.publishedModule.id}/feedback`,
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { childResponse: 4, confidence: 5, comment: 'Great module!' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().feedback.childResponse).toBe(4);
    });
  });

  describe('Module Resources', () => {
    let resourceId: string;

    it('creates a resource on the published module (Content Manager)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/modules/${fixtures.publishedModule.id}/resources`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'Test Worksheet', type: 'WORKSHEET', url: 'https://example.com/worksheet.pdf', status: 'PUBLISHED' },
      });
      expect(res.statusCode).toBe(201);
      resourceId = res.json().resource.id;
      expect(resourceId).toBeTypeOf('string');
    });

    it('lists resources for the module', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/modules/${fixtures.publishedModule.id}/resources`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'Listing Worksheet', type: 'WORKSHEET', url: 'https://example.com/list.pdf', status: 'PUBLISHED' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/modules/${fixtures.publishedModule.id}/resources`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().resources.length).toBeGreaterThan(0);
    });

    it('updates and deletes a resource (Content Manager)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/modules/${fixtures.publishedModule.id}/resources`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'To Update', type: 'PDF', url: 'https://example.com/update.pdf', status: 'DRAFT' },
      });
      const id = createRes.json().resource.id;

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/modules/resources/${id}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'Updated Title', status: 'PUBLISHED' },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().resource.title).toBe('Updated Title');

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/modules/resources/${id}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/modules/resources/upload-url', () => {
    it('returns a presigned upload URL (Content Manager, mocked r2)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules/resources/upload-url?filename=worksheet.pdf&contentType=application/pdf',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.uploadUrl).toContain('https://r2.example.com/presigned/');
      expect(body.fileUrl).toContain('https://assets.example.com/');
    });

    it('returns 400 when filename/contentType missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules/resources/upload-url',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/modules/resources/upload-url?filename=worksheet.pdf&contentType=application/pdf',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
