import path from 'node:path';
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
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, childProfile: { select: { childName: true, ageMonths: true } } } } },
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
    const sub  = await prisma.subscription.update({ where: { userId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const user = await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: 'CANCELLED' } });
    await prisma.activityLog.create({ data: { userId, adminId, action: 'admin.subscription.cancel' } });
    sendSubscriptionCancelledEmail(user.email, user.name ?? '', sub.periodEnd ?? undefined).catch(() => {});
    return { message: 'Subscription cancelled' };
  },

  async restore(userId: string, adminId: string) {
    const newPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const sub  = await prisma.subscription.update({
      where: { userId },
      data:  { status: 'ACTIVE', cancelledAt: null, periodEnd: newPeriodEnd },
    });
    const user = await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: 'ACTIVE' } });
    await prisma.activityLog.create({ data: { userId, adminId, action: 'admin.subscription.restore' } });
    sendSubscriptionRestoredEmail(user.email, user.name ?? '', sub.plan, newPeriodEnd).catch(() => {});
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

    // Resolve tier + period from combined plan string (e.g. 'gold_monthly') or separate fields
    const resolvedTier   = data.tier   ?? (data.plan.startsWith('gold') ? 'gold' : 'premium');
    const resolvedPeriod = data.period ?? (data.plan.replace(/^(gold|premium)_/, '') as 'monthly' | 'quarterly' | 'annual');
    const priceKey = `price_${resolvedTier}_${resolvedPeriod}` as const;
    const priceRaw = await PricingService.get(priceKey as any).catch(() => null);
    const amount   = parseFloat(priceRaw ?? '') || (resolvedPeriod === 'annual' ? 141 : resolvedPeriod === 'quarterly' ? 39 : 15);
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
          redirect_url: 'kungabasics://payment',
          meta: { userId, tier: resolvedTier, period: resolvedPeriod, plan: data.plan },
          customer: { email: user.email, name: user.name ?? user.email },
          customizations: {
            title:       'Kunga Basics',
            description: `${resolvedTier.charAt(0).toUpperCase() + resolvedTier.slice(1)} ${resolvedPeriod} plan – child development program`,
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

    const plan = `${resolvedTier}_${resolvedPeriod}`;

    // Record a pending subscription so we can link the webhook / verify back to the user
    await prisma.subscription.upsert({
      where:  { userId },
      update: { flutterwaveTxId: txRef, plan, platform: 'flutterwave', amount, currency },
      create: { userId, plan, platform: 'flutterwave', flutterwaveTxId: txRef, amount, currency },
    });

    // Append-only transaction log
    await prisma.paymentTransaction.create({
      data: { userId, platform: 'flutterwave', txRef, plan, amount, currency, status: 'PENDING' },
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
      // Use payment-level reason only — flwData.message is the API call status ("Transaction fetched successfully"), not a failure reason
      const failureReason = flwData.data?.processor_response ?? flwData.data?.auth_model ?? flwData.data?.status ?? 'Payment unsuccessful';
      await prisma.paymentTransaction.updateMany({
        where:  { txRef, status: 'PENDING' },
        data:   { status: 'FAILED', failureReason, gatewayResponse: flwData, resolvedAt: new Date() },
      });
      return { verified: false, paymentStatus: flwData.data?.status ?? 'unknown', failureReason };
    }

    const { amount, id: flwTxId, processor_response, card } = flwData.data;

    const subscription = await prisma.subscription.findFirst({ where: { flutterwaveTxId: txRef } });
    if (!subscription) return { verified: true, activated: false, message: 'No matching subscription found' };

    // Idempotent — skip only if this exact numeric transaction ID already activated this row
    if (subscription.status === 'ACTIVE' && subscription.flutterwaveTxId === String(flwTxId)) {
      return { verified: true, activated: true, alreadyActive: true };
    }

    const plan      = subscription.plan;
    const isAnnual  = plan.includes('annual');
    const isQtrly   = plan.includes('quarterly');
    const days      = isAnnual ? 365 : isQtrly ? 90 : 30;
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + days);

    await prisma.subscription.update({
      where: { id: subscription.id },
      data:  {
        status: 'ACTIVE', plan, periodEnd, flutterwaveTxId: String(flwTxId),
        ...(card?.last_4digits && { cardLast4: card.last_4digits }),
        ...(card?.type         && { cardBrand: card.type }),
      },
    });
    await prisma.user.update({
      where: { id: subscription.userId },
      data:  { subscriptionStatus: 'ACTIVE' },
    });

    // Resolve the pending transaction log to SUCCESS
    await prisma.paymentTransaction.updateMany({
      where: { txRef, status: 'PENDING' },
      data:  {
        status: 'SUCCESS', gatewayTxId: String(flwTxId),
        gatewayResponse: flwData.data, resolvedAt: new Date(),
      },
    });

    return { verified: true, activated: true, plan, periodEnd };
  },

  async handleFlutterwaveCallback(txRef: string, status: string) {
    if (txRef) {
      if (txRef.startsWith('DON-')) {
        // Donation callback — verify with Flutterwave and update Donation record
        try {
          const flwRes  = await fetch(
            `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
            { headers: { 'Authorization': `Bearer ${config.flutterwave.secretKey}` } },
          );
          const flwData = await flwRes.json() as any;
          const verified = flwData.status === 'success' && flwData.data?.status === 'successful';
          await prisma.donation.updateMany({
            where: { flutterwaveTxId: txRef, status: 'PENDING' },
            data:  { status: verified ? 'COMPLETED' : 'FAILED' },
          });
        } catch { /* swallow — redirect still proceeds */ }
      } else {
        // Subscription callback
        if (status === 'successful') {
          try { await PaymentService.verifyFlutterwave(txRef); } catch {}
        }
      }
    }
    const deepLink = `${config.app.deepLinkScheme}://payment?status=${status}&tx_ref=${encodeURIComponent(txRef)}`;
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

  async listTransactions(params: {
    platform?: string; status?: string; plan?: string; search?: string;
    page?: number; limit?: number; from?: string; to?: string;
  }) {
    const { platform, status, plan, search, page = 1, limit = 50, from, to } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (platform) where.platform = platform;
    if (status)   where.status   = status.toUpperCase();
    if (plan)     where.plan     = plan;
    if (from || to) {
      where.initiatedAt = {};
      if (from) where.initiatedAt.gte = new Date(from);
      if (to)   where.initiatedAt.lte = new Date(to);
    }
    if (search) {
      where.user = { OR: [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]};
    }

    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where, skip, take: limit,
        orderBy: { initiatedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true, name: true, email: true, avatarUrl: true,
              phone: true, role: true, subscriptionStatus: true,
              isActive: true, createdAt: true, lastLoginAt: true,
              childProfile: { select: { childName: true, ageMonths: true, challenges: true } },
              subscription: {
                select: {
                  plan: true, status: true, platform: true,
                  periodStart: true, periodEnd: true, cancelledAt: true,
                  cardLast4: true, cardBrand: true,
                  mobileMoneyProvider: true, mobileMoneyPhone: true,
                },
              },
            },
          },
        },
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    const stats = await prisma.paymentTransaction.groupBy({
      by: ['status'],
      _count: { status: true },
      where: platform ? { platform } : undefined,
    });

    return { transactions, total, page, limit, stats };
  },

  async generateReceiptPdf(userId: string, txId: string): Promise<Buffer> {
    const tx = await prisma.paymentTransaction.findFirst({
      where: { id: txId, userId },
      select: { id: true, platform: true, plan: true, amount: true, currency: true,
                status: true, failureReason: true, initiatedAt: true, resolvedAt: true, txRef: true },
    });
    if (!tx) throw Object.assign(new Error('Transaction not found'), { status: 404 });

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const fmt = (d: Date | null | undefined) => d ? new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const amt = tx.amount != null ? `${tx.currency ?? 'USD'} ${Number(tx.amount).toFixed(2)}` : '—';
    const statusColors: Record<string, string> = { SUCCESS: '#10b981', PENDING: '#f59e0b', FAILED: '#ef4444', CANCELLED: '#6b7280' };
    const color = statusColors[tx.status ?? ''] ?? '#6b7280';

    // ── Header band ───────────────────────────────────────────────────────────
    const W = doc.page.width;
    doc.rect(0, 0, W, 130).fill('#0d9488');
    // subtle dark overlay stripe at bottom of band
    doc.rect(0, 110, W, 20).fill('#0a7a70');

    // App logo
    const logoPath = path.resolve(__dirname, '../../assets/logo.png');
    doc.image(logoPath, 46, 18, { width: 82, height: 82 });

    // Company name + document type
    const tx0 = 46 + 82 + 14;
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('Kunga Basics', tx0, 30);
    doc.fillColor('rgba(255,255,255,0.75)').fontSize(10).font('Helvetica').text('PAYMENT RECEIPT', tx0, 58);

    // Status badge (top-right)
    const badgeBg: Record<string, string> = { SUCCESS: '#10b981', PENDING: '#f59e0b', FAILED: '#ef4444', CANCELLED: '#6b7280' };
    const badgeColor = badgeBg[tx.status ?? ''] ?? '#6b7280';
    const badgeLabel = tx.status ?? '—';
    doc.roundedRect(W - 120, 32, 90, 26, 13).fill(badgeColor);
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(badgeLabel, W - 120, 39, { width: 90, align: 'center' });

    // Receipt ID in dark stripe
    doc.fillColor('rgba(255,255,255,0.6)').fontSize(8).font('Helvetica')
       .text(`Receipt #${tx.id.slice(-8).toUpperCase()}`, tx0, 115, { lineBreak: false })
       .text(new Date().toLocaleDateString('en-US', { dateStyle: 'long' }), tx0 + 160, 115, { lineBreak: false });

    // ── Amount hero ───────────────────────────────────────────────────────────
    doc.fillColor('#111827').fontSize(28).font('Helvetica-Bold').text(amt, 50, 155, { align: 'center' });

    // ── Divider ───────────────────────────────────────────────────────────────
    doc.moveTo(50, 205).lineTo(doc.page.width - 50, 205).strokeColor('#e5e7eb').stroke();

    // ── Detail rows ───────────────────────────────────────────────────────────
    const rows: [string, string][] = [
      ['Transaction ID', tx.id],
      ['Reference',      tx.txRef ?? '—'],
      ['Plan',           tx.plan ?? '—'],
      ['Platform',       tx.platform ?? '—'],
      ['Amount',         amt],
      ['Currency',       tx.currency ?? '—'],
      ['Status',         tx.status ?? '—'],
      ['Initiated',      fmt(tx.initiatedAt)],
      ['Resolved',       fmt(tx.resolvedAt)],
      ...(tx.failureReason ? [['Failure Reason', tx.failureReason] as [string, string]] : []),
    ];

    let y = 225;
    for (const [label, value] of rows) {
      doc.fillColor('#6b7280').fontSize(10).font('Helvetica').text(label, 50, y);
      doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text(value, 220, y, { width: 325 });
      y += 26;
      doc.moveTo(50, y - 4).lineTo(doc.page.width - 50, y - 4).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.fillColor('#9ca3af').fontSize(9).font('Helvetica')
       .text(`Generated on ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} · Kunga Basics`, 50, footerY + 12, { align: 'center' });

    doc.end();
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  },

  async getUserPaymentHistory(userId: string, page = 1, limit = 20, status?: string) {
    // Donation statuses map to PaymentTransaction statuses for unified display
    const donationStatusMap: Record<string, string> = {
      COMPLETED: 'SUCCESS', PENDING: 'PENDING', FAILED: 'FAILED', CANCELLED: 'CANCELLED',
    };

    const [rawTxns, rawDonations] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { userId, ...(status ? { status } : {}) },
        orderBy: { initiatedAt: 'desc' },
        select: {
          id: true, platform: true, plan: true, amount: true, currency: true,
          status: true, failureReason: true, initiatedAt: true, resolvedAt: true, txRef: true,
        },
      }),
      prisma.donation.findMany({
        where: {
          userId,
          ...(status
            ? { status: (Object.entries(donationStatusMap).find(([, v]) => v === status)?.[0] as any) }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, amountUsd: true, currency: true, status: true,
          paymentMethod: true, campaign: true, createdAt: true,
        },
      }),
    ]);

    // Normalise donations to the same shape as PaymentTransaction rows
    const donationRows = rawDonations.map(d => ({
      id:            d.id,
      platform:      d.paymentMethod as string,
      plan:          d.campaign ?? 'donation',
      amount:        d.amountUsd,
      currency:      d.currency,
      status:        donationStatusMap[d.status] ?? d.status,
      failureReason: null as string | null,
      initiatedAt:   d.createdAt,
      resolvedAt:    null as Date | null,
      txRef:         null as string | null,
      type:          'donation' as const,
    }));

    const txRows = rawTxns.map(t => ({ ...t, type: 'subscription' as const }));

    // Merge and sort by date desc, then paginate
    const merged = [...txRows, ...donationRows].sort(
      (a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime(),
    );
    const total        = merged.length;
    const transactions = merged.slice((page - 1) * limit, page * limit);
    return { transactions, total, page, limit };
  },

  async exportHistoryPdf(userId: string, status?: string): Promise<Buffer> {
    const where = { userId, ...(status ? { status } : {}) };
    const transactions = await prisma.paymentTransaction.findMany({
      where,
      orderBy: { initiatedAt: 'desc' },
      select: {
        id: true, platform: true, plan: true, amount: true, currency: true,
        status: true, failureReason: true, initiatedAt: true, resolvedAt: true, txRef: true,
      },
    });

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const fmt = (d: Date | null | undefined) =>
      d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—';
    const amt = (tx: any) =>
      tx.amount != null ? `${tx.currency ?? 'USD'} ${Number(tx.amount).toFixed(2)}` : '—';
    const statusColors: Record<string, string> = {
      SUCCESS: '#10b981', PENDING: '#f59e0b', FAILED: '#ef4444', CANCELLED: '#6b7280',
    };
    const totalPaid = transactions
      .filter(tx => tx.status === 'SUCCESS')
      .reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
    const currency = transactions.find(tx => tx.currency)?.currency ?? 'USD';

    // ── Header ────────────────────────────────────────────────────────────────
    const W = doc.page.width;
    doc.rect(0, 0, W, 120).fill('#0d9488');
    doc.rect(0, 100, W, 20).fill('#0a7a70');

    // App logo
    const logoPath = path.resolve(__dirname, '../../assets/logo.png');
    doc.image(logoPath, 46, 16, { width: 74, height: 74 });

    const tx0 = 46 + 74 + 14;
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('Kunga Basics', tx0, 24);
    doc.fillColor('rgba(255,255,255,0.75)').fontSize(9).font('Helvetica').text('PAYMENT HISTORY EXPORT', tx0, 52);

    // Stats summary (right side)
    const filterLabel = status ? status.charAt(0) + status.slice(1).toLowerCase() : 'All';
    const statsX = W - 220;
    doc.fillColor('rgba(255,255,255,0.55)').fontSize(8).font('Helvetica').text('TRANSACTIONS', statsX, 28, { width: 80, align: 'center' });
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text(String(transactions.length), statsX, 40, { width: 80, align: 'center' });
    doc.fillColor('rgba(255,255,255,0.55)').fontSize(8).font('Helvetica').text('TOTAL PAID', statsX + 100, 28, { width: 80, align: 'center' });
    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold').text(`${currency} ${totalPaid.toFixed(2)}`, statsX + 100, 42, { width: 80, align: 'center' });

    // Filter label in dark stripe
    doc.fillColor('rgba(255,255,255,0.6)').fontSize(8).font('Helvetica')
       .text(`Filter: ${filterLabel}`, tx0, 107, { lineBreak: false })
       .text(new Date().toLocaleDateString('en-US', { dateStyle: 'long' }), tx0 + 100, 107, { lineBreak: false });

    // ── Table header ──────────────────────────────────────────────────────────
    const cols = { date: 50, plan: 130, platform: 265, amount: 360, status: 445 };
    const headerY = 140;
    doc.rect(50, headerY, doc.page.width - 100, 22).fill('#f3f4f6');
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold');
    doc.text('DATE',     cols.date,     headerY + 7);
    doc.text('PLAN',     cols.plan,     headerY + 7);
    doc.text('PLATFORM', cols.platform, headerY + 7);
    doc.text('AMOUNT',   cols.amount,   headerY + 7);
    doc.text('STATUS',   cols.status,   headerY + 7);

    // ── Rows ──────────────────────────────────────────────────────────────────
    let y = headerY + 28;
    for (const tx of transactions) {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 60;
      }
      const color = statusColors[tx.status ?? ''] ?? '#6b7280';
      const rowH  = 22;
      if (transactions.indexOf(tx) % 2 === 0) {
        doc.rect(50, y - 4, doc.page.width - 100, rowH).fill('#fafafa').fillColor('#111827');
      }
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica');
      doc.text(fmt(tx.initiatedAt),                    cols.date,     y, { width: 75 });
      doc.text((tx.plan ?? '—').replace('_', ' · '),   cols.plan,     y, { width: 130 });
      doc.text(tx.platform ?? '—',                     cols.platform, y, { width: 90 });
      doc.text(amt(tx),                                cols.amount,   y, { width: 80 });
      doc.fillColor(color).font('Helvetica-Bold')
         .text(tx.status ?? '—',                       cols.status,   y, { width: 80 });
      y += rowH;
      doc.moveTo(50, y - 2).lineTo(doc.page.width - 50, y - 2).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
       .text(`Generated on ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} · Kunga Basics`, 50, footerY + 10, { align: 'center' });

    doc.end();
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
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
