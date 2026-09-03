import { prisma } from '../lib/prisma.js';

export const BookDownloadService = {
  /**
   * Record a book download for a logged-in user.
   */
  async track(userId: string, bookSlug: string, platform: string, ip?: string, userAgent?: string) {
    return prisma.bookDownload.create({
      data: { userId, bookSlug, platform, ip: ip ?? null, userAgent: userAgent ?? null },
    });
  },

  /**
   * Admin: overall stats + paginated list of downloads.
   */
  async getStats(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [totalDownloads, uniqueUsers, rows, total] = await Promise.all([
      prisma.bookDownload.count(),
      prisma.bookDownload.groupBy({ by: ['userId'], _count: true }).then(r => r.length),
      prisma.bookDownload.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
      prisma.bookDownload.count(),
    ]);

    // Downloads per day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const daily = await prisma.bookDownload.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    });

    // Platform breakdown
    const byPlatform = await prisma.bookDownload.groupBy({
      by: ['platform'],
      _count: true,
    });

    return {
      stats: {
        totalDownloads,
        uniqueUsers,
        byPlatform: byPlatform.map(r => ({ platform: r.platform, count: r._count })),
      },
      downloads: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },
};
