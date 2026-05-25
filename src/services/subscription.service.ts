import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
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
    await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: 'CANCELLED' } });
    await prisma.activityLog.create({ data: { userId, adminId, action: 'admin.subscription.cancel' } });
    return { message: 'Subscription cancelled' };
  },

  async restore(userId: string, adminId: string) {
    await prisma.subscription.update({
      where: { userId },
      data: { status: 'ACTIVE', cancelledAt: null, periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: 'ACTIVE' } });
    await prisma.activityLog.create({ data: { userId, adminId, action: 'admin.subscription.restore' } });
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

    const amount = data.plan === 'annual' ? 140 : 14;
    const txRef = `KB-${userId}-${Date.now()}`;

    // In production: POST https://api.flutterwave.com/v3/charges?type=mobile_money_...
    const checkoutUrl = `https://checkout.flutterwave.com/v3/hosted/pay?tx_ref=${txRef}&amount=${amount}&currency=${data.currency}&customer[email]=${user.email}&customizations[title]=Kunga Basics`;

    // Track pending subscription
    await prisma.subscription.upsert({
      where: { userId },
      update: { flutterwaveTxId: txRef, mobileMoneyProvider: data.provider, mobileMoneyPhone: data.phone },
      create: { userId, plan: data.plan, platform: 'flutterwave', flutterwaveTxId: txRef, mobileMoneyProvider: data.provider, mobileMoneyPhone: data.phone },
    });

    return { checkoutUrl, txRef, amount, currency: data.currency };
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
