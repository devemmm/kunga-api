import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase, seedModuleFixtures } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';

describe('Progress, Routine, Journal & Milestones', () => {
  let app: FastifyInstance;
  let activeToken: string;
  let noSubToken: string;
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
    ({ token: activeToken } = await createAndLogin(app, FIXTURES.PLAIN_USER));
    ({ token: noSubToken } = await createAndLogin(app, FIXTURES.NO_SUBSCRIPTION_USER));
  });

  describe('Progress', () => {
    it('GET / returns empty progress for a new user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/progress',
        headers: { authorization: `Bearer ${activeToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().progress).toEqual([]);
    });

    it('POST /:moduleId upserts progress without auto-completing below 90%', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/progress/${fixtures.publishedModule.id}`,
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { watchedPercent: 50, lastVideoId: fixtures.publishedVideo.id, resumePositionSec: 120 },
      });
      expect(res.statusCode).toBe(200);
      const progress = res.json().progress;
      expect(progress.watchedPercent).toBe(50);
      expect(progress.completed).toBe(false);
    });

    it('POST /:moduleId auto-completes when watchedPercent >= 90', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/progress/${fixtures.publishedModule.id}`,
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { watchedPercent: 95, lastVideoId: fixtures.publishedVideo.id, resumePositionSec: 300 },
      });
      expect(res.statusCode).toBe(200);
      const progress = res.json().progress;
      expect(progress.completed).toBe(true);
      expect(progress.completedAt).not.toBeNull();
    });

    it('POST /:moduleId/feedback upserts module feedback', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/progress/${fixtures.publishedModule.id}/feedback`,
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { childResponse: 3, confidence: 4, comment: 'Helpful' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().feedback.childResponse).toBe(3);
    });

    it('returns 402 without an active subscription', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/progress/${fixtures.publishedModule.id}`,
        headers: { authorization: `Bearer ${noSubToken}` },
        payload: { watchedPercent: 10 },
      });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('Routine', () => {
    it('GET /:date returns empty entries initially', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/routine/2026-06-10',
        headers: { authorization: `Bearer ${activeToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().entries).toEqual([]);
    });

    it('POST /sync batch-upserts entries', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routine/sync',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: {
          entries: [
            { date: '2026-06-10', category: 'morning', taskKey: 'brush_teeth', completed: true },
            { date: '2026-06-10', category: 'morning', taskKey: 'breakfast', completed: false },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().synced).toBe(2);
    });

    it('PATCH /:date/:category/:taskKey toggles a task', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/routine/2026-06-10/morning/brush_teeth',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { completed: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().entry.completed).toBe(true);
      expect(res.json().entry.completedAt).not.toBeNull();
    });

    it('GET /streak/current returns streak and weekActivity shape', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/routine/streak/current',
        headers: { authorization: `Bearer ${activeToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.streak).toBe('number');
      expect(Array.isArray(body.weekActivity)).toBe(true);
      expect(body.weekActivity.length).toBe(7);
    });

    it('returns 402 without an active subscription', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/routine/2026-06-10',
        headers: { authorization: `Bearer ${noSubToken}` },
      });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('Journal', () => {
    it('POST / creates a journal entry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { date: '2026-06-10', title: 'Great day', mood: 'good', tags: ['progress'], noteText: 'Did well today' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().entry.title).toBe('Great day');
    });

    it('POST / upserts (updates) an existing entry for the same date', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { date: '2026-06-11', title: 'First', mood: 'okay' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { date: '2026-06-11', title: 'Updated', mood: 'great' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().entry.title).toBe('Updated');
      expect(res.json().entry.mood).toBe('great');
    });

    it('GET / lists journal entries', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { date: '2026-06-12', title: 'Another entry' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${activeToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().entries.length).toBeGreaterThan(0);
    });

    it('DELETE /:date deletes a journal entry', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { date: '2026-06-13', title: 'To delete' },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/journal/2026-06-13',
        headers: { authorization: `Bearer ${activeToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('Journal entry deleted');
    });

    it('GET /photo-upload-url returns a placeholder upload URL', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/photo-upload-url',
        headers: { authorization: `Bearer ${activeToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().uploadUrl).toContain('https://r2-placeholder.example.com/');
    });

    it('returns 402 without an active subscription', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${noSubToken}` },
        payload: { date: '2026-06-10', title: 'Nope' },
      });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('Milestones', () => {
    it('POST / creates a weekly milestone report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/milestones',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { weekStart: '2026-06-08', responseName: 4, eyeContact: 3, sitting: 5, sounds: 2, calmness: 4, notes: 'Good progress' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().report.weekStart).toBe('2026-06-08');
      expect(res.json().report.responseName).toBe(4);
    });

    it('POST / upserts (updates) an existing report for the same weekStart', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/milestones',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { weekStart: '2026-06-01', responseName: 2 },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/milestones',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { weekStart: '2026-06-01', responseName: 5 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().report.responseName).toBe(5);
    });

    it('GET / lists milestone reports', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/milestones',
        headers: { authorization: `Bearer ${activeToken}` },
        payload: { weekStart: '2026-05-25', sitting: 3 },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/milestones',
        headers: { authorization: `Bearer ${activeToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().reports.length).toBeGreaterThan(0);
    });

    it('returns 402 without an active subscription', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/milestones',
        headers: { authorization: `Bearer ${noSubToken}` },
        payload: { weekStart: '2026-06-08' },
      });
      expect(res.statusCode).toBe(402);
    });
  });
});
