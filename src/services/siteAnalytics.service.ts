import { prisma } from '../lib/prisma.js';
import { lookupGeo, classifySource, getClientIp } from '../lib/geo.js';
import { parseUserAgent } from '../lib/ua.js';

const VALID_SOURCES = ['portal', 'admin', 'mobile'];
// A session counts as "online now" if it has been seen in the last N minutes.
const REALTIME_WINDOW_MIN = 5;

export interface TrackPayload {
  sessionId: string;
  source?: string;
  eventType?: string;
  path?: string;
  label?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  language?: string;
  screenWidth?: number;
  screenHeight?: number;
  appVersion?: string;
  meta?: Record<string, unknown>;
}

function parseDateRange(query: any) {
  const to = query?.to ? new Date(query.to) : new Date();
  const from = query?.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000); // default: last 30 days
  // Make `to` inclusive of the whole day if only a date (no time) was given
  if (query?.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function sourceFilter(source?: string) {
  if (source && VALID_SOURCES.includes(source)) return { source };
  return {};
}

export const SiteAnalyticsService = {
  /**
   * Record a tracking beacon: upsert the visitor session (geo/device info
   * resolved on first sight) and append an analytics event.
   */
  async track(req: any, payload: TrackPayload) {
    const { sessionId } = payload;
    if (!sessionId) throw Object.assign(new Error('sessionId is required'), { status: 400 });

    const source = VALID_SOURCES.includes(payload.source ?? '') ? payload.source! : 'portal';
    const eventType = payload.eventType || 'pageview';
    const path = payload.path ?? null;

    // Soft-auth: if a valid bearer token is present, attach the user id.
    let userId: string | null = null;
    try {
      await req.jwtVerify();
      userId = (req.user as any)?.sub ?? null;
    } catch { /* anonymous visitor — ignore */ }

    const existing = await prisma.visitorSession.findUnique({ where: { sessionId } });

    if (!existing) {
      const ip = getClientIp(req);
      const geo = lookupGeo(ip);
      const ua = parseUserAgent(req.headers?.['user-agent']);

      await prisma.visitorSession.create({
        data: {
          sessionId,
          userId,
          source,
          entryPath:   path,
          exitPath:    path,
          referrer:    payload.referrer ?? null,
          utmSource:   payload.utmSource ?? null,
          utmMedium:   payload.utmMedium ?? null,
          utmCampaign: payload.utmCampaign ?? null,
          ip,
          country:     geo.country,
          countryCode: geo.countryCode,
          region:      geo.region,
          city:        geo.city,
          timezone:    geo.timezone,
          language:    payload.language ?? null,
          browser:        ua.browser,
          browserVersion: ua.browserVersion,
          os:             ua.os,
          osVersion:      ua.osVersion,
          deviceType:     ua.deviceType,
          screenWidth:    payload.screenWidth ?? null,
          screenHeight:   payload.screenHeight ?? null,
          appVersion:     payload.appVersion ?? null,
          pageViews:   eventType === 'pageview' ? 1 : 0,
          isBounce:    true,
        },
      });
    } else {
      await prisma.visitorSession.update({
        where: { sessionId },
        data: {
          lastSeenAt: new Date(),
          exitPath:   path ?? existing.exitPath,
          userId:     userId ?? existing.userId,
          ...(eventType === 'pageview'
            ? { pageViews: { increment: 1 }, isBounce: existing.pageViews + 1 <= 1 }
            : {}),
        },
      });
    }

    await prisma.analyticsEvent.create({
      data: {
        sessionId,
        userId,
        source,
        eventType,
        path,
        label: payload.label ?? null,
        meta:  (payload.meta as any) ?? undefined,
      },
    });

    return { ok: true };
  },

  /** High-level visitor/session metrics for the date range + source filter */
  async getOverview(query: any) {
    const { from, to } = parseDateRange(query);
    const where = { ...sourceFilter(query?.source), firstSeenAt: { gte: from, lte: to } };

    const [totalSessions, uniqueVisitors, returning, bounces, durations, pageViewsAgg, activeNow] = await Promise.all([
      prisma.visitorSession.count({ where }),
      prisma.visitorSession.groupBy({ by: ['ip'], where: { ...where, ip: { not: null } } }).then(r => r.length),
      prisma.visitorSession.count({ where: { ...where, userId: { not: null } } }),
      prisma.visitorSession.count({ where: { ...where, isBounce: true } }),
      prisma.visitorSession.findMany({ where, select: { firstSeenAt: true, lastSeenAt: true } }),
      prisma.visitorSession.aggregate({ where, _sum: { pageViews: true } }),
      prisma.visitorSession.count({
        where: {
          ...sourceFilter(query?.source),
          lastSeenAt: { gte: new Date(Date.now() - REALTIME_WINDOW_MIN * 60 * 1000) },
        },
      }),
    ]);

    const totalDurationSec = durations.reduce((acc, s) => acc + Math.max(0, (s.lastSeenAt.getTime() - s.firstSeenAt.getTime()) / 1000), 0);
    const avgSessionDurationSec = totalSessions > 0 ? Math.round(totalDurationSec / totalSessions) : 0;
    const bounceRate = totalSessions > 0 ? Math.round((bounces / totalSessions) * 1000) / 10 : 0;

    return {
      totalVisitors:  totalSessions,
      uniqueVisitors,
      returningVisitors: returning,
      activeNow,
      pageViews: pageViewsAgg._sum.pageViews ?? 0,
      avgSessionDurationSec,
      bounceRate,
      range: { from, to },
    };
  },

  /** Visitors grouped by country / continent / city */
  async getGeo(query: any) {
    const { from, to } = parseDateRange(query);
    const where = { ...sourceFilter(query?.source), firstSeenAt: { gte: from, lte: to } };

    const sessions = await prisma.visitorSession.findMany({
      where,
      select: { country: true, countryCode: true, city: true, region: true },
    });

    const byCountry = new Map<string, { country: string; countryCode: string | null; count: number }>();
    const byCity = new Map<string, { city: string; country: string | null; count: number }>();
    let unknown = 0;

    for (const s of sessions) {
      if (!s.country) { unknown++; continue; }
      const ck = s.countryCode ?? s.country;
      byCountry.set(ck, {
        country: s.country, countryCode: s.countryCode,
        count: (byCountry.get(ck)?.count ?? 0) + 1,
      });
      if (s.city) {
        const cityKey = `${s.city}|${ck}`;
        byCity.set(cityKey, {
          city: s.city, country: s.country,
          count: (byCity.get(cityKey)?.count ?? 0) + 1,
        });
      }
    }

    const { CONTINENT_BY_COUNTRY } = await import('../lib/geo.js');
    const byContinent = new Map<string, number>();
    for (const [code, v] of byCountry) {
      const cont = CONTINENT_BY_COUNTRY[code] ?? 'Other';
      byContinent.set(cont, (byContinent.get(cont) ?? 0) + v.count);
    }

    return {
      countries: [...byCountry.values()].sort((a, b) => b.count - a.count),
      cities:    [...byCity.values()].sort((a, b) => b.count - a.count).slice(0, 25),
      continents: [...byContinent.entries()].map(([continent, count]) => ({ continent, count })).sort((a, b) => b.count - a.count),
      unknown,
    };
  },

  /** Browser / OS / device-type breakdown */
  async getDevices(query: any) {
    const { from, to } = parseDateRange(query);
    const where = { ...sourceFilter(query?.source), firstSeenAt: { gte: from, lte: to } };

    const sessions = await prisma.visitorSession.findMany({
      where,
      select: { browser: true, os: true, deviceType: true, screenWidth: true, screenHeight: true, appVersion: true },
    });

    const tally = (key: 'browser' | 'os' | 'deviceType' | 'appVersion') => {
      const m = new Map<string, number>();
      for (const s of sessions) {
        const v = (s[key] as string | null) ?? 'Unknown';
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };

    const resolutions = new Map<string, number>();
    for (const s of sessions) {
      if (s.screenWidth && s.screenHeight) {
        const key = `${s.screenWidth}x${s.screenHeight}`;
        resolutions.set(key, (resolutions.get(key) ?? 0) + 1);
      }
    }

    return {
      browsers:    tally('browser'),
      os:          tally('os'),
      deviceTypes: tally('deviceType'),
      appVersions: tally('appVersion').filter(r => r.name !== 'Unknown'),
      resolutions: [...resolutions.entries()].map(([resolution, count]) => ({ resolution, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    };
  },

  /** Most-visited pages */
  async getPages(query: any) {
    const { from, to } = parseDateRange(query);
    const where = {
      ...sourceFilter(query?.source),
      eventType: 'pageview',
      createdAt: { gte: from, lte: to },
      path: { not: null },
    };

    const grouped = await prisma.analyticsEvent.groupBy({
      by: ['path'],
      where,
      _count: true,
    });

    const pages = grouped
      .map(g => ({ path: g.path, views: typeof g._count === 'number' ? g._count : (g._count as any)?.path ?? 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 25);

    return { pages };
  },

  /** Traffic source breakdown (Direct / Search / Social / Referral / Campaign) */
  async getSources(query: any) {
    const { from, to } = parseDateRange(query);
    const where = { ...sourceFilter(query?.source), firstSeenAt: { gte: from, lte: to } };

    const sessions = await prisma.visitorSession.findMany({
      where,
      select: { referrer: true, utmSource: true },
    });

    const m = new Map<string, number>();
    for (const s of sessions) {
      const cls = classifySource(s.referrer, s.utmSource);
      m.set(cls, (m.get(cls) ?? 0) + 1);
    }
    return { sources: [...m.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count) };
  },

  /** Daily / weekly / monthly visitor + pageview trends */
  async getTrends(query: any) {
    const { from, to } = parseDateRange(query);
    const granularity = query?.granularity === 'month' ? 'month' : query?.granularity === 'week' ? 'week' : 'day';
    const where = { ...sourceFilter(query?.source), firstSeenAt: { gte: from, lte: to } };

    const sessions = await prisma.visitorSession.findMany({
      where,
      select: { firstSeenAt: true, pageViews: true, isBounce: true },
    });

    const bucketKey = (d: Date) => {
      if (granularity === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (granularity === 'week') {
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
      }
      return d.toISOString().slice(0, 10);
    };

    const buckets = new Map<string, { date: string; visitors: number; pageViews: number; bounces: number }>();
    for (const s of sessions) {
      const key = bucketKey(s.firstSeenAt);
      const b = buckets.get(key) ?? { date: key, visitors: 0, pageViews: 0, bounces: 0 };
      b.visitors += 1;
      b.pageViews += s.pageViews;
      b.bounces += s.isBounce ? 1 : 0;
      buckets.set(key, b);
    }

    return { trend: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  },

  /** Visitors active right now, with location */
  async getRealtime(query: any) {
    const since = new Date(Date.now() - REALTIME_WINDOW_MIN * 60 * 1000);
    const sessions = await prisma.visitorSession.findMany({
      where: { ...sourceFilter(query?.source), lastSeenAt: { gte: since } },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
      select: {
        sessionId: true, source: true, country: true, countryCode: true, city: true,
        exitPath: true, browser: true, os: true, deviceType: true, lastSeenAt: true, userId: true,
        user: { select: { name: true, email: true } },
      },
    });
    return { count: sessions.length, sessions };
  },

  /** Export raw sessions as CSV for the date range */
  async exportCsv(query: any) {
    const { from, to } = parseDateRange(query);
    const where = { ...sourceFilter(query?.source), firstSeenAt: { gte: from, lte: to } };

    const sessions = await prisma.visitorSession.findMany({
      where,
      orderBy: { firstSeenAt: 'desc' },
      take: 10000,
    });

    const cols = [
      'sessionId', 'source', 'firstSeenAt', 'lastSeenAt', 'pageViews', 'isBounce',
      'entryPath', 'exitPath', 'referrer', 'utmSource', 'country', 'city', 'region',
      'timezone', 'language', 'browser', 'browserVersion', 'os', 'osVersion', 'deviceType', 'ip',
    ];
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = v instanceof Date ? v.toISOString() : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const s of sessions) lines.push(cols.map(c => esc((s as any)[c])).join(','));
    return lines.join('\n');
  },

  /**
   * Public, read-only headline numbers for the marketing site (no auth, no PII).
   * Caregiver satisfaction is derived from module feedback ratings (1-5 scale,
   * averaged across childResponse + confidence, scaled to a percentage).
   */
  async getPublicStats() {
    const [familiesSupported, feedback] = await Promise.all([
      prisma.user.count({ where: { role: 'PARENT' } }),
      prisma.moduleFeedback.aggregate({
        _avg: { childResponse: true, confidence: true },
        _count: { _all: true },
      }),
    ]);

    const avgChild = feedback._avg.childResponse;
    const avgConfidence = feedback._avg.confidence;
    const caregiverSatisfaction = (avgChild != null && avgConfidence != null)
      ? Math.round(((avgChild + avgConfidence) / 2 / 5) * 100)
      : null;

    return {
      familiesSupported,
      caregiverSatisfaction,
      languagesSupported: 4,
    };
  },
};
