import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { sendAssessmentReportEmail } from '../lib/email.js';

// ─── CHILD ASSESSMENTS ────────────────────────────────────────────────────────

export async function assessmentsRoutes(server: FastifyInstance) {
  // ── Mobile app: parent's own history ──────────────────────────────────────
  server.get('/', {
    schema: { tags: ['Assessments'], summary: 'Get my child assessment history', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const assessments = await prisma.childAssessment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ assessments });
  });

  server.post('/', {
    schema: { tags: ['Assessments'], summary: 'Submit a completed child assessment', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const user = (req as any).currentUser;
    const body = req.body as any;

    const assessment = await prisma.childAssessment.create({
      data: {
        userId: user.id,
        childName: body.childName,
        dateOfBirth: body.dateOfBirth ?? null,
        gender: body.gender ?? null,
        country: body.country ?? null,
        parentName: body.parentName ?? null,
        parentEmail: body.parentEmail ?? null,
        parentPhone: body.parentPhone ?? null,
        answers: body.answers ?? {},
        domainScores: body.domainScores ?? {},
        recommendedProgram: body.recommendedProgram ?? null,
        selectedProgram: body.selectedProgram ?? null,
        strengths: body.strengths ?? [],
        areasToSupport: body.areasToSupport ?? [],
        videoCount: body.videoCount ?? 0,
        photoCount: body.photoCount ?? 0,
        reportCount: body.reportCount ?? 0,
      },
    });

    const recipientEmail = (assessment.parentEmail || user.email || '').trim();
    if (recipientEmail) {
      sendAssessmentReportEmail(
        recipientEmail,
        assessment.parentName || user.name || '',
        assessment.childName,
        assessment.domainScores as Record<string, number>,
        assessment.recommendedProgram,
        assessment.strengths,
        assessment.areasToSupport,
      ).catch(() => {});
    }

    return reply.status(201).send({ assessment });
  });

  // ── Admin: view all parents' assessment history ────────────────────────────
  server.get('/admin/all', {
    schema: { tags: ['Assessments'], summary: '[Admin] List all child assessments', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('VIEW_ASSESSMENTS')],
  }, async (req, reply) => {
    const query = req.query as { page?: string; limit?: string; search?: string };
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const search = (query.search ?? '').trim();

    const where = search
      ? {
          OR: [
            { childName: { contains: search, mode: 'insensitive' as const } },
            { parentName: { contains: search, mode: 'insensitive' as const } },
            { parentEmail: { contains: search, mode: 'insensitive' as const } },
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const [assessments, total] = await Promise.all([
      prisma.childAssessment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      }),
      prisma.childAssessment.count({ where }),
    ]);

    return reply.send({ assessments, total, page, limit, pages: Math.ceil(total / limit) });
  });

  server.get('/admin/:id', {
    schema: { tags: ['Assessments'], summary: '[Admin] Get one assessment with user details', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('VIEW_ASSESSMENTS')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const assessment = await prisma.childAssessment.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
    });
    if (!assessment) return reply.status(404).send({ error: 'Assessment not found' });
    return reply.send({ assessment });
  });

  server.get('/:id', {
    schema: { tags: ['Assessments'], summary: 'Get one of my assessments by id', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = (req as any).currentUser;
    const assessment = await prisma.childAssessment.findFirst({ where: { id, userId: user.id } });
    if (!assessment) return reply.status(404).send({ error: 'Assessment not found' });
    return reply.send({ assessment });
  });
}
