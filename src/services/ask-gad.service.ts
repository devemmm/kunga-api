import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import { presignedPutMinio, minioPublicUrl } from '../lib/minio.js';
import { sendExpoPush, buildMessages } from '../lib/expo-push.js';
import type { AskGadSubmissionInput, AskGadResponseInput } from '../models/index.js';

// ─── Config helper ────────────────────────────────────────────────────────────

/** Read Ask Dr. Gad config from app_config table (with fallback defaults). */
async function getAskGadConfig() {
  try {
    const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
      SELECT key, value FROM app_config
      WHERE key IN ('askgad_monthly_limit','askgad_credit_price','askgad_credits_per_pack')
    `;
    const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      monthlyLimit:   Number(m.askgad_monthly_limit    ?? config.app.askGadMonthlyLimit),
      creditPrice:    Number(m.askgad_credit_price     ?? 5),
      creditsPerPack: Number(m.askgad_credits_per_pack ?? 1),
    };
  } catch {
    return { monthlyLimit: config.app.askGadMonthlyLimit, creditPrice: 5, creditsPerPack: 1 };
  }
}

/** Current calendar-month key e.g. "2026-06" */
function monthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Start of current calendar month (midnight UTC) */
function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const AskGadService = {
  async submit(userId: string, data: AskGadSubmissionInput) {
    const { monthlyLimit, creditPrice, creditsPerPack } = await getAskGadConfig();
    const mk = monthKey();

    const [thisMonthCount, activeCredits] = await Promise.all([
      prisma.askGadSubmission.count({ where: { userId, createdAt: { gte: startOfMonth() } } }),
      prisma.questionCredit.aggregate({
        where: { userId, monthKey: mk, status: 'ACTIVE' },
        _sum: { credits: true },
      }),
    ]);

    const hasCredit = (activeCredits._sum.credits ?? 0) > 0;
    // Buying a credit gives unlimited questions for the month
    const effectiveLimit = hasCredit ? 9999 : monthlyLimit;

    if (thisMonthCount >= effectiveLimit) {
      throw Object.assign(
        new Error(`You have used all ${monthlyLimit} free questions this month.`),
        { status: 429, creditPrice, creditsPerPack },
      );
    }

    const submission = await prisma.askGadSubmission.create({
      data: { userId, questionText: data.questionText, videoR2Key: data.videoR2Key },
    });
    return { submission };
  },

  async list(userId: string) {
    const { monthlyLimit, creditPrice, creditsPerPack } = await getAskGadConfig();
    const mk = monthKey();

    const [submissions, activeCredits] = await Promise.all([
      prisma.askGadSubmission.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.questionCredit.aggregate({
        where: { userId, monthKey: mk, status: 'ACTIVE' },
        _sum: { credits: true },
      }),
    ]);

    const hasCredit    = (activeCredits._sum.credits ?? 0) > 0;
    const effectiveLimit = hasCredit ? 9999 : monthlyLimit;

    const withUrls = submissions.map((s) => ({
      ...s,
      videoUrl: minioPublicUrl(s.videoR2Key),
      responseVideoUrl: minioPublicUrl(s.responseVideoR2Key),
    }));

    return {
      submissions: withUrls,
      monthlyLimit,
      hasCredit,
      effectiveLimit,
      creditPrice,
      creditsPerPack,
    };
  },

  /** Initiate a Flutterwave payment to buy question credits. */
  async purchaseCredit(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const { creditPrice, creditsPerPack } = await getAskGadConfig();
    const mk     = monthKey();
    const txRef  = `QCR-${userId}-${Date.now()}`;

    // Create Flutterwave hosted payment link
    let paymentLink: string;
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 5000);
      const res  = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.flutterwave.secretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_ref:       txRef,
          amount:       creditPrice,
          currency:     'USD',
          redirect_url: config.flutterwave.redirectUrl,
          meta:         { userId, type: 'question_credit', monthKey: mk, credits: creditsPerPack },
          customer:     { email: user.email, name: user.name ?? user.email },
          customizations: {
            title:       'Kunga Basics — Question Credit',
            description: `${creditsPerPack} extra question${creditsPerPack > 1 ? 's' : ''} with Dr. Gad this month`,
          },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const flwData = await res.json() as any;
      if (!res.ok || flwData.status !== 'success') {
        throw Object.assign(new Error(flwData?.message ?? 'Payment provider error'), { status: 502 });
      }
      paymentLink = flwData.data.link;
    } catch (err: any) {
      if (err.status) throw err;
      throw Object.assign(new Error('Failed to connect to payment provider'), { status: 502 });
    }

    // Record a pending credit
    await prisma.questionCredit.create({
      data: { userId, monthKey: mk, credits: creditsPerPack, amountUsd: creditPrice, txRef, status: 'PENDING' },
    });

    // Track addon on subscription for next renewal pricing
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (subscription) {
      await prisma.subscription.update({
        where: { userId },
        data:  { questionAddonUsd: { increment: creditPrice } },
      });
    }

    return { paymentLink, txRef, amountUsd: creditPrice, credits: creditsPerPack };
  },

  /** Verify a question credit purchase (called after Flutterwave redirect). */
  async verifyCredit(txRef: string) {
    const credit = await prisma.questionCredit.findUnique({ where: { txRef } });
    if (!credit) throw Object.assign(new Error('Credit not found'), { status: 404 });
    if (credit.status === 'ACTIVE') return { verified: true, alreadyActive: true, credit };

    // Verify with Flutterwave
    let flwData: any;
    try {
      const res = await fetch(
        `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
        { headers: { 'Authorization': `Bearer ${config.flutterwave.secretKey}` } }
      );
      flwData = await res.json();
    } catch {
      throw Object.assign(new Error('Could not reach payment provider'), { status: 502 });
    }

    if (flwData.status !== 'success' || flwData.data?.status !== 'successful') {
      return { verified: false, paymentStatus: flwData.data?.status ?? 'unknown' };
    }

    await prisma.questionCredit.update({ where: { txRef }, data: { status: 'ACTIVE' } });
    return { verified: true, activated: true, credit };
  },

  async getUploadUrl() {
    const key = `ask-gad/submissions/${Date.now()}.mp4`;
    const { uploadUrl, fileUrl } = await presignedPutMinio(key, 3600);
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
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
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
    const withUrls = submissions.map((s) => ({
      ...s,
      videoUrl: minioPublicUrl(s.videoR2Key),
      responseVideoUrl: minioPublicUrl(s.responseVideoR2Key),
    }));
    return { submissions: withUrls, total, page, limit };
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
            subscription: { select: { plan: true, platform: true, status: true, questionAddonUsd: true } },
            _count: { select: { progress: true } },
          },
        },
      },
    });
    if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });
    return {
      submission: {
        ...submission,
        videoUrl: minioPublicUrl(submission.videoR2Key),
        responseVideoUrl: minioPublicUrl(submission.responseVideoR2Key),
      },
    };
  },

  async respond(id: string, data: AskGadResponseInput) {
    const submission = await prisma.askGadSubmission.findUnique({
      where: { id },
      include: { user: { select: { pushToken: true, name: true } } },
    });
    if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });

    const updated = await prisma.askGadSubmission.update({
      where: { id },
      data: { responseText: data.responseText, responseVideoR2Key: data.responseVideoR2Key, respondedAt: new Date(), status: 'RESPONDED' },
    });

    if (submission.user.pushToken) {
      await sendExpoPush(buildMessages([submission.user.pushToken], {
        title: '🎤 Dr. Gad has responded!',
        body:  'Your question has been answered. Tap to view the response.',
        sound: 'default', priority: 'high',
        data:  { screen: 'AskGad', submissionId: id },
      }));
    }
    await prisma.activityLog.create({
      data: { userId: submission.userId, action: 'askgad.responded', details: `Dr. Gad responded to submission ${id}` },
    });
    return { submission: updated };
  },

  async getResponseUploadUrl() {
    const key = `ask-gad/responses/${Date.now()}.mp4`;
    const { uploadUrl, fileUrl } = await presignedPutMinio(key, 3600);
    return { uploadUrl, fileUrl, key, expiresIn: 3600 };
  },
};
