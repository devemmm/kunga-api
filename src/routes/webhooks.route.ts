import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { SubStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import { sendSubscriptionActivatedEmail } from '../lib/email.js';

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

      if (tx_ref.startsWith('KB-')) {
        // Subscription payment
        const userId = tx_ref.split('-')[1];
        const plan = amount >= 140 ? 'annual' : 'monthly';
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + (plan === 'annual' ? 365 : 30));

        await prisma.subscription.upsert({
          where: { userId },
          update: { status: SubStatus.ACTIVE, flutterwaveTxId: String(flwTxId), platform: 'flutterwave', periodEnd },
          create: { userId, plan, status: SubStatus.ACTIVE, flutterwaveTxId: String(flwTxId), platform: 'flutterwave', periodEnd },
        });
        const user = await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: SubStatus.ACTIVE } });
        // Send subscription confirmation email (best-effort)
        sendSubscriptionActivatedEmail(user.email, user.name ?? '', plan).catch(() => {});

      } else if (tx_ref.startsWith('DON-')) {
        // Donation payment
        await prisma.donation.updateMany({
          where: { flutterwaveTxId: String(flwTxId) },
          data: { status: 'COMPLETED' },
        });

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
            const { sendExpoPush, buildMessages } = await import('../lib/expo-push.js');
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
          create: { userId, plan: 'monthly', status, platform: 'stripe', periodEnd: new Date(sub.current_period_end * 1000) },
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
