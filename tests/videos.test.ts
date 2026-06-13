import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase, seedModuleFixtures } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';

vi.mock('../src/lib/minio.js', () => ({
  presignedPutMinio: vi.fn(async (key: string) => ({
    uploadUrl: `https://minio.example.com/presigned/${key}`,
    fileUrl: `https://minio.example.com/${key}`,
  })),
}));

describe('Videos', () => {
  let app: FastifyInstance;
  let contentManagerToken: string;
  let plainUserToken: string;
  let noSubToken: string;
  let plainUserId: string;
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
    const plain = await createAndLogin(app, FIXTURES.PLAIN_USER);
    plainUserToken = plain.token;
    plainUserId = plain.user.id;
    ({ token: noSubToken } = await createAndLogin(app, FIXTURES.NO_SUBSCRIPTION_USER));
  });

  describe('GET /api/v1/videos', () => {
    it('lists videos for Content Manager (MANAGE_VIDEOS)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/videos',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.videos)).toBe(true);
      expect(body.videos.find((v: any) => v.id === fixtures.publishedVideo.id)).toBeDefined();
    });

    it('returns 403 for a plain user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/videos',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Video CRUD lifecycle', () => {
    it('creates, updates and archives a video (Content Manager)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/videos',
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { moduleId: fixtures.publishedModule.id, title: 'Temp Video', type: 'EXPLANATION' },
      });
      expect(createRes.statusCode).toBe(201);
      const videoId = createRes.json().video.id;

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/videos/${videoId}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { title: 'Updated Temp Video' },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().video.title).toBe('Updated Temp Video');

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/videos/${videoId}`,
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().message).toBe('Video archived');
    });
  });

  describe('Upload URL endpoints', () => {
    it('returns a placeholder Cloudflare upload URL (no mocking needed)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/videos/upload-url',
        headers: { authorization: `Bearer ${contentManagerToken}` },
        payload: { moduleId: fixtures.publishedModule.id, title: 'New Upload Video' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().uploadUrl).toContain('upload.videodelivery.net');
    });

    it('returns a presigned MinIO PUT URL (mocked)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/videos/minio-upload-url?filename=clip.mp4',
        headers: { authorization: `Bearer ${contentManagerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.uploadUrl).toContain('https://minio.example.com/presigned/');
      expect(body.fileUrl).toContain('https://minio.example.com/');
    });

    it('returns 403 for a plain user on minio-upload-url', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/videos/minio-upload-url?filename=clip.mp4',
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/videos/:id/stream', () => {
    it('returns a stream URL for a subscribed user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/stream`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.noSource).toBeFalsy();
      expect(body.streamUrl).toBeTypeOf('string');
    });

    it('returns 402 for a user without an active subscription', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/stream`,
        headers: { authorization: `Bearer ${noSubToken}` },
      });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('POST /api/v1/videos/:id/bookmark', () => {
    it('toggles a bookmark on and off', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/bookmark`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(createRes.statusCode).toBe(200);
      expect(createRes.json().bookmarked).toBe(true);

      const toggleRes = await app.inject({
        method: 'POST',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/bookmark`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(toggleRes.statusCode).toBe(200);
      expect(toggleRes.json().bookmarked).toBe(false);
    });
  });

  describe('Video notes', () => {
    it('adds, lists, updates and deletes a note', async () => {
      const addRes = await app.inject({
        method: 'POST',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/notes`,
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { timestampSec: 30, noteText: 'Important moment' },
      });
      expect(addRes.statusCode).toBe(201);
      const noteId = addRes.json().note.id;

      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/notes`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().notes.find((n: any) => n.id === noteId)).toBeDefined();

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/videos/notes/${noteId}`,
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { noteText: 'Updated note text' },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().note.noteText).toBe('Updated note text');

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/videos/notes/${noteId}`,
        headers: { authorization: `Bearer ${plainUserToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
    });

    it('returns 400 when updating a note with empty noteText', async () => {
      const addRes = await app.inject({
        method: 'POST',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/notes`,
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { timestampSec: 10, noteText: 'A note' },
      });
      const noteId = addRes.json().note.id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/videos/notes/${noteId}`,
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { noteText: '   ' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 403 when another user tries to update someone else\'s note', async () => {
      const addRes = await app.inject({
        method: 'POST',
        url: `/api/v1/videos/${fixtures.publishedVideo.id}/notes`,
        headers: { authorization: `Bearer ${plainUserToken}` },
        payload: { timestampSec: 15, noteText: 'Owned by plain user' },
      });
      const noteId = addRes.json().note.id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/videos/notes/${noteId}`,
        headers: { authorization: `Bearer ${noSubToken}` },
        payload: { noteText: 'Hijacked' },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
