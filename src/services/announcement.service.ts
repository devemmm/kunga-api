import { prisma } from '../lib/prisma.js';
import { sendExpoPush, buildMessages } from '../lib/expo-push.js';
import { sendAnnouncementEmail } from '../lib/email.js';
import { getLang, localizeAnnouncement } from '../lib/i18n.js';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from '../models/index.js';

export const AnnouncementService = {
  async getActive(userId: string, req?: any) {
    const lang = req ? getLang(req) : 'en';
    const [user, dismissed] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      prisma.userAnnouncementDismissal.findMany({
        where: { userId },
        select: { announcementId: true },
      }),
    ]);
    const dismissedIds = dismissed.map(d => d.announcementId);
    const anns = await prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        id: { notIn: dismissedIds },
        ...(user ? { publishedAt: { gte: user.createdAt } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
    });
    if (lang === 'en') return anns;
    return anns.map(a => localizeAnnouncement(a, lang));
  },

  async getActiveBanner(userId: string, req?: any) {
    const lang = req ? getLang(req) : 'en';
    const [user, dismissed] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      prisma.userAnnouncementDismissal.findMany({
        where: { userId },
        select: { announcementId: true },
      }),
    ]);
    const dismissedIds = dismissed.map(d => d.announcementId);
    const ann = await prisma.announcement.findFirst({
      where: {
        status: 'PUBLISHED',
        id: { notIn: dismissedIds },
        ...(user ? { publishedAt: { gte: user.createdAt } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
    });
    if (!ann || lang === 'en') return ann;
    return localizeAnnouncement(ann, lang);
  },

  async dismiss(announcementId: string, userId: string) {
    await prisma.userAnnouncementDismissal.upsert({
      where: { userId_announcementId: { userId, announcementId } },
      update: {},
      create: { userId, announcementId },
    });
    return { dismissed: true };
  },

  async list() {
    return prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { dismissals: true } } },
    });
  },

  async create(data: CreateAnnouncementInput) {
    const announcement = await prisma.announcement.create({ data });
    return { announcement };
  },

  async update(id: string, data: UpdateAnnouncementInput) {
    const announcement = await prisma.announcement.update({ where: { id }, data });
    return { announcement };
  },

  async delete(id: string) {
    await prisma.announcement.delete({ where: { id } });
    return { message: 'Announcement deleted' };
  },

  async publish(id: string) {
    const announcement = await prisma.announcement.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await AnnouncementService._sendPushNotification(announcement);
    await AnnouncementService._sendEmailNotification(announcement);
    return { announcement, sent: true };
  },

  async getStats() {
    const [total, published, draft, totalViews, totalDismissals] = await Promise.all([
      prisma.announcement.count(),
      prisma.announcement.count({ where: { status: 'PUBLISHED' } }),
      prisma.announcement.count({ where: { status: 'DRAFT' } }),
      prisma.announcement.aggregate({ _sum: { pushSentCount: true, bannerViewCount: true } }),
      prisma.userAnnouncementDismissal.count(),
    ]);

    const withStats = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { dismissals: true } } },
    });

    return {
      total,
      published,
      draft,
      totalPushSent: totalViews._sum.pushSentCount ?? 0,
      totalBannerViews: totalViews._sum.bannerViewCount ?? 0,
      totalDismissals,
      announcements: withStats.map(a => ({
        ...a,
        seenCount: a._count.dismissals,
        openRate: a.pushSentCount > 0
          ? Math.round((a._count.dismissals / a.pushSentCount) * 100)
          : 0,
      })),
    };
  },

  async getViewers(announcementId: string) {
    const dismissals = await prisma.userAnnouncementDismissal.findMany({
      where: { announcementId },
      include: {
        user: {
          select: {
            id: true, name: true, email: true,
            subscriptionStatus: true, createdAt: true,
          },
        },
      },
      orderBy: { dismissedAt: 'desc' },
      take: 100,
    });
    return { viewers: dismissals.map(d => ({ ...d.user, viewedAt: d.dismissedAt })) };
  },

  async _sendPushNotification(announcement: any) {
    // Build audience filter based on targetAudience setting
    const where: any = { pushToken: { not: null } };
    if (announcement.targetAudience === 'ACTIVE_ONLY') {
      where.subscriptionStatus = 'ACTIVE';
    } else if (announcement.targetAudience === 'ALL_SUBSCRIBERS') {
      where.subscriptionStatus = { in: ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'] };
    }
    // SPEECH_MODULE_USERS: users who have completed at least one speech module
    if (announcement.targetAudience === 'SPEECH_MODULE_USERS') {
      where.progress = { some: { completed: true, module: { code: { contains: 'SPEECH' } } } };
    }

    const users = await prisma.user.findMany({ where, select: { pushToken: true } });
    const tokens = users.map((u: any) => u.pushToken).filter(Boolean) as string[];
    if (!tokens.length) return { sent: 0 };

    // Map announcement type to an appropriate emoji prefix
    const typeEmoji: Record<string, string> = {
      INFO: 'ℹ️', WARNING: '⚠️', SUCCESS: '✅', URGENT: '🚨',
    };
    const emoji = typeEmoji[announcement.type] ?? '📣';

    await sendExpoPush(buildMessages(tokens, {
      title:    `${emoji} ${announcement.title}`,
      body:     announcement.body,
      sound:    'default',
      priority: announcement.type === 'URGENT' ? 'high' : 'normal',
      data:     {
        screen:         'Announcements',
        announcementId: announcement.id,
        deepLink:       announcement.deepLink ?? null,
      },
    }));

    return { sent: tokens.length };
  },

  /** Email URGENT announcements to users who have email notifications enabled. */
  async _sendEmailNotification(announcement: any) {
    const users = await prisma.user.findMany({
      where: { preferences: { is: { announcementsOn: true } } },
      select: { email: true, name: true },
    });
    for (const user of users) {
      sendAnnouncementEmail(user.email, user.name ?? '', announcement.title, announcement.body).catch(() => {});
    }
    return { sent: users.length };
  },
};
