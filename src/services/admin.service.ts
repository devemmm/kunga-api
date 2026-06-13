import { prisma } from '../lib/prisma.js';
import { parseUserAgent } from '../lib/ua.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse OS/device from User-Agent string */
function parseOs(ua: string): string | null {
  if (!ua) return null;
  if (/iPhone|iPad/i.test(ua))    return 'iOS';
  if (/Android/i.test(ua))        return 'Android';
  if (/Windows/i.test(ua))        return 'Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua))          return 'Linux';
  return 'Unknown';
}

const _CACHE_TTL = 24 * 60 * 60 * 1000;
const _PRIVATE   = /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|::1|localhost)/;

interface CountryInfo { country: string | null; countryCode: string | null; }
const _ipCache2 = new Map<string, CountryInfo & { ts: number }>();

async function lookupCountry(ip: string | null): Promise<CountryInfo> {
  if (!ip || _PRIVATE.test(ip)) return { country: null, countryCode: null };
  const hit = _ipCache2.get(ip);
  if (hit && Date.now() - hit.ts < _CACHE_TTL) return { country: hit.country, countryCode: hit.countryCode };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res  = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode`, { signal: ctrl.signal });
    clearTimeout(t);
    const data = await res.json() as any;
    const info = { country: data?.country ?? null, countryCode: data?.countryCode ?? null };
    _ipCache2.set(ip, { ...info, ts: Date.now() });
    return info;
  } catch {
    _ipCache2.set(ip, { country: null, countryCode: null, ts: Date.now() });
    return { country: null, countryCode: null };
  }
}

export const AdminService = {
  async getDashboard() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, activeSubscribers, weeklySignups,
      gadQueue, gadPending,
      totalDonations, weeklyDonations, scholarships,
      churnCount, mrrData,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionStatus: { in: ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'] } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.askGadSubmission.count(),
      prisma.askGadSubmission.count({ where: { status: "SUBMITTED" } }),
      prisma.donation.aggregate({ where: { status: 'COMPLETED' }, _sum: { amountUsd: true } }),
      prisma.donation.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: weekAgo } }, _sum: { amountUsd: true } }),
      prisma.scholarshipGrant.count({ where: { active: true } }),
      prisma.subscription.count({ where: { status: 'CANCELLED' } }),
      prisma.subscription.groupBy({ by: ['plan'], where: { status: 'ACTIVE' }, _count: true }),
    ]);

    const monthlyRevenue = mrrData.reduce((acc, row) => {
      const price = row.plan === 'annual' ? 140 / 12 : 14;
      return acc + price * row._count;
    }, 0);

    const churnRate = activeSubscribers > 0 ? ((churnCount / (activeSubscribers + churnCount)) * 100).toFixed(1) : '0';

    return {
      totalUsers,
      activeSubscribers,
      weeklySignups,
      mrr: Math.round(monthlyRevenue),
      churnRate: parseFloat(churnRate),
      gadQueue,
      gadPending,
      donations: totalDonations._sum.amountUsd ?? 0,
      donationsWeek: weeklyDonations._sum.amountUsd ?? 0,
      scholarships,
    };
  },

  async getActivityLog(page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        skip, take: limit, orderBy: { createdAt: 'desc' },
      }),
      prisma.activityLog.count(),
    ]);

    // Enrich with user names (single batch query)
    const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))] as string[];
    const users   = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    // Enrich with country (unique IPs only, cached)
    const uniqueIps = [...new Set(logs.map(l => l.ipAddress).filter(Boolean))] as string[];
    const geoResults = await Promise.all(uniqueIps.map(lookupCountry));
    const ipMap      = Object.fromEntries(uniqueIps.map((ip, i) => [ip, geoResults[i]]));

    return {
      logs: logs.map(l => ({
        ...l,
        userName:    l.userId ? (userMap[l.userId]?.name      ?? null) : null,
        userEmail:   l.userId ? (userMap[l.userId]?.email     ?? null) : null,
        userAvatar:  l.userId ? (userMap[l.userId]?.avatarUrl ?? null) : null,
        device:      parseOs(l.userAgent ?? ''),
        country:     l.ipAddress ? (ipMap[l.ipAddress]?.country     ?? null) : null,
        countryCode: l.ipAddress ? (ipMap[l.ipAddress]?.countryCode ?? null) : null,
      })),
      total, page, limit,
    };
  },

  async getAuditLog(page = 1, limit = 30, filters?: { module?: string; action?: string; search?: string }) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters?.module) where.module = filters.module;
    if (filters?.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters?.search) {
      where.OR = [
        { action: { contains: filters.search, mode: 'insensitive' } },
        { module: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);

    const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))] as string[];
    const users   = await prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    return {
      logs: logs.map(l => {
        const ua = parseUserAgent(l.userAgent ?? '');
        return {
          ...l,
          userName:   l.userId ? (userMap[l.userId]?.name      ?? null) : null,
          userEmail:  l.userId ? (userMap[l.userId]?.email     ?? null) : null,
          userAvatar: l.userId ? (userMap[l.userId]?.avatarUrl ?? null) : null,
          browser:    ua.browser,
          device:     ua.deviceType,
        };
      }),
      total, page, limit,
    };
  },

  async getModuleStats() {
    const modules = await prisma.module.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true, code: true, title: true,
        _count: { select: { progress: { where: { completed: true } } } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const totalSubscribers = await prisma.user.count({
      where: { subscriptionStatus: { in: ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'] } },
    });

    return modules.map(m => ({
      code: m.code,
      title: m.title,
      completions: m._count.progress,
      completionRate: totalSubscribers > 0
        ? Math.round((m._count.progress / totalSubscribers) * 100)
        : 0,
    }));
  },

  async getPaymentStats() {
    const platformStats = await prisma.subscription.groupBy({
      by: ['platform'],
      where: { status: 'ACTIVE' },
      _count: true,
    });

    const total = platformStats.reduce((acc, r) => acc + r._count, 0);
    return platformStats.map(r => ({
      platform: r.platform,
      count: r._count,
      pct: total > 0 ? Math.round((r._count / total) * 100) : 0,
    }));
  },

  async getSignupTrend(weeks = 8) {
    const trend = [];
    const now = new Date();
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7 - 6);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const count = await prisma.user.count({ where: { createdAt: { gte: start, lte: end } } });
      trend.push({ week: weeks - i, start: start.toISOString(), end: end.toISOString(), count });
    }
    return { trend };
  },

  async getLiveUsers(limit = 6) {
    const users = await prisma.user.findMany({
      where: { lastLoginAt: { not: null } },
      orderBy: { lastLoginAt: 'desc' },
      take: limit,
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        lastLoginAt: true, subscriptionStatus: true, createdAt: true,
        subscription: { select: { plan: true, platform: true, status: true, periodEnd: true } },
        childProfile: { select: { childName: true, ageMonths: true } },
      },
    });

    // Fetch most-recent login log per user to get IP + user-agent
    const ids = users.map(u => u.id);
    const logs = await prisma.activityLog.findMany({
      where: { userId: { in: ids }, action: 'user.login' },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, ipAddress: true, userAgent: true, createdAt: true },
    });
    // keep only the first (most recent) log per user
    const logMap: Record<string, { ipAddress: string | null; userAgent: string | null }> = {};
    for (const l of logs) {
      if (l.userId && !logMap[l.userId]) logMap[l.userId] = { ipAddress: l.ipAddress, userAgent: l.userAgent };
    }

    return {
      users: users.map(u => ({
        ...u,
        lastLoginIp: logMap[u.id]?.ipAddress ?? null,
        lastLoginOs: parseOs(logMap[u.id]?.userAgent ?? ''),
      })),
    };
  },

  async getSigninTrend(weeks = 8) {
    const trend = [];
    const now = new Date();
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7 - 6);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      // Count unique users who had any activity (app usage) this week
      const active = await prisma.activityLog.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: start, lte: end }, userId: { not: null } },
      });
      trend.push({ week: weeks - i, start: start.toISOString(), end: end.toISOString(), count: active.length });
    }
    return { trend };
  },
};

export const AnalyticsService = {
  async getOverview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [dau, mau, avgSessionMin] = await Promise.all([
      prisma.activityLog.groupBy({ by: ['userId'], where: { createdAt: { gte: today }, userId: { not: null } } }).then(r => r.length),
      prisma.user.count({ where: { subscriptionStatus: { in: ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'] } } }),
      Promise.resolve(18), // TODO: calculate from session logs
    ]);

    const stickiness = mau > 0 ? ((dau / mau) * 100).toFixed(1) : '0';

    return { dau, mau, stickiness: parseFloat(stickiness), avgSessionMin };
  },

  async getFunnel() {
    const [totalOpens, registrationsStarted, profilesCompleted, paywallViewed, subscribed] =
      await Promise.all([
        prisma.activityLog.count({ where: { action: 'app.open' } }),
        prisma.user.count(),
        prisma.childProfile.count(),
        prisma.activityLog.count({ where: { action: 'paywall.view' } }),
        prisma.user.count({ where: { subscriptionStatus: { in: ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'] } } }),
      ]);

    const base = totalOpens || 1;
    return [
      { step: 'App Opened', count: totalOpens, pct: 100 },
      { step: 'Registration Started', count: registrationsStarted, pct: +((registrationsStarted / base) * 100).toFixed(1) },
      { step: 'Child Profile Complete', count: profilesCompleted, pct: +((profilesCompleted / base) * 100).toFixed(1) },
      { step: 'Paywall Viewed', count: paywallViewed, pct: +((paywallViewed / base) * 100).toFixed(1) },
      { step: 'Subscription Started', count: subscribed, pct: +((subscribed / base) * 100).toFixed(1) },
    ];
  },

  async getRetention() {
    const cohorts = [];
    const now = new Date();

    for (let i = 4; i >= 0; i--) {
      const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      // Cap cohort end at now so current-month cohort uses real users
      const cohortEndRaw = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const cohortEnd = cohortEndRaw < now ? cohortEndRaw : now;

      const cohortUsers = await prisma.user.findMany({
        where: { createdAt: { gte: cohortStart, lte: cohortEnd } },
        select: { id: true, createdAt: true },
      });

      const userCount = cohortUsers.length;
      const label = cohortStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (userCount === 0) {
        cohorts.push({ cohort: label, users: 0, d1: null, d7: null, d14: null, d30: null });
        continue;
      }

      // For a given day-window, return the % of eligible users who had any
      // activityLog entry after joining and within that many days.
      // Returns null when no users have reached the window yet.
      const calcRetention = async (days: number): Promise<number | null> => {
        const eligible = cohortUsers.filter(u => {
          const windowEnd = new Date(u.createdAt.getTime() + days * 24 * 60 * 60 * 1000);
          return windowEnd <= now;
        });
        if (eligible.length === 0) return null;

        let retained = 0;
        await Promise.all(eligible.map(async u => {
          const windowEnd = new Date(u.createdAt.getTime() + days * 24 * 60 * 60 * 1000);
          const count = await prisma.activityLog.count({
            where: {
              userId: u.id,
              createdAt: { gt: u.createdAt, lte: windowEnd },
            },
          });
          if (count > 0) retained++;
        }));

        return Math.round((retained / eligible.length) * 100);
      };

      const [d1, d7, d14, d30] = await Promise.all([
        calcRetention(1),
        calcRetention(7),
        calcRetention(14),
        calcRetention(30),
      ]);

      cohorts.push({ cohort: label, users: userCount, d1, d7, d14, d30 });
    }

    return { cohorts };
  },

  async getMobileMoney() {
    // Group active mobile money subscriptions by provider across ALL platforms
    // (not restricted to flutterwave — covers manual activations too).
    const providers = await prisma.subscription.groupBy({
      by: ['mobileMoneyProvider'],
      where: { mobileMoneyProvider: { not: null }, status: 'ACTIVE' },
      _count: { _all: true },
    });
    return { providers };
  },
};

// ─── PRICING SERVICE ─────────────────────────────────────────────────────────

const DEFAULT_PRICING: Record<string, { value: string; description: string }> = {
  price_monthly_usd:   { value: '14.00',  description: 'Monthly subscription price (USD)' },
  price_annual_usd:    { value: '140.00', description: 'Annual subscription price (USD)' },
  price_monthly_local: { value: '',       description: 'Monthly price in local currency (optional display label)' },
  price_annual_local:  { value: '',       description: 'Annual price in local currency (optional display label)' },
  currency_local:      { value: 'RWF',    description: 'Local currency code (for display only)' },
  local_country:       { value: 'KE',     description: 'Primary local market country code (ISO 3166-1 alpha-2)' },
  trial_days:          { value: '7',      description: 'Free trial duration in days' },
  stripe_monthly_price_id: { value: '', description: 'Stripe Price ID for monthly plan' },
  stripe_annual_price_id:  { value: '', description: 'Stripe Price ID for annual plan' },
  // ── Ask Dr. Gad ──────────────────────────────────────────────────────────────
  askgad_monthly_limit:    { value: '2',    description: 'Max free questions per user per calendar month' },
  askgad_credit_price:     { value: '5.00', description: 'Price (USD) for 1 Question Credit (1 extra question)' },
  askgad_credits_per_pack: { value: '1',    description: 'Extra questions unlocked per credit purchase' },
  // ── App versions ─────────────────────────────────────────────────────────────
  app_min_version:         { value: '1.0.0', description: 'Minimum app version — users below this are forced to update' },
  app_latest_version:      { value: '1.0.0', description: 'Latest app version — users below this see an optional update prompt' },
  app_store_url_ios:       { value: 'https://apps.apple.com/app/kunga-basics/id000000000', description: 'iOS App Store URL' },
  app_store_url_android:   { value: 'https://play.google.com/store/apps/details?id=com.kungabasics.app', description: 'Android Play Store URL' },
  // ── WhatsApp contact ─────────────────────────────────────────────────────────
  whatsapp_enabled: { value: 'true',          description: 'Show WhatsApp contact button in the mobile app (true/false)' },
  whatsapp_number:  { value: '+250788596281', description: 'WhatsApp phone number (E.164 format, e.g. +250788596281)' },
};

export const PricingService = {
  /** Seed missing default pricing/config rows (app_config table is created by Prisma migrations). */
  async ensureTable() {
    // Seed missing defaults
    for (const [key, { value, description }] of Object.entries(DEFAULT_PRICING)) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO app_config (key, value, description) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        key, value, description,
      );
    }
  },

  async getAll() {
    await PricingService.ensureTable();
    const rows = await prisma.$queryRaw<Array<{ key: string; value: string; description: string; updated_at: Date }>>`
      SELECT key, value, description, updated_at FROM app_config ORDER BY key
    `;
    // Merge defaults with DB values so new keys always appear
    const map: Record<string, { value: string; description: string; updatedAt: Date | null }> = {};
    for (const [k, d] of Object.entries(DEFAULT_PRICING)) {
      map[k] = { value: d.value, description: d.description, updatedAt: null };
    }
    for (const r of rows) {
      map[r.key] = { value: r.value, description: r.description, updatedAt: r.updated_at };
    }
    return { config: Object.entries(map).map(([key, v]) => ({ key, ...v })) };
  },

  async set(key: string, value: string) {
    await PricingService.ensureTable();
    if (!Object.keys(DEFAULT_PRICING).includes(key)) {
      throw Object.assign(new Error(`Unknown config key: ${key}`), { status: 400 });
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO app_config (key, value, description) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      key, value, DEFAULT_PRICING[key]?.description ?? '',
    );
    return { key, value };
  },

  /** Convenience: get a single value by key, falling back to the default. */
  async get(key: string): Promise<string> {
    await PricingService.ensureTable();
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM app_config WHERE key = ${key}
    `;
    return rows[0]?.value ?? DEFAULT_PRICING[key]?.value ?? '';
  },

  /** Helper used by MRR calculation — returns numeric pricing. */
  async getPrices() {
    const [monthly, annual] = await Promise.all([
      PricingService.get('price_monthly_usd'),
      PricingService.get('price_annual_usd'),
    ]);
    return { monthly: parseFloat(monthly) || 14, annual: parseFloat(annual) || 140 };
  },
};

export const NotificationService = {
  async getAdminNotifications() {
    const [gadPending, recentSignups, failedPayments, recentDonations] = await Promise.all([
      prisma.askGadSubmission.count({ where: { status: "SUBMITTED" } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 24*60*60*1000) } } }),
      prisma.subscription.count({ where: { status: 'NONE', platform: 'flutterwave', updatedAt: { gte: new Date(Date.now() - 7*24*60*60*1000) } } }),
      prisma.donation.count({ where: { status: 'PENDING', createdAt: { gte: new Date(Date.now() - 24*60*60*1000) } } }),
    ]);

    const notifications = [];
    if (gadPending > 0) notifications.push({ id: 'gad', type: 'warning', icon: '🎤', title: `${gadPending} Dr. Gad submission${gadPending > 1 ? 's' : ''} awaiting response`, time: 'now', link: 'askgad' });
    if (recentSignups > 0) notifications.push({ id: 'signups', type: 'success', icon: '👤', title: `${recentSignups} new user${recentSignups > 1 ? 's' : ''} registered today`, time: 'today', link: 'users' });
    if (failedPayments > 0) notifications.push({ id: 'payments', type: 'error', icon: '💳', title: `${failedPayments} Mobile Money payment${failedPayments > 1 ? 's' : ''} need manual activation`, time: 'this week', link: 'mobilemoney' });
    if (recentDonations > 0) notifications.push({ id: 'donations', type: 'info', icon: '💝', title: `${recentDonations} pending donation${recentDonations > 1 ? 's' : ''} to process`, time: 'today', link: 'donations' });

    return { notifications, unread: notifications.length };
  },
};
