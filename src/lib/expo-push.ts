/**
 * Expo Push Notification helper
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Sends push messages to Expo's delivery service which handles
 * routing to APNs (iOS) and FCM (Android).
 */

export interface PushMessage {
  /** Expo push token — format: ExponentPushToken[xxxxxx] */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  /** 'high' wakes the device immediately (default for most alerts) */
  priority?: 'default' | 'normal' | 'high';
  /** iOS channel / Android channel id */
  channelId?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send push notifications in batches of 100 (Expo's recommended max).
 * Failures are logged but never thrown — push is always best-effort.
 */
export async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  if (!messages.length) return;

  // Split into ≤100-item batches per Expo recommendation
  const batches: PushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    batches.push(messages.slice(i, i + 100));
  }

  for (const batch of batches) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'Accept':         'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        console.error('[ExpoPush] HTTP error', res.status, await res.text());
        continue;
      }

      const result = (await res.json()) as { data: ExpoTicket[] };
      const failed = (result?.data ?? []).filter(t => t.status === 'error');
      if (failed.length) {
        // Log individual failures (e.g. DeviceNotRegistered — stale token)
        for (const f of failed) {
          console.warn('[ExpoPush] Ticket error:', f.message, f.details);
        }
      } else {
        console.log(`[ExpoPush] Sent ${batch.length} notification(s) ✓`);
      }
    } catch (err) {
      console.error('[ExpoPush] Network error sending push batch:', err);
    }
  }
}

/**
 * Build a list of push messages from a set of push tokens.
 * Tokens that are null / undefined / empty are filtered out automatically.
 */
export function buildMessages(
  tokens: (string | null | undefined)[],
  message: Omit<PushMessage, 'to'>,
): PushMessage[] {
  return tokens
    .filter((t): t is string => Boolean(t))
    .map(to => ({ to, ...message }));
}
