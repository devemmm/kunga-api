import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import { presignedPut, publicUrl } from '../lib/r2.js';
import { sendExpoPush, buildMessages } from '../lib/expo-push.js';
import type { AskGadSubmissionInput, AskGadResponseInput } from '../models/index.js';

export const AskGadService = {
  async submit(userId: string, data: AskGadSubmissionInput) {
    // Rate limit: 2 submissions per calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthCount = await prisma.askGadSubmission.count({
      where: { userId, createdAt: { gte: startOfMonth } },
    });

    if (thisMonthCount >= config.app.askGadMonthlyLimit) {
      throw Object.assign(
        new Error(`You can only submit ${config.app.askGadMonthlyLimit} questions per month`),
        { status: 429 },
      );
    }

    const submission = await prisma.askGadSubmission.create({
      // data.questionText matches DTO field (renamed from data.question) and DB field
      data: { userId, questionText: data.questionText, videoR2Key: data.videoR2Key },
    });
    return { submission };
  },

  async list(userId: string) {
    return prisma.askGadSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getUploadUrl() {
    const key = `ask-gad/submissions/${Date.now()}.mp4`;
    const uploadUrl = await presignedPut(key, 'video/mp4', 3600);
    const fileUrl   = publicUrl(key);
    return { uploadUrl, fileUrl, key, expiresIn: 3600 };
  },

  async getQueue(params?: { status?: string; search?: string; page?: number; limit?: number }) {
    const { status, search, page = 1, limit = 50 } = params ?? {};
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status === 'SUBMITTED' || status === 'pending') where.status = 'SUBMITTED';
    else if (status === 'RESPONDED' || status === 'responded') where.status = 'RESPONDED';
    else if (status === 'UNDER_REVIEW') where.status = 'UNDER_REVIEW';

    if (search) {
      where.OR = [
        { questionText: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [submissions, total] = await Promise.all([
      prisma.askGadSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true, name: true, email: true, avatarUrl: true, pushToken: true,
              subscriptionStatus: true, createdAt: true,
              childProfile: { select: { childName: true, ageMonths: true, challenges: true } },
            },
          },
        },
      }),
      prisma.askGadSubmission.count({ where }),
    ]);

    return { submissions, total, page, limit };
  },

  async getById(id: string) {
    const submission = await prisma.askGadSubmission.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, avatarUrl: true,
            subscriptionStatus: true, createdAt: true, lastLoginAt: true,
            childProfile: true,
            subscription: { select: { plan: true, platform: true, status: true } },
            _count: { select: { progress: true } },
          },
        },
      },
    });
    if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });
    return { submission };
  },

  async respond(id: string, data: AskGadResponseInput) {
    const submission = await prisma.askGadSubmission.findUnique({
      where: { id },
      include: { user: { select: { pushToken: true, name: true } } },
    });
    if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });

    const updated = await prisma.askGadSubmission.update({
      where: { id },
      data: {
        responseText: data.responseText,
        responseVideoR2Key: data.responseVideoR2Key,
        respondedAt: new Date(), status: "RESPONDED",
      },
    });

    // Send push notification to the parent who asked the question
    if (submission.user.pushToken) {
      await sendExpoPush(buildMessages([submission.user.pushToken], {
        title:    '🎤 Dr. Gad has responded!',
        body:     'Your question has been answered. Tap to view the response.',
        sound:    'default',
        priority: 'high',
        data:     { screen: 'AskGad', submissionId: id },
      }));
    }
    // Log activity
    await prisma.activityLog.create({
      data: { userId: submission.userId, action: 'askgad.responded', details: `Dr. Gad responded to submission ${id}` },
    });

    return { submission: updated };
  },

  async getResponseUploadUrl() {
    const key = `ask-gad/responses/${Date.now()}.mp4`;
    const uploadUrl = await presignedPut(key, 'video/mp4', 3600);
    const fileUrl   = publicUrl(key);
    return { uploadUrl, fileUrl, key, expiresIn: 3600 };
  },
};
