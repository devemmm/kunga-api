/**
 * Manual Payment Service
 *
 * Handles offline/bank-transfer payments submitted by users for admin review.
 * On approval, triggers the same subscription-activation logic used by
 * Flutterwave / Stripe so no other flows are affected.
 */

import { prisma } from '../lib/prisma.js';
import { sendSubscriptionActivatedEmail } from '../lib/email.js';

// ─── PLANS ────────────────────────────────────────────────────────────────────

export const PLAN_OPTIONS = [
  { value: 'gold_monthly',      label: 'Gold – Monthly',     days: 30  },
  { value: 'gold_quarterly',    label: 'Gold – Quarterly',   days: 90  },
  { value: 'gold_annual',       label: 'Gold – Annual',      days: 365 },
  { value: 'premium_monthly',   label: 'Premium – Monthly',  days: 30  },
  { value: 'premium_quarterly', label: 'Premium – Quarterly',days: 90  },
  { value: 'premium_annual',    label: 'Premium – Annual',   days: 365 },
] as const;

export type PlanValue = typeof PLAN_OPTIONS[number]['value'];

function daysForPlan(plan: string): number {
  return PLAN_OPTIONS.find(p => p.value === plan)?.days ?? 30;
}

// ─── TX REF GENERATOR ─────────────────────────────────────────────────────────

function generateTxRef(): string {
  const now   = new Date();
  const date  = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  const rand  = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `MNL-${date}-${rand}`;
}

// ─── USER-FACING ──────────────────────────────────────────────────────────────

export async function submitManualPayment(data: {
  userId:    string;
  plan:      string;
  amount:    number;
  currency:  string;
  notes?:    string;
  receiptUrl?: string;
  receiptKey?: string;
}) {
  // Validate plan
  if (!PLAN_OPTIONS.find(p => p.value === data.plan)) {
    throw Object.assign(new Error('Invalid plan'), { status: 400 });
  }
  if (data.amount <= 0) {
    throw Object.assign(new Error('Amount must be greater than 0'), { status: 400 });
  }

  // Ensure no duplicate PENDING submission for same user
  const existing = await prisma.manualPayment.findFirst({
    where: { userId: data.userId, status: 'PENDING' },
  });
  if (existing) {
    throw Object.assign(
      new Error('You already have a pending payment review. Please wait for it to be processed.'),
      { status: 409 },
    );
  }

  // Generate a unique txRef (retry on the vanishingly rare collision)
  let txRef = generateTxRef();
  let attempts = 0;
  while (attempts < 5) {
    const clash = await prisma.manualPayment.findUnique({ where: { txRef } });
    if (!clash) break;
    txRef = generateTxRef();
    attempts++;
  }

  const payment = await prisma.manualPayment.create({
    data: {
      txRef,
      userId:     data.userId,
      plan:       data.plan,
      amount:     data.amount,
      currency:   data.currency.toUpperCase(),
      notes:      data.notes?.trim() || null,
      receiptUrl: data.receiptUrl ?? null,
      receiptKey: data.receiptKey ?? null,
      status:     'PENDING',
    },
  });

  return payment;
}

export async function getMyManualPayments(userId: string) {
  return prisma.manualPayment.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, txRef: true, plan: true, amount: true, currency: true,
      status: true, receiptUrl: true, notes: true,
      rejectionReason: true, createdAt: true, resolvedAt: true,
    },
  });
}

// ─── ADMIN-FACING ─────────────────────────────────────────────────────────────

export async function listManualPayments(query: {
  status?:  string;
  search?:  string;
  page?:    number;
  limit?:   number;
}) {
  const page  = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, query.limit ?? 20);
  const skip  = (page - 1) * limit;

  const where: any = {};
  if (query.status && query.status !== 'ALL') where.status = query.status;
  if (query.search) {
    where.OR = [
      { txRef: { contains: query.search, mode: 'insensitive' } },
      { user:  { email: { contains: query.search, mode: 'insensitive' } } },
      { user:  { name:  { contains: query.search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.manualPayment.findMany({
      where,
      skip,
      take:    limit,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // PENDING first
      include: {
        user:     { select: { id: true, name: true, email: true, subscriptionStatus: true } },
        reviewer: { select: { id: true, name: true } },
      },
    }),
    prisma.manualPayment.count({ where }),
  ]);

  return { items, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getManualPaymentById(id: string) {
  const payment = await prisma.manualPayment.findUnique({
    where:   { id },
    include: {
      user:     { select: { id: true, name: true, email: true, subscriptionStatus: true, subscription: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  return payment;
}

export async function approveManualPayment(id: string, adminId: string, adminNotes?: string) {
  const payment = await prisma.manualPayment.findUnique({
    where:   { id },
    include: { user: true },
  });

  if (!payment)                      throw Object.assign(new Error('Payment not found'), { status: 404 });
  if (payment.status === 'APPROVED') throw Object.assign(new Error('Already approved'), { status: 409 });
  if (payment.status === 'REJECTED') throw Object.assign(new Error('Cannot approve a rejected payment. Create a new submission instead.'), { status: 409 });

  const days       = daysForPlan(payment.plan);
  const now        = new Date();
  const periodStart = now;
  const periodEnd  = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + days);

  await prisma.$transaction([
    // 1. Mark manual payment as approved
    prisma.manualPayment.update({
      where: { id },
      data: {
        status:     'APPROVED',
        reviewedBy: adminId,
        adminNotes: adminNotes?.trim() || null,
        resolvedAt: now,
      },
    }),

    // 2. Upsert subscription (same fields as Flutterwave flow)
    prisma.subscription.upsert({
      where:  { userId: payment.userId },
      create: {
        userId:      payment.userId,
        plan:        payment.plan,
        status:      'ACTIVE',
        platform:    'manual',
        periodStart,
        periodEnd,
        amount:      payment.amount,
        currency:    payment.currency,
      },
      update: {
        plan:        payment.plan,
        status:      'ACTIVE',
        platform:    'manual',
        periodStart,
        periodEnd,
        amount:      payment.amount,
        currency:    payment.currency,
        cancelledAt: null,
      },
    }),

    // 3. Update user subscription status
    prisma.user.update({
      where: { id: payment.userId },
      data:  { subscriptionStatus: 'ACTIVE' },
    }),

    // 4. Create an append-only PaymentTransaction log entry
    prisma.paymentTransaction.create({
      data: {
        userId:          payment.userId,
        platform:        'manual',
        txRef:           payment.txRef,
        plan:            payment.plan,
        amount:          payment.amount,
        currency:        payment.currency,
        status:          'SUCCESS',
        gatewayResponse: { manualPaymentId: id, approvedBy: adminId, adminNotes },
        resolvedAt:      now,
      },
    }),
  ]);

  // 5. Send activation email (best-effort, outside transaction)
  sendSubscriptionActivatedEmail(
    payment.user.email,
    payment.user.name ?? '',
    payment.plan,
    periodEnd,
  ).catch(() => {});

  return { approved: true, plan: payment.plan, periodEnd };
}

export async function rejectManualPayment(id: string, adminId: string, reason: string, adminNotes?: string) {
  const payment = await prisma.manualPayment.findUnique({ where: { id } });

  if (!payment)                      throw Object.assign(new Error('Payment not found'), { status: 404 });
  if (payment.status === 'APPROVED') throw Object.assign(new Error('Cannot reject an already approved payment'), { status: 409 });
  if (payment.status === 'REJECTED') throw Object.assign(new Error('Already rejected'), { status: 409 });
  if (!reason?.trim())               throw Object.assign(new Error('Rejection reason is required'), { status: 400 });

  await prisma.manualPayment.update({
    where: { id },
    data: {
      status:          'REJECTED',
      reviewedBy:      adminId,
      rejectionReason: reason.trim(),
      adminNotes:      adminNotes?.trim() || null,
      resolvedAt:      new Date(),
    },
  });

  return { rejected: true };
}

export async function getPendingCount(): Promise<number> {
  return prisma.manualPayment.count({ where: { status: 'PENDING' } });
}
