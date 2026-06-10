import geoip from 'geoip-lite';

// ─── Private / local IP detection ────────────────────────────────────────────
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|::ffff:127\.|fc00:|fe80:|localhost)/i;

export interface GeoInfo {
  country: string | null;
  countryCode: string | null;
  continent: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
}

const EMPTY_GEO: GeoInfo = {
  country: null, countryCode: null, continent: null, region: null, city: null, timezone: null,
};

/**
 * Resolve geo info for an IP address using the local GeoLite2-derived
 * `geoip-lite` database — no external API calls, no rate limits.
 */
export function lookupGeo(ip: string | null | undefined): GeoInfo {
  if (!ip) return EMPTY_GEO;
  // Strip IPv6-mapped-IPv4 prefix
  const clean = ip.replace(/^::ffff:/, '');
  if (PRIVATE_IP.test(clean)) return EMPTY_GEO;

  const hit = geoip.lookup(clean);
  if (!hit) return EMPTY_GEO;

  return {
    country:     COUNTRY_NAMES[hit.country] ?? hit.country ?? null,
    countryCode: hit.country ?? null,
    continent:   CONTINENT_BY_COUNTRY[hit.country] ?? null,
    region:      hit.region ?? null,
    city:        hit.city ?? null,
    timezone:    hit.timezone ?? null,
  };
}

/** Best-effort real client IP from common proxy headers + Fastify's req.ip */
export function getClientIp(req: any): string | null {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.ip ?? null;
}

// ─── Traffic source classification ───────────────────────────────────────────

const SEARCH_ENGINES = /google\.|bing\.|yahoo\.|duckduckgo\.|baidu\.|yandex\.|ecosia\./i;
const SOCIAL_SITES   = /facebook\.|instagram\.|twitter\.|x\.com|tiktok\.|linkedin\.|youtube\.|pinterest\.|whatsapp\./i;

export function classifySource(referrer: string | null | undefined, utmSource?: string | null): string {
  if (utmSource) return 'Campaign';
  if (!referrer) return 'Direct';
  try {
    const host = new URL(referrer).hostname;
    if (SEARCH_ENGINES.test(host)) return 'Search';
    if (SOCIAL_SITES.test(host))   return 'Social';
    return 'Referral';
  } catch {
    return 'Direct';
  }
}

// ─── Country code → name & continent ─────────────────────────────────────────
// Compact maps covering all ISO-3166-1 alpha-2 codes returned by geoip-lite.

export const CONTINENT_BY_COUNTRY: Record<string, string> = {
  // Africa
  DZ:'Africa', AO:'Africa', BJ:'Africa', BW:'Africa', BF:'Africa', BI:'Africa', CV:'Africa', CM:'Africa',
  CF:'Africa', TD:'Africa', KM:'Africa', CG:'Africa', CD:'Africa', CI:'Africa', DJ:'Africa', EG:'Africa',
  GQ:'Africa', ER:'Africa', SZ:'Africa', ET:'Africa', GA:'Africa', GM:'Africa', GH:'Africa', GN:'Africa',
  GW:'Africa', KE:'Africa', LS:'Africa', LR:'Africa', LY:'Africa', MG:'Africa', MW:'Africa', ML:'Africa',
  MR:'Africa', MU:'Africa', MA:'Africa', MZ:'Africa', NA:'Africa', NE:'Africa', NG:'Africa', RW:'Africa',
  ST:'Africa', SN:'Africa', SC:'Africa', SL:'Africa', SO:'Africa', ZA:'Africa', SS:'Africa', SD:'Africa',
  TZ:'Africa', TG:'Africa', TN:'Africa', UG:'Africa', ZM:'Africa', ZW:'Africa', EH:'Africa', YT:'Africa',
  RE:'Africa', SH:'Africa',

  // Asia
  AF:'Asia', AM:'Asia', AZ:'Asia', BH:'Asia', BD:'Asia', BT:'Asia', BN:'Asia', KH:'Asia', CN:'Asia',
  CY:'Asia', GE:'Asia', IN:'Asia', ID:'Asia', IR:'Asia', IQ:'Asia', IL:'Asia', JP:'Asia', JO:'Asia',
  KZ:'Asia', KW:'Asia', KG:'Asia', LA:'Asia', LB:'Asia', MO:'Asia', MY:'Asia', MV:'Asia', MN:'Asia',
  MM:'Asia', NP:'Asia', KP:'Asia', OM:'Asia', PK:'Asia', PS:'Asia', PH:'Asia', QA:'Asia', SA:'Asia',
  SG:'Asia', KR:'Asia', LK:'Asia', SY:'Asia', TW:'Asia', TJ:'Asia', TH:'Asia', TL:'Asia', TR:'Asia',
  TM:'Asia', AE:'Asia', UZ:'Asia', VN:'Asia', YE:'Asia', HK:'Asia',

  // Europe
  AL:'Europe', AD:'Europe', AT:'Europe', BY:'Europe', BE:'Europe', BA:'Europe', BG:'Europe', HR:'Europe',
  CZ:'Europe', DK:'Europe', EE:'Europe', FO:'Europe', FI:'Europe', FR:'Europe', DE:'Europe', GI:'Europe',
  GR:'Europe', HU:'Europe', IS:'Europe', IE:'Europe', IM:'Europe', IT:'Europe', XK:'Europe', LV:'Europe',
  LI:'Europe', LT:'Europe', LU:'Europe', MT:'Europe', MD:'Europe', MC:'Europe', ME:'Europe', NL:'Europe',
  MK:'Europe', NO:'Europe', PL:'Europe', PT:'Europe', RO:'Europe', RU:'Europe', SM:'Europe', RS:'Europe',
  SK:'Europe', SI:'Europe', ES:'Europe', SE:'Europe', CH:'Europe', UA:'Europe', GB:'Europe', VA:'Europe',
  AX:'Europe', JE:'Europe', GG:'Europe',

  // North America
  AG:'North America', BS:'North America', BB:'North America', BZ:'North America', CA:'North America',
  CR:'North America', CU:'North America', DM:'North America', DO:'North America', SV:'North America',
  GD:'North America', GT:'North America', HT:'North America', HN:'North America', JM:'North America',
  MX:'North America', NI:'North America', PA:'North America', KN:'North America', LC:'North America',
  VC:'North America', TT:'North America', US:'North America', PR:'North America', GL:'North America',
  BM:'North America', KY:'North America',

  // South America
  AR:'South America', BO:'South America', BR:'South America', CL:'South America', CO:'South America',
  EC:'South America', GY:'South America', PY:'South America', PE:'South America', SR:'South America',
  UY:'South America', VE:'South America', FK:'South America',

  // Oceania
  AU:'Oceania', FJ:'Oceania', KI:'Oceania', MH:'Oceania', FM:'Oceania', NR:'Oceania', NZ:'Oceania',
  PW:'Oceania', PG:'Oceania', WS:'Oceania', SB:'Oceania', TO:'Oceania', TV:'Oceania', VU:'Oceania',
  NC:'Oceania', PF:'Oceania', GU:'Oceania',

  // Antarctica
  AQ:'Antarctica',
};

export const COUNTRY_NAMES: Record<string, string> = {
  RW:'Rwanda', US:'United States', GB:'United Kingdom', CA:'Canada', FR:'France', DE:'Germany',
  KE:'Kenya', UG:'Uganda', TZ:'Tanzania', BI:'Burundi', CD:'DR Congo', NG:'Nigeria', GH:'Ghana',
  ZA:'South Africa', ET:'Ethiopia', EG:'Egypt', IN:'India', CN:'China', JP:'Japan', AU:'Australia',
  BR:'Brazil', NL:'Netherlands', BE:'Belgium', CH:'Switzerland', SE:'Sweden', ES:'Spain', IT:'Italy',
  PT:'Portugal', IE:'Ireland', AE:'United Arab Emirates', SA:'Saudi Arabia', QA:'Qatar',
  // fallback handled by raw code if not present here
};
