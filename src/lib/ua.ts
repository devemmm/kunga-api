import { UAParser } from 'ua-parser-js';

export interface UaInfo {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: string;   // "desktop" | "mobile" | "tablet"
}

/**
 * Parse a User-Agent string into browser/OS/device info.
 * `deviceType` defaults to "desktop" when ua-parser doesn't detect a
 * mobile/tablet device type (most desktop browsers don't report one).
 */
export function parseUserAgent(ua: string | null | undefined): UaInfo {
  if (!ua) {
    return { browser: null, browserVersion: null, os: null, osVersion: null, deviceType: 'desktop' };
  }
  const r = new UAParser(ua).getResult();
  const type = r.device?.type; // "mobile" | "tablet" | "console" | "smarttv" | "wearable" | "embedded" | undefined
  const deviceType = type === 'mobile' || type === 'tablet' ? type : 'desktop';

  return {
    browser:        r.browser?.name ?? null,
    browserVersion: r.browser?.version ?? null,
    os:             r.os?.name ?? null,
    osVersion:      r.os?.version ?? null,
    deviceType,
  };
}
