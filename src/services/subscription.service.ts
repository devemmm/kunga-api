import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import { sendSubscriptionCancelledEmail, sendSubscriptionRestoredEmail } from '../lib/email.js';
import { PricingService } from './admin.service.js';
import type { OverrideSubscriptionInput, RevenueCatSyncInput, FlutterwaveInitiateInput, StripeCheckoutInput } from '../models/index.js';

export const SubscriptionService = {
  async getStatus(userId: string) {
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { subscriptionStatus: true } });
    return {
      status: user?.subscriptionStatus ?? 'NONE',
      subscription,
      hasAccess: ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'].includes(user?.subscriptionStatus ?? ''),
    };
  },

  async listSubscriptions(params: { platform?: string; status?: string; plan?: string; search?: string; page?: number; limit?: number }) {
    const { platform, status, plan, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.subscription.count({ where }),
    ]);
    return { subscriptions, total, page, limit };
  },

  async getById(userId: string) {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, avatarUrl: true,
            subscriptionStatus: true, createdAt: true, lastLoginAt: true,
            childProfile: { select: { childName: true, ageMonths: true, challenges: true } },
            _count: { select: { progress: true } },
          },
        },
      },
    });
    if (!sub) throw Object.assign(new Error('Subscription not found'), { status: 404 });
    return { subscription: sub };
  },

  async override(userId: string, data: OverrideSubscriptionInput, adminId: string) {
    const subscription = await prisma.subscription.upsert({
      where: { userId },
      update: {
        status: data.status,
        ...(data.plan && { plan: data.plan }),
        ...(data.periodEnd && { periodEnd: new Date(data.periodEnd) }),
      },
      create: {
        userId,
        status: data.status,
        plan: data.plan ?? 'monthly',
        platform: 'admin_override',
        ...(data.periodEnd && { periodEnd: new Date(data.periodEnd) }),
      },
    });
    await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: data.status } });
    await prisma.activityLog.create({
      data: { userId, adminId, action: 'admin.subscription.override', details: data.reason ?? `Status set to ${data.status}` },
    });
    return { subscription };
  },

  async cancel(userId: string, adminId: string) {
    await prisma.subscription.update({ where: { userId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const user = await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: 'CANCELLED' } });
    await prisma.activityLog.create({ data: { userId, adminId, action: 'admin.subscription.cancel' } });
    sendSubscriptionCancelledEmail(user.email, user.name ?? '').catch(() => {});
    return { message: 'Subscription cancelled' };
  },

  async restore(userId: string, adminId: string) {
    await prisma.subscription.update({
      where: { userId },
      data: { status: 'ACTIVE', cancelledAt: null, periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    const user = await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: 'ACTIVE' } });
    await prisma.activityLog.create({ data: { userId, adminId, action: 'admin.subscription.restore' } });
    sendSubscriptionRestoredEmail(user.email, user.name ?? '').catch(() => {});
    return { message: 'Subscription restored' };
  },

  async syncFromRevenueCat(userId: string, data: RevenueCatSyncInput) {
    const premium = data.entitlements?.premium;
    const isActive = premium?.isActive ?? false;
    const status = isActive ? 'ACTIVE' : 'EXPIRED';
    const platform = (premium?.store ?? 'apple_iap') as string;

    const subscription = await prisma.subscription.upsert({
      where: { userId },
      update: {
        status,
        revenuecatSubscriberId: data.subscriberId,
        platform,
        ...(premium?.expiresDate && { periodEnd: new Date(premium.expiresDate) }),
      },
      create: {
        userId,
        plan: 'monthly',
        status,
        revenuecatSubscriberId: data.subscriberId,
        platform,
        ...(premium?.expiresDate && { periodEnd: new Date(premium.expiresDate) }),
      },
    });

    await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: status } });
    return { status, hasAccess: status === 'ACTIVE', subscription };
  },
};

export const PaymentService = {
  async initiateFlutterwave(userId: string, data: FlutterwaveInitiateInput) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const prices   = await PricingService.getPrices();
    const amount   = data.plan === 'annual' ? prices.annual : prices.monthly;
    const currency = data.currency ?? 'USD';
    const txRef    = `KB-${userId}-${Date.now()}`;

    // Create a Flutterwave hosted payment link — handles cards, mobile money, bank transfer, etc.
    let paymentLink: string;
    try {
      const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.flutterwave.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref:   txRef,
          amount,
          currency,
          redirect_url: config.flutterwave.redirectUrl,
          meta: { userId, plan: data.plan },
          customer: { email: user.email, name: user.name ?? user.email },
          customizations: {
            title:       'Kunga Basics',
            description: `${data.plan === 'annual' ? 'Annual' : 'Monthly'} plan – child development program`,
          },
        }),
      });
      const flwData = await flwRes.json() as any;
      if (!flwRes.ok || flwData.status !== 'success') {
        console.error('[Flutterwave] initiate failed', { plan: data.plan, amount, currency, status: flwRes.status, body: flwData });
        throw Object.assign(new Error(flwData?.message ?? 'Payment provider error'), { status: 502 });
      }
      paymentLink = flwData.data.link;
    } catch (err: any) {
      if (err.status) throw err; // re-throw our own errors
      throw Object.assign(new Error('Failed to connect to payment provider'), { status: 502 });
    }

    // Record a pending subscription so we can link the webhook / verify back to the user
    await prisma.subscription.upsert({
      where:  { userId },
      update: { flutterwaveTxId: txRef, plan: data.plan, platform: 'flutterwave' },
      create: { userId, plan: data.plan, platform: 'flutterwave', flutterwaveTxId: txRef },
    });

    return { paymentLink, txRef, amount, currency };
  },

  async verifyFlutterwave(txRef: string) {
    // Belt-and-suspenders: verify the transaction server-side after the app receives the redirect
    let flwData: any;
    try {
      const flwRes = await fetch(
        `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
        { headers: { 'Authorization': `Bearer ${config.flutterwave.secretKey}` } }
      );
      flwData = await flwRes.json();
    } catch {
      throw Object.assign(new Error('Could not reach payment provider'), { status: 502 });
    }

    if (flwData.status !== 'success' || flwData.data?.status !== 'successful') {
      return { verified: false, paymentStatus: flwData.data?.status ?? 'unknown' };
    }

    const { amount, id: flwTxId } = flwData.data;

    const subscription = await prisma.subscription.findFirst({ where: { flutterwaveTxId: txRef } });
    if (!subscription) return { verified: true, activated: false, message: 'No matching subscription found' };

    // Idempotent — skip update if webhook already activated it
    if (subscription.status === 'ACTIVE') return { verified: true, activated: true, alreadyActive: true };

    const prices    = await PricingService.getPrices();
    const plan      = amount >= (prices.monthly + prices.annual) / 2 ? 'annual' : 'monthly';
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + (plan === 'annual' ? 365 : 30));

    await prisma.subscription.update({
      where: { id: subscription.id },
      data:  { status: 'ACTIVE', plan, periodEnd, flutterwaveTxId: String(flwTxId) },
    });
    await prisma.user.update({
      where: { id: subscription.userId },
      data:  { subscriptionStatus: 'ACTIVE' },
    });

    return { verified: true, activated: true, plan, periodEnd };
  },

  async handleFlutterwaveCallback(txRef: string, status: string) {
    const deepLink = `${config.flutterwave.redirectUrl}?status=${status}&tx_ref=${txRef}`;
    return { deepLink };
  },

  async createStripeCheckout(userId: string, data: StripeCheckoutInput) {
    // In production: use Stripe SDK
    // const session = await stripe.checkout.sessions.create({ ... })
    const sessionId = `cs_test_placeholder_${Date.now()}`;
    const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}`;
    return { checkoutUrl, sessionId };
  },

  async listMobileMoneyTransactions(params: { provider?: string; status?: string; plan?: string; page?: number; limit?: number } = {}) {
    const { provider, status, plan, page = 1, limit = 200 } = params;
    const skip = (page - 1) * limit;
    const where: any = { platform: 'flutterwave' };
    if (provider) where.mobileMoneyProvider = provider;
    if (status) where.status = status.toUpperCase();
    if (plan) where.plan = plan;

    const [transactions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.subscription.count({ where }),
    ]);
    return { transactions, total, page, limit };
  },

  async manualActivate(txId: string, adminId: string) {
    const subscription = await prisma.subscription.findUnique({ where: { id: txId } });
    if (!subscription) throw Object.assign(new Error('Transaction not found'), { status: 404 });

    await prisma.subscription.update({
      where: { id: txId },
      data: { status: 'ACTIVE', periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    await prisma.user.update({ where: { id: subscription.userId }, data: { subscriptionStatus: 'ACTIVE' } });
    await prisma.activityLog.create({
      data: { userId: subscription.userId, adminId, action: 'admin.payment.manual_activate', details: `Tx: ${txId}` },
    });
    return { message: 'Subscription manually activated' };
  },
};
