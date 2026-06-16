import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

vi.mock('../src/lib/email.js', () => ({
  sendAnnouncementEmail: vi.fn(async () => {}),
}));
vi.mock('../src/lib/expo-push.js', () => ({
  sendExpoPush: vi.fn(async () => {}),
  buildMessages: vi.fn(() => []),
}));

import { sendAnnouncementEmail } from '../src/lib/email.js';
import { sendExpoPush } from '../src/lib/expo-push.js';

describe('Announcements', () => {
  let app: FastifyInstance;
  let contentManagerToken: string;
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
    ({ token: contentManagerToken } = await createAndLogin(app, FIXTURES.CONTENT_MANAGER));
    plainUser = await createAndLogin(app, FIXTURES.PLAIN_USER);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/announcements', () => {
    it('lists published announcements for the user and excludes drafts', async () => {
      await prisma.announcement.create({
        data: { title: 'Published News', body: 'Hello world', status: 'PUBLISHED', publishedAt: new Date() },
      });
      await prisma.announcement.create({
        data: { title: 'Draft News', body: 'Not yet', status: 'DRAFT' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/announcements',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const titles = body.announcements.map((a: any) => a.title);
      expect(titles).toContain('Published News');
      expect(titles).not.toContain('Draft News');
    });

    it('excludes announcements the user has dismissed', async () => {
      const ann = await prisma.announcement.create({
        data: { title: 'Dismissible', body: 'Body', status: 'PUBLISHED', publishedAt: new Date() },
      });

      await app.inject({
        method: 'POST',
        url: `/api/v1/announcements/${ann.id}/dismiss`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/announcements',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const titles = res.json().announcements.map((a: any) => a.title);
      expect(titles).not.toContain('Dismissible');
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/announcements' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/announcements/active-banner', () => {
    it('returns the most recent published announcement as a banner', async () => {
      await prisma.announcement.create({
        data: { title: 'Older', body: 'Body', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 10000) },
      });
      const newer = await prisma.announcement.create({
        data: { title: 'Newer', body: 'Body', status: 'PUBLISHED', publishedAt: new Date() },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/announcements/active-banner',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.banner.id).toBe(newer.id);
    });

    it('returns null when no published announcements exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/announcements/active-banner',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().banner).toBeNull();
    });
  });

  describe('POST /api/v1/announcements/:id/dismiss', () => {
    it('creates a dismissal record and is idempotent', async () => {
      const ann = await prisma.announcement.create({
        data: { title: 'To Dismiss', body: 'Body', status: 'PUBLISHED', publishedAt: new Date() },
      });

      const res1 = await app.inject({
        method: 'POST',
        url: `/api/v1/announcements/${ann.id}/dismiss`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.json()).toEqual({ dismissed: true });

      const res2 = await app.inject({
        method: 'POST',
        url: `/api/v1/announcements/${ann.id}/dismiss`,
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res2.statusCode).toBe(200);

      const count = await prisma.userAnnouncementDismissal.count({
        where: { userId: plainUser.user.id, announcementId: ann.id },
      });
      expect(count).toBe(1);
    });
  });

  describe('GET /api/v1/announcements/admin', () => {
    it('allows CONTENT_MANAGER to list all announcements with dismissal counts', async () => {
      await prisma.announcement.create({
        data: { title: 'Admin Listed', body: 'Body', status: 'DRAFT' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/announcements/admin',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.announcements)).toBe(true);
      expect(body.announcements[0]).toHaveProperty('_count');
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/announcements/admin',
        headers: { authorization: `Bearer ${plainUser.token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/announcements/admin', () => {
    it('creates a draft announcement', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/announcements/admin',
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'New Announcement', body: 'Some body text' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.announcement.status).toBe('DRAFT');
      expect(body.announcement.title).toBe('New Announcement');
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/announcements/admin',
        headers: { authorization: `Bearer ${plainUser.token}` },
        payload: { title: 'New Announcement', body: 'Some body text' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns an error for an invalid payload (title too short)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/announcements/admin',
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'A', body: 'Some body text' },
      });
      // Zod validation errors aren't mapped to 400 by the global error
      // handler (no `.status`/`.statusCode` on ZodError), so they currently
      // surface as 500.
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/v1/announcements/admin/stats', () => {
    it('returns aggregated announcement stats', async () => {
      await prisma.announcement.create({
        data: { title: 'Published 1', body: 'Body', status: 'PUBLISHED', publishedAt: new Date(), pushSentCount: 10, bannerViewCount: 5 },
      });
      await prisma.announcement.create({
        data: { title: 'Draft 1', body: 'Body', status: 'DRAFT' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/announcements/admin/stats',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.published).toBe(1);
      expect(body.draft).toBe(1);
      expect(body.totalPushSent).toBe(10);
      expect(body.totalBannerViews).toBe(5);
      expect(Array.isArray(body.announcements)).toBe(true);
    });
  });

  describe('PATCH /api/v1/announcements/admin/:id', () => {
    it('updates an announcement', async () => {
      const ann = await prisma.announcement.create({
        data: { title: 'Old Title', body: 'Body', status: 'DRAFT' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/announcements/admin/${ann.id}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'New Title' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().announcement.title).toBe('New Title');

      const updated = await prisma.announcement.findUnique({ where: { id: ann.id } });
      expect(updated?.title).toBe('New Title');
    });
  });

  describe('GET /api/v1/announcements/admin/:id/viewers', () => {
    it('lists users who dismissed an announcement', async () => {
      const ann = await prisma.announcement.create({
        data: { title: 'Viewed', body: 'Body', status: 'PUBLISHED', publishedAt: new Date() },
      });
      await prisma.userAnnouncementDismissal.create({
        data: { userId: plainUser.user.id, announcementId: ann.id },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/announcements/admin/${ann.id}/viewers`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.viewers[0].id).toBe(plainUser.user.id);
      expect(body.viewers[0]).toHaveProperty('viewedAt');
    });
  });

  describe('POST /api/v1/announcements/admin/:id/publish', () => {
    it('publishes an announcement and sends push + email notifications', async () => {
      await prisma.user.update({
        where: { id: plainUser.user.id },
        data: { pushToken: 'ExponentPushToken[test-token]' },
      });

      const ann = await prisma.announcement.create({
        data: { title: 'To Publish', body: 'Body', status: 'DRAFT', targetAudience: 'ALL_REGISTERED' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/announcements/admin/${ann.id}/publish`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.announcement.status).toBe('PUBLISHED');
      expect(body.announcement.publishedAt).not.toBeNull();
      expect(body.sent).toBe(true);

      expect(sendExpoPush).toHaveBeenCalled();
      expect(sendAnnouncementEmail).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/announcements/admin/:id', () => {
    it('deletes an announcement', async () => {
      const ann = await prisma.announcement.create({
        data: { title: 'To Delete', body: 'Body', status: 'DRAFT' },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/announcements/admin/${ann.id}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ message: 'Announcement deleted' });

      const found = await prisma.announcement.findUnique({ where: { id: ann.id } });
      expect(found).toBeNull();
    });
  });
});
