/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Kunga Basics API — Structured Logger Utilities
 *
 *  • parseUA()   — extract OS / platform / browser from a User-Agent string
 *  • SERVER_META — host info emitted once at startup
 *  • nextReqId() — short human-readable request IDs (req-000001 … req-999999)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import os from 'node:os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UAInfo {
  os:             string;   // iOS · Android · Windows · macOS · Linux · Bot
  osVersion:      string;   // e.g. 17.2 · 14.0 · 10 / 11
  platform:       string;   // Mobile · Tablet · Desktop · Bot · Unknown
  device:         string;   // iPhone · iPad · Mac · PC · Android Phone …
  browser:        string;   // Chrome · Safari · Firefox · Expo Go · curl …
  browserVersion: string;   // major version string, e.g. "124"
}

// ─── User-Agent Parser ────────────────────────────────────────────────────────

export function parseUA(rawUA = ''): UAInfo {
  const ua = rawUA;

  let osName      = 'Unknown';
  let osVersion   = '';
  let platform    = 'Unknown';
  let device      = 'Unknown';
  let browser     = 'Unknown';
  let browserVer  = '';

  // ── OS / Device / Platform ──────────────────────────────────────────────────
  if (/iPhone|iPod/.test(ua)) {
    osName = 'iOS'; platform = 'Mobile'; device = /iPod/.test(ua) ? 'iPod' : 'iPhone';
    const m = ua.match(/CPU (?:iPhone )?OS ([\d_]+)/);
    if (m) osVersion = m[1].replace(/_/g, '.');

  } else if (/iPad/.test(ua)) {
    osName = 'iOS'; platform = 'Tablet'; device = 'iPad';
    const m = ua.match(/CPU OS ([\d_]+)/);
    if (m) osVersion = m[1].replace(/_/g, '.');

  } else if (/Android/.test(ua)) {
    osName = 'Android';
    const m = ua.match(/Android ([\d.]+)/);
    if (m) osVersion = m[1];
    platform = /Mobile/.test(ua) ? 'Mobile' : 'Tablet';
    device   = platform === 'Mobile' ? 'Android Phone' : 'Android Tablet';

  } else if (/Windows NT/.test(ua)) {
    osName = 'Windows'; platform = 'Desktop'; device = 'PC';
    const m = ua.match(/Windows NT ([\d.]+)/);
    if (m) {
      const map: Record<string, string> = {
        '10.0': '10 / 11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista',
      };
      osVersion = map[m[1]] ?? m[1];
    }

  } else if (/Mac OS X/.test(ua)) {
    osName = 'macOS'; platform = 'Desktop'; device = 'Mac';
    const m = ua.match(/Mac OS X ([\d_.]+)/);
    if (m) osVersion = m[1].replace(/_/g, '.');

  } else if (/CrOS/.test(ua)) {
    osName = 'ChromeOS'; platform = 'Desktop'; device = 'Chromebook';

  } else if (/Linux/.test(ua)) {
    osName = 'Linux'; platform = 'Desktop'; device = 'PC';

  } else if (/bot|crawler|spider|googlebot|bingbot|slurp|facebookexternalhit/i.test(ua)) {
    osName = 'Bot'; platform = 'Bot'; device = 'Bot';
  }

  // ── Browser / Client ────────────────────────────────────────────────────────
  if (!ua || ua.trim() === '') {
    browser = 'Unknown';

  } else if (/Expo\//i.test(ua) || /ExpoGo/i.test(ua)) {
    browser = 'Expo Go';

  } else if (/okhttp\//i.test(ua)) {
    browser = 'React Native'; platform = 'Mobile';

  } else if (/Postman/i.test(ua)) {
    browser = 'Postman';

  } else if (/Insomnia/i.test(ua)) {
    browser = 'Insomnia';

  } else if (/curl\//i.test(ua)) {
    browser = 'curl';
    const m = ua.match(/curl\/([\d.]+)/i); if (m) browserVer = m[1];

  } else if (/axios\//i.test(ua) || /python-httpx/i.test(ua) || /python-requests/i.test(ua) ||
             /node-fetch/i.test(ua) || /got\//i.test(ua) || /undici/i.test(ua)) {
    browser = 'API Client';

  } else if (/EdgA?\//.test(ua)) {
    browser = 'Edge';
    const m = ua.match(/Edg(?:A|e)?\/?([\d.]+)/); if (m) browserVer = m[1].split('.')[0];

  } else if (/OPR\/|Opera\//.test(ua)) {
    browser = 'Opera';
    const m = ua.match(/(?:OPR|Opera)\/([\d.]+)/); if (m) browserVer = m[1].split('.')[0];

  } else if (/FxiOS\//.test(ua)) {
    browser = 'Firefox (iOS)';
    const m = ua.match(/FxiOS\/([\d.]+)/); if (m) browserVer = m[1].split('.')[0];

  } else if (/CriOS\//.test(ua)) {
    browser = 'Chrome (iOS)';
    const m = ua.match(/CriOS\/([\d.]+)/); if (m) browserVer = m[1].split('.')[0];

  } else if (/Firefox\//.test(ua)) {
    browser = 'Firefox';
    const m = ua.match(/Firefox\/([\d.]+)/); if (m) browserVer = m[1].split('.')[0];

  } else if (/Chrome\//.test(ua)) {
    browser = 'Chrome';
    const m = ua.match(/Chrome\/([\d.]+)/); if (m) browserVer = m[1].split('.')[0];

  } else if (/Safari\//.test(ua)) {
    browser = 'Safari';
    const m = ua.match(/Version\/([\d.]+)/); if (m) browserVer = m[1].split('.')[0];
  }

  return {
    os:             osName,
    osVersion,
    platform,
    device,
    browser,
    browserVersion: browserVer,
  };
}

// ─── Server Host Metadata ─────────────────────────────────────────────────────

export const SERVER_META = {
  hostname:    os.hostname(),
  nodeVersion: process.version,
  serverOS:    `${os.type()} ${os.release()}`,
  arch:        os.arch(),
  cpus:        os.cpus().length,
  memoryMB:    Math.round(os.totalmem() / 1024 / 1024),
};

// ─── Request ID ───────────────────────────────────────────────────────────────

let _counter = 0;
export function nextReqId(): string {
  _counter = (_counter + 1) % 1_000_000;
  return `req-${String(_counter).padStart(6, '0')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format bytes as a human-readable size string. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Paths that are excluded from request/response logging. */
export const SILENT_PATHS = new Set(['/', '/health', '/favicon.ico']);
export function isSilentPath(url: string): boolean {
  return SILENT_PATHS.has(url) || url.startsWith('/docs');
}
