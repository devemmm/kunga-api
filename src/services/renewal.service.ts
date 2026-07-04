/**
 * SubscriptionRenewalService
 *
 * Handles the full auto-renewal lifecycle for Flutterwave card subscriptions:
 *   1. sendRenewalReminders()   — runs daily at 09:00 UTC; emails + pushes users 3 days before expiry
 *   2. processAutoRenewals()    — runs daily at 10:00 UTC; charges stored card tokens for expired subs
 *   3. expireStaleSubscriptions()— runs daily at 11:00 UTC; marks ACTIVE subs past periodEnd as EXPIRED
 */

import { SubStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import {
  sendSubscriptionRenewalReminderEmail,
  sendSubscriptionRenewalFailedEmail,
  sendSubscriptionActivatedEmail,
} from '../lib/email.js';
import { sendExpoPush, buildMessages } from '../lib/expo-push.js';
import { PricingService } from './admin.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodDays(plan: string): number {
  if (plan.includes('annual'))    return 365;
  if (plan.includes('quarterly')) return 92;
  return 30;
}

async function resolveAmount(plan: string): Promise<number> {
  const tier   = plan.startsWith('gold') ? 'gold' : 'premium';
  const period = plan.includes('annual') ? 'annual' : plan.includes('quarterly') ? 'quarterly' : 'monthly';
  const raw = await PricingService.get(`price_${tier}_${period}` as any).catch(() => null);
  return parseFloat(raw ?? '') || (period === 'annual' ? 141 : period === 'quarterly' ? 39 : 15);
}

// ─── 1. Renewal reminders ─────────────────────────────────────────────────────

export const SubscriptionRenewalService = {
  async sendRenewalReminders(): Promise<void> {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const twoDaysFromNow   = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    // Find ACTIVE subscriptions expiring in exactly 3 days (within the next 24-hour window)
    const subs = await prisma.subscription.findMany({
      where: {
        status:    SubStatus.ACTIVE,
        periodEnd: { gte: twoDaysFromNow, lte: threeDaysFromNow },
        platform:  'flutterwave',
      },
      include: { user: { select: { email: true, name: true, pushToken: true } } },
    });

    for (const sub of subs) {
      const { user } = sub;
      if (!user || !sub.periodEnd) continue;

      const amount   = await resolveAmount(sub.plan);
      const currency = 'USD';

      // Email reminder
      sendSubscriptionRenewalReminderEmail(
        user.email, user.name ?? '', sub.plan, sub.periodEnd, amount, currency,
      ).catch(() => {});

      // Push reminder
      if (user.pushToken) {
        const renewDate = sub.periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        sendExpoPush(buildMessages([user.pushToken], {
          title:    '🔔 Subscription renewing in 3 days',
          body:     `Your Kunga Basics plan renews on ${renewDate}. USD ${amount.toFixed(2)} will be charged automatically.`,
          sound:    'default',
          priority: 'normal',
          data:     { screen: 'Settings' },
        })).catch(() => {});
      }
    }

    console.log(`[Renewal] Sent ${subs.length} renewal reminder(s)`);
  },

  // ─── 2. Auto-renewals ────────────────────────────────────────────────────────

  async processAutoRenewals(): Promise<void> {
    const now = new Date();

    // Find ACTIVE subs that have passed periodEnd and have a stored card token
    const subs = await prisma.subscription.findMany({
      where: {
        status:    SubStatus.ACTIVE,
        periodEnd: { lt: now },
        cardToken: { not: null },
        platform:  'flutterwave',
        // Don't retry if we already attempted within the last 23 hours
        OR: [
          { autoRenewAttemptedAt: null },
          { autoRenewAttemptedAt: { lt: new Date(now.getTime() - 23 * 60 * 60 * 1000) } },
        ],
      },
      include: { user: { select: { email: true, name: true, pushToken: true } } },
    });

    for (const sub of subs) {
      const { user } = sub;
      if (!user || !sub.cardToken) continue;

      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { autoRenewAttemptedAt: now },
      });

      const amount   = await resolveAmount(sub.plan);
      const currency = 'USD';
      const txRef    = `RNW-${sub.userId}-${Date.now()}`;

      try {
        // Flutterwave tokenized charge — charges the stored card without user interaction
        const flwRes = await fetch('https://api.flutterwave.com/v3/tokenized-charges', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.flutterwave.secretKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            token:        sub.cardToken,
            email:        user.email,
            currency,
            amount,
            tx_ref:       txRef,
            narration:    `Kunga Basics ${sub.plan} renewal`,
            meta: { userId: sub.userId, plan: sub.plan, type: 'auto_renewal' },
          }),
        });

        const flwData = await flwRes.json() as any;

        if (flwRes.ok && flwData.status === 'success' && flwData.data?.status === 'successful') {
          // Charge succeeded — extend subscription
          const newPeriodEnd = new Date();
          newPeriodEnd.setDate(newPeriodEnd.getDate() + periodDays(sub.plan));

          await prisma.subscription.update({
            where: { id: sub.id },
            data:  {
              status: SubStatus.ACTIVE, periodEnd: newPeriodEnd,
              flutterwaveTxId: String(flwData.data.id),
              autoRenewFailedAt: null,
            },
          });

          console.log(`[Renewal] Auto-renewed ${sub.userId} → ${newPeriodEnd.toISOString()}`);

          // Email + push confirmation
          sendSubscriptionActivatedEmail(user.email, user.name ?? '', sub.plan, newPeriodEnd).catch(() => {});
          if (user.pushToken) {
            sendExpoPush(buildMessages([user.pushToken], {
              title:    '✅ Subscription renewed!',
              body:     `Your Kunga Basics plan has been renewed until ${newPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
              sound:    'default',
              priority: 'high',
              data:     { screen: 'Home' },
            })).catch(() => {});
          }

        } else {
          throw new Error(flwData?.message ?? 'Charge failed');
        }

      } catch (err: any) {
        console.error(`[Renewal] Auto-renewal failed for ${sub.userId}:`, err.message);

        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { autoRenewFailedAt: now },
        });

        // Email + push failure notification
        sendSubscriptionRenewalFailedEmail(user.email, user.name ?? '', sub.plan, amount, currency).catch(() => {});
        if (user.pushToken) {
          sendExpoPush(buildMessages([user.pushToken], {
            title:    '⚠️ Payment failed',
            body:     'We couldn\'t renew your Kunga Basics subscription. Tap to update your payment method.',
            sound:    'default',
            priority: 'high',
            data:     { screen: 'Settings' },
          })).catch(() => {});
        }
      }
    }

    console.log(`[Renewal] Processed ${subs.length} auto-renewal attempt(s)`);
  },

  // ─── 3. Expire stale subscriptions ───────────────────────────────────────────

  async expireStaleSubscriptions(): Promise<void> {
    const now = new Date();

    // Mark ACTIVE subs past their periodEnd (and with no stored card token) as EXPIRED
    const { count } = await prisma.subscription.updateMany({
      where: {
        status:    SubStatus.ACTIVE,
        periodEnd: { lt: now },
        // Only expire those without a card token — ones with a token are handled by processAutoRenewals
        cardToken: null,
        platform:  'flutterwave',
      },
      data: { status: SubStatus.EXPIRED },
    });

    if (count > 0) {
      // Sync User.subscriptionStatus
      const expired = await prisma.subscription.findMany({
        where: { status: SubStatus.EXPIRED, periodEnd: { lt: now }, platform: 'flutterwave' },
        select: { userId: true },
      });
      await Promise.all(
        expired.map(s =>
          prisma.user.update({ where: { id: s.userId }, data: { subscriptionStatus: SubStatus.EXPIRED } }).catch(() => {}),
        ),
      );
    }

    console.log(`[Renewal] Marked ${count} subscription(s) as EXPIRED`);
  },
};
