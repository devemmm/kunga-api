import type { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/user.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

export async function usersRoutes(server: FastifyInstance) {
  server.get('/me', {
    schema: { tags: ['Users'], summary: 'Get my profile, child profile, preferences & subscription', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, UserController.getMe);

  server.patch('/me', {
    schema: {
      tags: ['Users'], summary: 'Update my profile', security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          avatarUrl: { type: 'string', format: 'uri' },
          pushToken: { type: 'string' },
        },
      },
    },
    preHandler: [requireAuth],
  }, UserController.updateMe);

  server.post('/me/change-password', {
    schema: {
      tags: ['Users'], summary: 'Change password', security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['currentPassword', 'newPassword'],
        properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } },
      },
    },
    preHandler: [requireAuth],
  }, UserController.changePassword);

  server.post('/me/child-profile', {
    schema: {
      tags: ['Users'], summary: 'Create or update child profile', security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['childName', 'challenges'],
        properties: {
          childName: { type: 'string' },
          dateOfBirth: { type: 'string' },
          ageMonths: { type: 'number' },
          challenges: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    preHandler: [requireAuth],
  }, UserController.upsertChildProfile);

  // ─── Progress summary (HomeScreen efficiency endpoint) ────────────────────

  server.get('/me/progress-summary', {
    schema: { tags: ['Users'], summary: 'Get streak, module progress & routine summary for HomeScreen', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const user = (req as any).currentUser;

    const [completedModules, totalModules, milestonesCount, routineEntries, todayEntries] = await Promise.all([
      prisma.userProgress.count({ where: { userId: user.id, completed: true } }),
      prisma.module.count({ where: { status: 'PUBLISHED' } }),
      prisma.milestoneReport.count({ where: { userId: user.id } }),
      prisma.routineEntry.findMany({ where: { userId: user.id }, orderBy: { date: 'desc' }, take: 730 }),
      prisma.routineEntry.findMany({ where: { userId: user.id, date: new Date().toISOString().split('T')[0] } }),
    ]);

    // Compute current streak
    const dateMap = new Map<string, { total: number; completed: number }>();
    for (const e of routineEntries) {
      const d = dateMap.get(e.date) ?? { total: 0, completed: 0 };
      d.total++;
      if (e.completed) d.completed++;
      dateMap.set(e.date, d);
    }
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const day = dateMap.get(key);
      if (!day || day.total === 0 || day.completed / day.total < 0.7) break;
      streak++;
    }

    // Build weekActivity: 7-element array [Mon…Sun] of completed task counts
    const weekActivity: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const day = dateMap.get(key);
      weekActivity.push(day?.completed ?? 0);
    }

    const todayCompleted = todayEntries.filter(e => e.completed).length;
    const todayTotal = todayEntries.length;
    const todayRoutinePercent = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

    return reply.send({
      streak,
      weekActivity,
      completedModules,
      totalModules,
      milestonesCount,
      todayRoutinePercent,
      todayCompleted,
      todayTotal,
    });
  });

  // ─── Notification history ─────────────────────────────────────────────────

  server.get('/me/notifications', {
    schema: { tags: ['Users'], summary: 'Get in-app notification history (Ask Dr. Gad responses + announcements)', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const user = (req as any).currentUser;

    const [askGadResponses, announcements] = await Promise.all([
      prisma.askGadSubmission.findMany({
        where: { userId: user.id, status: 'RESPONDED' },
        orderBy: { respondedAt: 'desc' },
        take: 20,
        select: { id: true, questionText: true, responseText: true, respondedAt: true },
      }),
      prisma.announcement.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 15,
        select: { id: true, title: true, body: true, publishedAt: true, createdAt: true },
      }),
    ]);

    const notifications = [
      ...askGadResponses.map(s => ({
        id: `gad-${s.id}`,
        type: 'ask_gad_response' as const,
        title: '🎤 Dr. Gad has responded!',
        body: s.responseText ? s.responseText.substring(0, 120) : 'Your question has been answered.',
        timestamp: s.respondedAt ?? new Date(),
        read: false,
        data: { screen: 'AskGad', submissionId: s.id },
      })),
      ...announcements.map(a => ({
        id: `ann-${a.id}`,
        type: 'announcement' as const,
        title: a.title,
        body: a.body,
        timestamp: a.publishedAt ?? a.createdAt,
        read: false,
        data: { screen: 'Announcements', announcementId: a.id },
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return reply.send({ notifications, total: notifications.length });
  });

  server.get('/me/data-export', {
    schema: { tags: ['Users'], summary: 'GDPR Article 20 — export all personal data as JSON', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, UserController.exportData);

  server.delete('/me', {
    schema: { tags: ['Users'], summary: 'GDPR Article 17 — delete account and anonymise all personal data', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, UserController.deleteAccount);

  // ─── Admin ────────────────────────────────────────────────────────────────

  server.get('/', {
    schema: {
      tags: ['Users'], summary: '[Admin] List all users with pagination, search & filter', security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          search: { type: 'string' },
          status: { type: 'string', enum: ['active', 'free', 'cancelled', 'expired'] },
        },
      },
    },
    preHandler: [requireAdmin],
  }, UserController.list);

  server.get('/:id', {
    schema: { tags: ['Users'], summary: '[Admin] Get single user with full details', security: [{ bearerAuth: [] }] },
    preHandler: [requireAdmin],
  }, UserController.getById);

  server.post('/:id/send-email', {
    schema: { tags: ['Users'], summary: '[Admin] Send email to a user', security: [{ bearerAuth: [] }] },
    preHandler: [requireAdmin],
  }, UserController.sendEmail);

  server.get('/export/csv', {
    schema: { tags: ['Users'], summary: '[Admin] Export users as CSV', security: [{ bearerAuth: [] }] },
    preHandler: [requireAdmin],
  }, UserController.exportCSV);
}
