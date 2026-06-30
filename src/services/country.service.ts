import { CountryStatus, PrismaClient } from '@prisma/client';
import { lookupGeo, getClientIp, COUNTRY_NAMES, CONTINENT_BY_COUNTRY } from '../lib/geo';

const prisma = new PrismaClient();

// ─── Full country seed list (ISO-3166-1 alpha-2) ─────────────────────────────
export const ALL_COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: 'AF', name: 'Afghanistan',            flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria',                flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra',                flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                 flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua and Barbuda',    flag: '🇦🇬' },
  { code: 'AR', name: 'Argentina',              flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia',                flag: '🇦🇲' },
  { code: 'AU', name: 'Australia',              flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',                flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaijan',             flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain',                flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh',             flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',               flag: '🇧🇧' },
  { code: 'BY', name: 'Belarus',                flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium',                flag: '🇧🇪' },
  { code: 'BZ', name: 'Belize',                 flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin',                  flag: '🇧🇯' },
  { code: 'BT', name: 'Bhutan',                 flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana',               flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil',                 flag: '🇧🇷' },
  { code: 'BN', name: 'Brunei',                 flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',               flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso',           flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                flag: '🇧🇮' },
  { code: 'CV', name: 'Cabo Verde',             flag: '🇨🇻' },
  { code: 'KH', name: 'Cambodia',               flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon',               flag: '🇨🇲' },
  { code: 'CA', name: 'Canada',                 flag: '🇨🇦' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫' },
  { code: 'TD', name: 'Chad',                   flag: '🇹🇩' },
  { code: 'CL', name: 'Chile',                  flag: '🇨🇱' },
  { code: 'CN', name: 'China',                  flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia',               flag: '🇨🇴' },
  { code: 'KM', name: 'Comoros',                flag: '🇰🇲' },
  { code: 'CG', name: 'Congo',                  flag: '🇨🇬' },
  { code: 'CD', name: 'DR Congo',               flag: '🇨🇩' },
  { code: 'CR', name: 'Costa Rica',             flag: '🇨🇷' },
  { code: 'HR', name: 'Croatia',                flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba',                   flag: '🇨🇺' },
  { code: 'CY', name: 'Cyprus',                 flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic',         flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark',                flag: '🇩🇰' },
  { code: 'DJ', name: 'Djibouti',               flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica',               flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic',     flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador',                flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt',                  flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador',            flag: '🇸🇻' },
  { code: 'GQ', name: 'Equatorial Guinea',      flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea',                flag: '🇪🇷' },
  { code: 'EE', name: 'Estonia',                flag: '🇪🇪' },
  { code: 'SZ', name: 'Eswatini',               flag: '🇸🇿' },
  { code: 'ET', name: 'Ethiopia',               flag: '🇪🇹' },
  { code: 'FJ', name: 'Fiji',                   flag: '🇫🇯' },
  { code: 'FI', name: 'Finland',                flag: '🇫🇮' },
  { code: 'FR', name: 'France',                 flag: '🇫🇷' },
  { code: 'GA', name: 'Gabon',                  flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                 flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                flag: '🇬🇪' },
  { code: 'DE', name: 'Germany',                flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana',                  flag: '🇬🇭' },
  { code: 'GR', name: 'Greece',                 flag: '🇬🇷' },
  { code: 'GD', name: 'Grenada',                flag: '🇬🇩' },
  { code: 'GT', name: 'Guatemala',              flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea',                 flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau',          flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                 flag: '🇬🇾' },
  { code: 'HT', name: 'Haiti',                  flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',               flag: '🇭🇳' },
  { code: 'HU', name: 'Hungary',                flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland',                flag: '🇮🇸' },
  { code: 'IN', name: 'India',                  flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia',              flag: '🇮🇩' },
  { code: 'IR', name: 'Iran',                   flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq',                   flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland',                flag: '🇮🇪' },
  { code: 'IL', name: 'Israel',                 flag: '🇮🇱' },
  { code: 'IT', name: 'Italy',                  flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica',                flag: '🇯🇲' },
  { code: 'JP', name: 'Japan',                  flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan',                 flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan',             flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya',                  flag: '🇰🇪' },
  { code: 'KI', name: 'Kiribati',               flag: '🇰🇮' },
  { code: 'KP', name: 'North Korea',            flag: '🇰🇵' },
  { code: 'KR', name: 'South Korea',            flag: '🇰🇷' },
  { code: 'KW', name: 'Kuwait',                 flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan',             flag: '🇰🇬' },
  { code: 'LA', name: 'Laos',                   flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia',                 flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon',                flag: '🇱🇧' },
  { code: 'LS', name: 'Lesotho',                flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia',                flag: '🇱🇷' },
  { code: 'LY', name: 'Libya',                  flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',          flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania',              flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg',             flag: '🇱🇺' },
  { code: 'MG', name: 'Madagascar',             flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi',                 flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia',               flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives',               flag: '🇲🇻' },
  { code: 'ML', name: 'Mali',                   flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                  flag: '🇲🇹' },
  { code: 'MH', name: 'Marshall Islands',       flag: '🇲🇭' },
  { code: 'MR', name: 'Mauritania',             flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius',              flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico',                 flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia',             flag: '🇫🇲' },
  { code: 'MD', name: 'Moldova',                flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco',                 flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',               flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',             flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco',                flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique',             flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia',                flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru',                  flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                  flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands',            flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand',            flag: '🇳🇿' },
  { code: 'NI', name: 'Nicaragua',              flag: '🇳🇮' },
  { code: 'NE', name: 'Niger',                  flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                flag: '🇳🇬' },
  { code: 'MK', name: 'North Macedonia',        flag: '🇲🇰' },
  { code: 'NO', name: 'Norway',                 flag: '🇳🇴' },
  { code: 'OM', name: 'Oman',                   flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan',               flag: '🇵🇰' },
  { code: 'PW', name: 'Palau',                  flag: '🇵🇼' },
  { code: 'PA', name: 'Panama',                 flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea',       flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',               flag: '🇵🇾' },
  { code: 'PE', name: 'Peru',                   flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines',            flag: '🇵🇭' },
  { code: 'PL', name: 'Poland',                 flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',               flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar',                  flag: '🇶🇦' },
  { code: 'RO', name: 'Romania',                flag: '🇷🇴' },
  { code: 'RU', name: 'Russia',                 flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda',                 flag: '🇷🇼' },
  { code: 'KN', name: 'Saint Kitts and Nevis',  flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia',            flag: '🇱🇨' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa',                  flag: '🇼🇸' },
  { code: 'SM', name: 'San Marino',             flag: '🇸🇲' },
  { code: 'ST', name: 'Sao Tome and Principe',  flag: '🇸🇹' },
  { code: 'SA', name: 'Saudi Arabia',           flag: '🇸🇦' },
  { code: 'SN', name: 'Senegal',                flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                 flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles',             flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone',           flag: '🇸🇱' },
  { code: 'SG', name: 'Singapore',              flag: '🇸🇬' },
  { code: 'SK', name: 'Slovakia',               flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia',               flag: '🇸🇮' },
  { code: 'SB', name: 'Solomon Islands',        flag: '🇸🇧' },
  { code: 'SO', name: 'Somalia',                flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa',           flag: '🇿🇦' },
  { code: 'SS', name: 'South Sudan',            flag: '🇸🇸' },
  { code: 'ES', name: 'Spain',                  flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka',              flag: '🇱🇰' },
  { code: 'SD', name: 'Sudan',                  flag: '🇸🇩' },
  { code: 'SR', name: 'Suriname',               flag: '🇸🇷' },
  { code: 'SE', name: 'Sweden',                 flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland',            flag: '🇨🇭' },
  { code: 'SY', name: 'Syria',                  flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan',                 flag: '🇹🇼' },
  { code: 'TJ', name: 'Tajikistan',             flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania',               flag: '🇹🇿' },
  { code: 'TH', name: 'Thailand',               flag: '🇹🇭' },
  { code: 'TL', name: 'Timor-Leste',            flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                   flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga',                  flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad and Tobago',    flag: '🇹🇹' },
  { code: 'TN', name: 'Tunisia',                flag: '🇹🇳' },
  { code: 'TR', name: 'Turkey',                 flag: '🇹🇷' },
  { code: 'TM', name: 'Turkmenistan',           flag: '🇹🇲' },
  { code: 'TV', name: 'Tuvalu',                 flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda',                 flag: '🇺🇬' },
  { code: 'UA', name: 'Ukraine',                flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates',   flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom',         flag: '🇬🇧' },
  { code: 'US', name: 'United States',          flag: '🇺🇸' },
  { code: 'UY', name: 'Uruguay',                flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan',             flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela',              flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen',                  flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia',                 flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe',               flag: '🇿🇼' },
];

// ─── Seed all countries (idempotent) ─────────────────────────────────────────
export async function seedCountries() {
  for (const c of ALL_COUNTRIES) {
    await prisma.countryAvailability.upsert({
      where:  { countryCode: c.code },
      create: { countryCode: c.code, countryName: c.name, countryFlag: c.flag, status: 'NOT_AVAILABLE' },
      update: { countryName: c.name, countryFlag: c.flag },
    });
  }
}

// ─── Country Service ──────────────────────────────────────────────────────────
export const CountryService = {

  // Public: check access for a given request's IP
  async checkAccess(req: any): Promise<{
    allowed: boolean;
    status: CountryStatus;
    countryCode: string | null;
    countryName: string | null;
    countryFlag: string | null;
    launchDate:  string | null;
  }> {
    const ip = getClientIp(req);
    const geo = lookupGeo(ip);
    const code = geo.countryCode;

    // Unknown country → allow (don't block what we can't identify)
    if (!code) return { allowed: true, status: 'AVAILABLE', countryCode: null, countryName: null, countryFlag: null, launchDate: null };

    const record = await prisma.countryAvailability.findUnique({ where: { countryCode: code } });

    // Country not in DB → not available
    if (!record) {
      return { allowed: false, status: 'NOT_AVAILABLE', countryCode: code, countryName: geo.country, countryFlag: '', launchDate: null };
    }

    const allowed = record.status === 'AVAILABLE';
    return {
      allowed,
      status:      record.status,
      countryCode: record.countryCode,
      countryName: record.countryName,
      countryFlag: record.countryFlag,
      launchDate:  record.launchDate?.toISOString() ?? null,
    };
  },

  // Record a blocked access attempt for analytics
  async recordAttempt(req: any, type: string) {
    const ip  = getClientIp(req);
    const geo = lookupGeo(ip);
    const code = geo.countryCode;
    if (!code) return;

    const country = code
      ? await prisma.countryAvailability.findUnique({ where: { countryCode: code } })
      : null;

    await prisma.countryAccessAttempt.create({
      data: {
        countryId:   country?.id ?? null,
        countryCode: code,
        countryName: geo.country,
        type,
        ip,
      },
    }).catch(() => {});
  },

  // Admin: list all countries with filters/search/sort
  async listAll(query: any) {
    const { search, status, sortBy = 'countryName', sortDir = 'asc', page = 1, limit = 50 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (search)  where.countryName = { contains: search, mode: 'insensitive' };
    if (status)  where.status = status;

    const [countries, total] = await Promise.all([
      prisma.countryAvailability.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy]: sortDir },
        include: { updatedBy: { select: { id: true, name: true, email: true } } },
      }),
      prisma.countryAvailability.count({ where }),
    ]);

    return { countries, total, page: Number(page), limit: Number(limit) };
  },

  // Admin: update one country
  async updateOne(id: string, data: { status?: CountryStatus; launchDate?: string | null; notes?: string }, adminId: string) {
    const current = await prisma.countryAvailability.findUniqueOrThrow({ where: { id } });

    const updateData: any = { updatedById: adminId };
    if (data.status !== undefined)     updateData.status = data.status;
    if ('launchDate' in data)          updateData.launchDate = data.launchDate ? new Date(data.launchDate) : null;
    if (data.notes !== undefined)      updateData.notes = data.notes;

    // If setting to SCHEDULED with a past date, auto-activate
    if (updateData.status === 'SCHEDULED' && updateData.launchDate && new Date(updateData.launchDate) <= new Date()) {
      updateData.status = 'AVAILABLE';
    }

    const updated = await prisma.countryAvailability.update({ where: { id }, data: updateData });

    await prisma.countryAuditLog.create({
      data: {
        countryId:     id,
        prevStatus:    current.status,
        newStatus:     updateData.status ?? current.status,
        prevLaunch:    current.launchDate,
        newLaunch:     updateData.launchDate,
        action:        this._describeAction(current, updateData),
        performedById: adminId,
      },
    });

    return updated;
  },

  // Admin: bulk update
  async bulkUpdate(ids: string[], data: { status?: CountryStatus; launchDate?: string | null }, adminId: string) {
    const results = await Promise.allSettled(ids.map(id => this.updateOne(id, data, adminId)));
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    return { succeeded, failed: ids.length - succeeded };
  },

  // Admin: analytics
  async getAnalytics() {
    const now = new Date();
    const dayAgo   = new Date(now.getTime() - 86400000);
    const weekAgo  = new Date(now.getTime() - 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);

    const [
      statusCounts,
      totalBlocked,
      dailyBlocked,
      weeklyBlocked,
      monthlyBlocked,
      topCountries,
      byType,
    ] = await Promise.all([
      prisma.countryAvailability.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.countryAccessAttempt.count(),
      prisma.countryAccessAttempt.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.countryAccessAttempt.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.countryAccessAttempt.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.countryAccessAttempt.groupBy({
        by: ['countryCode', 'countryName'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.countryAccessAttempt.groupBy({
        by: ['type'],
        _count: { id: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const s of statusCounts) counts[s.status] = s._count.id;

    return {
      summary: {
        available:    counts['AVAILABLE']    ?? 0,
        notAvailable: counts['NOT_AVAILABLE'] ?? 0,
        maintenance:  counts['MAINTENANCE']  ?? 0,
        scheduled:    counts['SCHEDULED']    ?? 0,
        totalBlocked,
      },
      blockedRequests: { daily: dailyBlocked, weekly: weeklyBlocked, monthly: monthlyBlocked },
      topCountries: topCountries.map(r => ({
        countryCode: r.countryCode,
        countryName: r.countryName,
        attempts:    r._count.id,
      })),
      byType: byType.map(r => ({ type: r.type, count: r._count.id })),
    };
  },

  // Admin: audit log for a country
  async getAuditLog(countryId: string) {
    return prisma.countryAuditLog.findMany({
      where:   { countryId },
      orderBy: { createdAt: 'desc' },
      take:    100,
      include: { performedBy: { select: { id: true, name: true, email: true } } },
    });
  },

  // Cron job: activate scheduled countries whose launch date has passed
  async processScheduled() {
    const due = await prisma.countryAvailability.findMany({
      where: {
        status:     'SCHEDULED',
        launchDate: { lte: new Date() },
      },
    });

    for (const c of due) {
      await prisma.countryAvailability.update({
        where: { id: c.id },
        data:  { status: 'AVAILABLE' },
      });
      await prisma.countryAuditLog.create({
        data: {
          countryId:  c.id,
          prevStatus: 'SCHEDULED',
          newStatus:  'AVAILABLE',
          prevLaunch: c.launchDate,
          newLaunch:  c.launchDate,
          action:     'Auto-activated on scheduled launch date',
        },
      });
    }

    return due.length;
  },

  _describeAction(current: any, update: any): string {
    if (update.status && update.status !== current.status) {
      const map: Record<string, string> = {
        AVAILABLE:     'Enabled availability',
        NOT_AVAILABLE: 'Disabled availability',
        MAINTENANCE:   'Set to maintenance mode',
        SCHEDULED:     'Scheduled for launch',
      };
      return map[update.status] ?? `Status changed to ${update.status}`;
    }
    if ('launchDate' in update) return update.launchDate ? 'Updated launch date' : 'Removed launch date';
    return 'Updated settings';
  },
};
