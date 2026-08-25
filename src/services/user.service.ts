import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { sendAdminEmail } from '../lib/email.js';
import type {
  UpdateProfileInput,
  ChildProfileInput,
  ChangePasswordInput,
  UserListQuery,
} from '../models/user.model.js';

export const UserService = {
  async getProfile(userId: string) {
    const [user, childProfile, preferences, subscription] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, subscriptionStatus: true, createdAt: true, lastLoginAt: true } }),
      prisma.childProfile.findUnique({ where: { userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.subscription.findUnique({ where: { userId } }),
    ]);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    return { user, childProfile, preferences, subscription };
  },

  async updateProfile(userId: string, data: UpdateProfileInput) {
    if (data.email) {
      const exists = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id: userId } },
      });
      if (exists) throw Object.assign(new Error('Email already in use'), { status: 409 });
    }
    const user = await prisma.user.update({ where: { id: userId }, data, select: { id: true, email: true, name: true, role: true, subscriptionStatus: true, createdAt: true, lastLoginAt: true } });
    return { user };
  },

  async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw Object.assign(new Error('Account uses Google Sign-In, no password set'), { status: 400 });
    }
    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) throw Object.assign(new Error('Current password incorrect'), { status: 401 });

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password updated successfully' };
  },

  async upsertChildProfile(userId: string, data: ChildProfileInput) {
    const profile = await prisma.childProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    return { childProfile: profile };
  },

  async exportData(userId: string) {
    const [user, childProfile, subscription, progress, journal, milestones, routine, askGad] =
      await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, subscriptionStatus: true, createdAt: true, lastLoginAt: true } }),
        prisma.childProfile.findUnique({ where: { userId } }),
        prisma.subscription.findUnique({ where: { userId } }),
        prisma.userProgress.findMany({ where: { userId } }),
        prisma.journalEntry.findMany({ where: { userId } }),
        prisma.milestoneReport.findMany({ where: { userId } }),
        prisma.routineEntry.findMany({ where: { userId } }),
        prisma.askGadSubmission.findMany({ where: { userId }, select: { id: true, questionText: true, status: true, createdAt: true } }),
      ]);
    return { user, childProfile, subscription, progress, journal, milestones, routine, askGad, exportedAt: new Date() };
  },

  async deleteAccount(userId: string) {
    // GDPR Article 17 — Right to Erasure.
    // Hard-delete the user and all associated personal data.
    //
    // Most child tables have onDelete: Cascade in the schema, so deleting
    // the user row will automatically remove:
    //   child_profiles, user_preferences, subscriptions, payment_transactions,
    //   manual_payments, question_credits, user_progress, video_bookmarks,
    //   video_notes, routine_entries, milestone_reports, module_feedback,
    //   ask_gad_submissions, journal_entries, user_announcement_dismissals,
    //   user_roles, user_permissions
    //
    // Two tables need manual handling before the delete:
    //   - donations.userId is nullable (no cascade) → set to null so donation
    //     financial records are preserved for accounting purposes.
    //   - visitor_sessions.userId is SetNull (handled by DB automatically).

    await prisma.$transaction(async (tx) => {
      // 1. Detach donations — preserve payment records but remove personal link
      await tx.donation.updateMany({
        where: { userId },
        data:  { userId: null },
      });

      // 2. Log the deletion before the user row disappears
      await tx.activityLog.create({
        data: {
          action:  'account.deleted',
          details: `GDPR Article 17 — hard delete requested by user ${userId} at ${new Date().toISOString()}`,
        },
      });

      // 3. Delete the user — DB cascades handle all child rows automatically
      await tx.user.delete({ where: { id: userId } });
    });

    return { message: 'Your account and all personal data have been permanently deleted.' };
  },

  async listUsers(query: UserListQuery) {
    const skip = (query.page - 1) * query.limit;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.subscriptionStatus = 'ACTIVE';
    if (query.status === 'free') where.subscriptionStatus = 'NONE';
    if (query.status === 'cancelled') where.subscriptionStatus = 'CANCELLED';
    if (query.status === 'expired') where.subscriptionStatus = 'EXPIRED';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, role: true,
          subscriptionStatus: true, createdAt: true, lastLoginAt: true,
          childProfile: { select: { childName: true, ageMonths: true } },
          subscription: { select: { plan: true, platform: true, status: true, periodEnd: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  },

  async getUserById(id: string) {
    const [user, activityLogs, progressDetails, askGadSubs, donations] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true, email: true, name: true, role: true, avatarUrl: true, pushToken: true,
          subscriptionStatus: true, createdAt: true, lastLoginAt: true, updatedAt: true,
          childProfile: true,
          subscription: true,
          preferences: true,
          _count: { select: { progress: true, journalEntries: true, askGadSubmissions: true, donations: true } },
        },
      }),
      prisma.activityLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, action: true, details: true, ipAddress: true, userAgent: true, createdAt: true },
      }),
      prisma.userProgress.findMany({
        where: { userId: id },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: { module: { select: { id: true, code: true, title: true } } },
      }),
      prisma.askGadSubmission.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, questionText: true, status: true, createdAt: true, responseText: true },
      }),
      prisma.donation.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, amountUsd: true, status: true, paymentMethod: true, campaign: true, createdAt: true },
      }),
    ]);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    return { user, activityLogs, progressDetails, askGadSubs, donations };
  },
};

export const EmailService = {
  async sendToUser(userId: string, subject: string, message: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    // Send via Resend (best-effort — log only, never throws)
    await sendAdminEmail(user.email, user.name ?? '', subject, message);

    await prisma.activityLog.create({
      data: { userId, adminId, action: 'admin.email.sent', details: `Subject: ${subject}` },
    });

    return { sent: true, to: user.email };
  },

  async exportUsersCSV(params: any) {
    const users = await prisma.user.findMany({
      where: params.search ? {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { email: { contains: params.search, mode: 'insensitive' } },
        ],
      } : {},
      select: {
        id: true, email: true, name: true, role: true,
        subscriptionStatus: true, createdAt: true, lastLoginAt: true,
        childProfile: { select: { childName: true, ageMonths: true } },
        subscription: { select: { plan: true, platform: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const header = 'ID,Name,Email,Status,Plan,Platform,Child Name,Age (months),Joined\n';
    const rows = users.map(u =>
      [u.id, u.name, u.email, u.subscriptionStatus,
       u.subscription?.plan ?? '', u.subscription?.platform ?? '',
       u.childProfile?.childName ?? '', u.childProfile?.ageMonths ?? '',
       u.createdAt.toISOString().split('T')[0]
      ].map(v => `"${v}"`).join(',')
    ).join('\n');

    return header + rows;
  },
};
