import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin, requireSubscription } from '../middleware/auth.js';

// ─── PROGRESS ────────────────────────────────────────────────────────────────

export async function progressRoutes(server: FastifyInstance) {
  server.get('/', {
    schema: { tags: ['Progress'], summary: 'Get all progress for current user' },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const progress = await prisma.userProgress.findMany({
      where: { userId: user.id },
      include: { module: { select: { code: true, title: true, group: { select: { name: true } } } } },
    });
    return reply.send({ progress });
  });

  server.post('/:moduleId', {
    schema: { tags: ['Progress'], summary: 'Update module progress' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string };
    const user = (req as any).currentUser;
    const body = req.body as any;

    const data: any = {
      watchedPercent: body.watchedPercent,
      lastVideoId: body.lastVideoId,
      resumePositionSec: body.resumePositionSec,
      lastWatchedAt: new Date(),
    };

    if (body.watchedPercent >= 90 || body.completed) {
      data.completed = true;
      data.completedAt = new Date();
    }

    const progress = await prisma.userProgress.upsert({
      where: { userId_moduleId: { userId: user.id, moduleId } },
      update: data,
      create: { userId: user.id, moduleId, ...data },
    });

    return reply.send({ progress });
  });

  server.post('/:moduleId/feedback', {
    schema: { tags: ['Progress'], summary: 'Submit module feedback' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string };
    const user = (req as any).currentUser;
    const body = req.body as any;

    const feedback = await prisma.moduleFeedback.upsert({
      where: { userId_moduleId: { userId: user.id, moduleId } },
      update: { childResponse: body.childResponse, confidence: body.confidence, comment: body.comment },
      create: { userId: user.id, moduleId, childResponse: body.childResponse, confidence: body.confidence, comment: body.comment },
    });

    return reply.send({ feedback });
  });
}

// ─── ROUTINE ─────────────────────────────────────────────────────────────────

export async function routineRoutes(server: FastifyInstance) {
  server.get('/:date', {
    schema: { tags: ['Routine'], summary: 'Get daily routine for a date (YYYY-MM-DD)' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const { date } = req.params as { date: string };
    const user = (req as any).currentUser;

    const entries = await prisma.routineEntry.findMany({
      where: { userId: user.id, date },
    });

    return reply.send({ date, entries });
  });

  server.post('/sync', {
    schema: { tags: ['Routine'], summary: 'Sync offline routine entries' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const { entries } = req.body as { entries: any[] };

    const results = await Promise.all(
      entries.map(e =>
        prisma.routineEntry.upsert({
          where: { userId_date_category_taskKey: { userId: user.id, date: e.date, category: e.category, taskKey: e.taskKey } },
          update: { completed: e.completed, completedAt: e.completedAt ? new Date(e.completedAt) : null, syncedAt: new Date() },
          create: { userId: user.id, date: e.date, category: e.category, taskKey: e.taskKey, completed: e.completed, completedAt: e.completedAt ? new Date(e.completedAt) : null, syncedAt: new Date() },
        })
      )
    );

    return reply.send({ synced: results.length });
  });

  server.patch('/:date/:category/:taskKey', {
    schema: { tags: ['Routine'], summary: 'Toggle a routine task' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const { date, category, taskKey } = req.params as any;
    const user = (req as any).currentUser;
    const { completed } = req.body as { completed: boolean };

    const entry = await prisma.routineEntry.upsert({
      where: { userId_date_category_taskKey: { userId: user.id, date, category, taskKey } },
      update: { completed, completedAt: completed ? new Date() : null },
      create: { userId: user.id, date, category, taskKey, completed, completedAt: completed ? new Date() : null },
    });

    return reply.send({ entry });
  });

  server.get('/streak/current', {
    schema: { tags: ['Routine'], summary: 'Get current streak count' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const user = (req as any).currentUser;

    // Calculate streak: count consecutive days with ≥70% completion
    const entries = await prisma.routineEntry.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
    });

    const dateMap = new Map<string, { total: number; completed: number }>();
    for (const e of entries) {
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

    // Build weekActivity: 7 ints [Mon…Sun] — completed-task count per day
    const weekActivity: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const day = dateMap.get(key);
      weekActivity.push(day?.completed ?? 0);
    }

    return reply.send({ streak, weekActivity });
  });
}

// ─── MILESTONES ───────────────────────────────────────────────────────────────

export async function milestonesRoutes(server: FastifyInstance) {
  server.get('/', {
    schema: { tags: ['Milestones'], summary: 'Get milestone reports history' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const reports = await prisma.milestoneReport.findMany({
      where: { userId: user.id },
      orderBy: { weekStart: 'desc' },
      take: 52,
    });
    return reply.send({ reports });
  });

  server.post('/', {
    schema: { tags: ['Milestones'], summary: 'Submit weekly milestone report' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const body = req.body as any;

    const report = await prisma.milestoneReport.upsert({
      where: { userId_weekStart: { userId: user.id, weekStart: body.weekStart } },
      update: { responseName: body.responseName, eyeContact: body.eyeContact, sitting: body.sitting, sounds: body.sounds, calmness: body.calmness, notes: body.notes },
      create: { userId: user.id, weekStart: body.weekStart, responseName: body.responseName, eyeContact: body.eyeContact, sitting: body.sitting, sounds: body.sounds, calmness: body.calmness, notes: body.notes },
    });

    return reply.send({ report });
  });
}

// ─── PREFERENCES ─────────────────────────────────────────────────────────────

export async function preferencesRoutes(server: FastifyInstance) {
  server.get('/', {
    schema: { tags: ['Users'], summary: 'Get notification & app preferences' },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const prefs = await prisma.userPreferences.findUnique({ where: { userId: user.id } });
    return reply.send({ preferences: prefs });
  });

  server.patch('/', {
    schema: { tags: ['Users'], summary: 'Update preferences' },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const prefs = await prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: req.body as any,
      create: { userId: user.id, ...(req.body as any) },
    });
    return reply.send({ preferences: prefs });
  });
}

// ─── JOURNAL ─────────────────────────────────────────────────────────────────

export async function journalRoutes(server: FastifyInstance) {
  server.get('/', {
    schema: { tags: ['Journal'], summary: 'Get journal entries' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const query = req.query as any;
    const entries = await prisma.journalEntry.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: Number(query.limit ?? 30),
    });
    return reply.send({ entries });
  });

  server.post('/', {
    schema: { tags: ['Journal'], summary: 'Create/update journal entry' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const body = req.body as any;

    const entry = await prisma.journalEntry.upsert({
      where: { userId_date: { userId: user.id, date: body.date } },
      update: { noteText: body.noteText, photoR2Key: body.photoR2Key },
      create: { userId: user.id, date: body.date, noteText: body.noteText, photoR2Key: body.photoR2Key },
    });

    return reply.status(201).send({ entry });
  });

  server.delete('/:date', {
    schema: { tags: ['Journal'], summary: 'Delete journal entry by date (YYYY-MM-DD)' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    const { date } = req.params as { date: string };
    const user = (req as any).currentUser;
    await prisma.journalEntry.deleteMany({ where: { userId: user.id, date } });
    return reply.send({ message: 'Journal entry deleted' });
  });

  server.get('/photo-upload-url', {
    schema: { tags: ['Journal'], summary: 'Get R2 presigned upload URL for journal photo' },
    preHandler: [requireSubscription],
  }, async (req, reply) => {
    // In production: generate R2 presigned URL
    const key = `journal/${(req as any).currentUser.id}/${Date.now()}.jpg`;
    return reply.send({ uploadUrl: `https://r2-placeholder.example.com/${key}`, key });
  });
}
