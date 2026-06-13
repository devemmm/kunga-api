import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from './helpers/app.js';
import { resetDb, resetMutableData, seedBase } from './helpers/db.js';
import { createAndLogin, FIXTURES } from './helpers/auth.js';
import { prisma } from '../src/lib/prisma.js';

describe('Ask Dr. Gad', () => {
  let app: FastifyInstance;
  let parentToken: string;
  let parentUserId: string;
  let supportAgentToken: string;
  let supportAgentUserId: string;
  let superAdminToken: string;

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
    const parent = await createAndLogin(app, FIXTURES.PLAIN_USER);
    parentToken = parent.token;
    parentUserId = parent.user.id;

    const agent = await createAndLogin(app, FIXTURES.SUPPORT_AGENT);
    supportAgentToken = agent.token;
    supportAgentUserId = agent.user.id;

    ({ token: superAdminToken } = await createAndLogin(app, FIXTURES.SUPER_ADMIN));
  });

  describe('POST /api/v1/ask-gad', () => {
    it('submits a question for a subscribed user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });

      expect(res.statusCode).toBe(201);
      const submission = await prisma.askGadSubmission.findFirst({ where: { userId: parentUserId } });
      expect(submission).not.toBeNull();
      expect(submission!.status).toBe('SUBMITTED');
    });

    it('rejects a submission with too short a question', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'short' },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('returns 402 for a user without an active subscription', async () => {
      const noSub = await createAndLogin(app, { email: 'no-sub@test.kungabasics.com', subscriptionStatus: 'NONE' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${noSub.token}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });

      expect(res.statusCode).toBe(402);
    });
  });

  describe('GET /api/v1/ask-gad', () => {
    it('lists the current user\'s submissions with a monthly limit', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.submissions).toHaveLength(1);
      expect(body.monthlyLimit).toBeTypeOf('number');
    });
  });

  describe('GET /api/v1/ask-gad/admin/queue', () => {
    it('returns the submission queue for a Support Agent with VIEW_QUESTIONS', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ask-gad/admin/queue',
        headers: { authorization: `Bearer ${supportAgentToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.submissions.length).toBeGreaterThanOrEqual(1);
      expect(body.submissions[0].user.email).toBe(FIXTURES.PLAIN_USER.email);
    });

    it('returns 403 for a plain user (no VIEW_QUESTIONS)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ask-gad/admin/queue',
        headers: { authorization: `Bearer ${parentToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/ask-gad/admin/assignees', () => {
    it('lists assignable agents for a Support Manager (ASSIGN_QUESTIONS)', async () => {
      const manager = await createAndLogin(app, FIXTURES.SUPPORT_MANAGER);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ask-gad/admin/assignees',
        headers: { authorization: `Bearer ${manager.token}` },
      });

      expect(res.statusCode).toBe(200);
      const emails = res.json().agents.map((a: any) => a.email);
      expect(emails).toContain(FIXTURES.SUPPORT_AGENT.email);
    });

    it('returns 403 for a Support Agent (no ASSIGN_QUESTIONS)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ask-gad/admin/assignees',
        headers: { authorization: `Bearer ${supportAgentToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/ask-gad/admin/:id/assign', () => {
    it('assigns a submission to a support agent and moves it to UNDER_REVIEW', async () => {
      const submitRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });
      const submissionId = submitRes.json().submission.id;

      const manager = await createAndLogin(app, FIXTURES.SUPPORT_MANAGER);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ask-gad/admin/${submissionId}/assign`,
        headers: { authorization: `Bearer ${manager.token}` },
        payload: { assignedToId: supportAgentUserId },
      });

      expect(res.statusCode).toBe(200);

      const updated = await prisma.askGadSubmission.findUnique({ where: { id: submissionId } });
      expect(updated!.assignedToId).toBe(supportAgentUserId);
      expect(updated!.status).toBe('UNDER_REVIEW');

      const log = await prisma.auditLog.findFirst({ where: { action: 'askgad.assign', entityId: submissionId } });
      expect(log).not.toBeNull();
    });

    it('returns 403 for a plain user', async () => {
      const submitRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });
      const submissionId = submitRes.json().submission.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ask-gad/admin/${submissionId}/assign`,
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { assignedToId: supportAgentUserId },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/ask-gad/admin/:id/escalate', () => {
    it('escalates a submission and writes an audit log', async () => {
      const submitRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });
      const submissionId = submitRes.json().submission.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ask-gad/admin/${submissionId}/escalate`,
        headers: { authorization: `Bearer ${supportAgentToken}` },
        payload: { reason: 'Requires medical expertise beyond my scope' },
      });

      expect(res.statusCode).toBe(200);

      const updated = await prisma.askGadSubmission.findUnique({ where: { id: submissionId } });
      expect(updated!.status).toBe('ESCALATED');
      expect(updated!.escalationReason).toBe('Requires medical expertise beyond my scope');

      const log = await prisma.auditLog.findFirst({ where: { action: 'askgad.escalate', entityId: submissionId } });
      expect(log).not.toBeNull();
    });

    it('returns 403 for a plain user', async () => {
      const submitRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });
      const submissionId = submitRes.json().submission.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ask-gad/admin/${submissionId}/escalate`,
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { reason: 'Not allowed' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/ask-gad/admin/:id/respond', () => {
    it('responds to a submission as a Support Agent with ANSWER_QUESTIONS', async () => {
      const submitRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ask-gad',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: { questionText: 'How do I help my child with picky eating habits?' },
      });
      const submissionId = submitRes.json().submission.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ask-gad/admin/${submissionId}/respond`,
        headers: { authorization: `Bearer ${supportAgentToken}` },
        payload: { responseText: 'Try offering small portions of new foods alongside familiar favorites.' },
      });

      expect(res.statusCode).toBe(200);

      const updated = await prisma.askGadSubmission.findUnique({ where: { id: submissionId } });
      expect(updated!.status).toBe('RESPONDED');
      expect(updated!.responseText).toBe('Try offering small portions of new foods alongside familiar favorites.');
    });
  });
});
