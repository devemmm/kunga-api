import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { SubStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import { sendSubscriptionActivatedEmail, sendDonationReceiptEmail } from '../lib/email.js';
import { sendExpoPush, buildMessages } from '../lib/expo-push.js';

export async function webhooksRoutes(server: FastifyInstance) {
  /**
   * POST /webhooks/flutterwave
   * Flutterwave payment webhook (subscriptions + donations)
   */
  server.post('/flutterwave', {
    schema: { tags: ['Webhooks'], summary: 'Flutterwave payment webhook' },
    config: { rawBody: true },
  }, async (req, reply) => {
    const signature = req.headers['verif-hash'] as string;
    const expectedHash = config.flutterwave.webhookHash;

    if (!signature || signature !== expectedHash) {
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    const body = req.body as any;
    const { event, data } = body;

    if (event === 'charge.completed' && data?.status === 'successful') {
      const { tx_ref, customer, amount, currency, id: flwTxId } = data;

      if (tx_ref.startsWith('KB-') || tx_ref.startsWith('RNW-')) {
        // Subscription payment (initial KB- or auto-renewal RNW-)
        const userId = tx_ref.startsWith('RNW-') ? tx_ref.split('-')[1] : tx_ref.split('-')[1];

        // Resolve plan from existing subscription row, or fall back to meta from Flutterwave
        const existing = await prisma.subscription.findUnique({ where: { userId } });
        const plan = data.meta?.plan ?? existing?.plan ?? 'premium_monthly';

        // Determine period length from plan string
        const periodDays = plan.includes('annual') ? 365 : plan.includes('quarterly') ? 92 : 30;
        const periodEnd  = new Date();
        periodEnd.setDate(periodEnd.getDate() + periodDays);

        // Capture card token if Flutterwave included one (requires tokenization enabled on account)
        const cardToken = data.card?.token       ?? null;
        const cardLast4 = data.card?.last_4digits ?? null;
        const cardBrand = data.card?.type         ?? null;

        await prisma.subscription.upsert({
          where:  { userId },
          update: {
            status: SubStatus.ACTIVE, flutterwaveTxId: String(flwTxId),
            platform: 'flutterwave', periodEnd, plan,
            autoRenewFailedAt: null, autoRenewAttemptedAt: null,
            ...(cardToken && { cardToken, cardLast4, cardBrand }),
          },
          create: {
            userId, plan, status: SubStatus.ACTIVE,
            flutterwaveTxId: String(flwTxId), platform: 'flutterwave', periodEnd,
            ...(cardToken && { cardToken, cardLast4, cardBrand }),
          },
        });

        const user = await prisma.user.update({
          where: { id: userId },
          data:  { subscriptionStatus: SubStatus.ACTIVE },
          select: { email: true, name: true, pushToken: true },
        });

        // Email — professional tier-aware confirmation
        sendSubscriptionActivatedEmail(user.email, user.name ?? '', plan, periodEnd).catch(() => {});

        // Push notification
        if (user.pushToken) {
          const isRenewal = tx_ref.startsWith('RNW-');
          sendExpoPush(buildMessages([user.pushToken], {
            title:    isRenewal ? '✅ Subscription renewed!' : '🎉 Welcome to Kunga Basics!',
            body:     isRenewal
              ? `Your plan has been renewed and is active until ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
              : `Your subscription is now active. Start exploring your child's learning journey!`,
            sound:    'default',
            priority: 'high',
            data:     { screen: 'Home' },
          })).catch(() => {});
        }

      } else if (tx_ref.startsWith('DON-')) {
        // Donation payment
        await prisma.donation.updateMany({
          where: { flutterwaveTxId: String(flwTxId) },
          data: { status: 'COMPLETED' },
        });
        const donation = await prisma.donation.findFirst({ where: { flutterwaveTxId: String(flwTxId) } });
        if (donation) {
          sendDonationReceiptEmail(donation.email, donation.donorName ?? '', donation.amountUsd, donation.currency, donation.campaign ?? 'Kunga Basics').catch(() => {});
        }

      } else if (tx_ref.startsWith('QCR-')) {
        // Question Credit purchase — activate the credit
        await prisma.questionCredit.updateMany({
          where: { txRef: tx_ref, status: 'PENDING' },
          data:  { status: 'ACTIVE' },
        });
        // Push notification to user
        const credit = await prisma.questionCredit.findFirst({ where: { txRef: tx_ref } });
        if (credit) {
          const user = await prisma.user.findUnique({ where: { id: credit.userId }, select: { pushToken: true } });
          if (user?.pushToken) {
            await sendExpoPush(buildMessages([user.pushToken], {
              title:    '🎤 Question Credit activated!',
              body:     `You can now ask Dr. Gad ${credit.credits} extra question${credit.credits > 1 ? 's' : ''} this month.`,
              sound:    'default',
              priority: 'high',
              data:     { screen: 'AskGad' },
            }));
          }
        }
      }
    }

    return reply.send({ received: true });
  });

  /**
   * POST /webhooks/stripe
   * Stripe subscription webhook
   */
  server.post('/stripe', {
    schema: { tags: ['Webhooks'], summary: 'Stripe payment webhook' },
  }, async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string;
    // In production: verify with Stripe SDK:
    // const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);

    const event = req.body as any;

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (userId) {
        const status: SubStatus = sub.status === 'active' ? SubStatus.ACTIVE : sub.status === 'trialing' ? SubStatus.TRIAL : SubStatus.EXPIRED;
        await prisma.subscription.upsert({
          where: { userId },
          update: { status, stripePriceId: sub.items?.data[0]?.price?.id, platform: 'stripe', periodEnd: new Date(sub.current_period_end * 1000) },
          create: { userId, plan: 'monthly', status, platform: 'stripe', stripePriceId: sub.items?.data[0]?.price?.id, periodEnd: new Date(sub.current_period_end * 1000) },
        });
        await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: status } });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (userId) {
        await prisma.subscription.update({ where: { userId }, data: { status: SubStatus.CANCELLED, cancelledAt: new Date() } });
        await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: SubStatus.CANCELLED } });
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      if (pi.metadata?.type === 'donation') {
        await prisma.donation.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: { status: 'COMPLETED' },
        });
        const donation = await prisma.donation.findFirst({ where: { stripePaymentIntentId: pi.id } });
        if (donation) {
          sendDonationReceiptEmail(donation.email, donation.donorName ?? '', donation.amountUsd, donation.currency, donation.campaign ?? 'Kunga Basics').catch(() => {});
        }
      }
    }

    return reply.send({ received: true });
  });

  /**
   * POST /webhooks/revenuecat
   * RevenueCat subscription events
   */
  server.post('/revenuecat', {
    schema: { tags: ['Webhooks'], summary: 'RevenueCat subscription webhook' },
  }, async (req, reply) => {
    const body = req.body as any;
    const event = body.event;

    if (!event) return reply.status(400).send({ error: 'No event in body' });

    const userId = event.app_user_id;

    const statusMap: Record<string, SubStatus> = {
      INITIAL_PURCHASE: SubStatus.ACTIVE,
      RENEWAL:          SubStatus.ACTIVE,
      PRODUCT_CHANGE:   SubStatus.ACTIVE,
      CANCELLATION:     SubStatus.CANCELLED,
      EXPIRATION:       SubStatus.EXPIRED,
      BILLING_ISSUE:    SubStatus.EXPIRED,
      TRIAL_STARTED:    SubStatus.TRIAL,
      TRIAL_CONVERTED:  SubStatus.ACTIVE,
      TRIAL_CANCELLED:  SubStatus.CANCELLED,
    };

    const status = statusMap[event.type];
    if (status && userId) {
      await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: status } });
      await prisma.subscription.upsert({
        where: { userId },
        update: { status, revenuecatSubscriberId: event.subscriber?.subscriber_id, platform: event.store?.toLowerCase() ?? 'apple_iap' },
        create: { userId, plan: 'monthly', status, revenuecatSubscriberId: event.subscriber?.subscriber_id, platform: event.store?.toLowerCase() ?? 'apple_iap' },
      });
    }

    return reply.send({ received: true });
  });
}
