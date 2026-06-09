import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import type { InitiateDonationInput, GrantScholarshipInput } from '../models/index.js';

export const DonationService = {
  async initiate(data: InitiateDonationInput) {
    const txRef = `DON-${Date.now()}`;
    let checkoutUrl: string;

    if (data.method === 'flutterwave') {
      try {
        const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.flutterwave.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tx_ref:       txRef,
            amount:       data.amount,
            currency:     data.currency ?? 'USD',
            redirect_url: 'kungabasics://donation',
            customer:     { email: data.email, name: data.donorName ?? data.email },
            customizations: {
              title:       'Kunga Basics',
              description: `Donation – ${data.campaign}`,
            },
          }),
        });
        const flwData = await flwRes.json() as any;
        if (!flwRes.ok || flwData.status !== 'success') {
          throw Object.assign(new Error(flwData?.message ?? 'Payment provider error'), { status: 502 });
        }
        checkoutUrl = flwData.data.link;
      } catch (err: any) {
        if (err.status) throw err;
        throw Object.assign(new Error('Failed to connect to payment provider'), { status: 502 });
      }
    } else {
      // In production: use Stripe PaymentIntents
      checkoutUrl = `https://checkout.stripe.com/c/pay/cs_donation_${txRef}`;
    }

    const donation = await prisma.donation.create({
      data: {
        amountUsd: data.amount,
        currency: data.currency,
        email: data.email,
        donorName: data.donorName,
        paymentMethod: data.method.toUpperCase() as any, // Prisma enum: STRIPE | FLUTTERWAVE
        campaign: data.campaign,
        showOnDonorWall: data.showOnDonorWall ?? false,
        status: 'PENDING',
        ...(data.method === 'flutterwave' ? { flutterwaveTxId: txRef } : { stripePaymentIntentId: txRef }),
      },
    });

    return { checkoutUrl, txRef, donation };
  },

  async list(params: { page?: number; limit?: number; status?: string } = {}) {
    const { page = 1, limit = 100, status } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status.toUpperCase();
    const [donations, total] = await Promise.all([
      prisma.donation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.donation.count({ where }),
    ]);
    return { donations, total, page, limit };
  },

  async getStats() {
    const [total, byMethod, scholarships, pendingCount] = await Promise.all([
      prisma.donation.aggregate({ where: { status: 'COMPLETED' }, _sum: { amountUsd: true } }),
      prisma.donation.groupBy({ by: ['paymentMethod'], where: { status: 'COMPLETED' }, _sum: { amountUsd: true }, _count: true }),
      prisma.scholarshipGrant.count({ where: { active: true } }),
      prisma.donation.count({ where: { status: 'PENDING' } }),
    ]);
    return { totalUsd: total._sum.amountUsd ?? 0, byMethod, activeScholarships: scholarships, pendingCount };
  },

  async getDonorWall() {
    return prisma.donation.findMany({
      where: { status: 'COMPLETED', showOnDonorWall: true },
      select: { donorName: true, amountUsd: true, campaign: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async grantScholarship(data: GrantScholarshipInput, adminId: string) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    const grant = await prisma.scholarshipGrant.create({
      data: { grantedBy: adminId, email: data.email, notes: data.notes, userId: user?.id },
    });

    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: 'SCHOLARSHIP' } });
      await prisma.subscription.upsert({
        where: { userId: user.id },
        update: { status: 'SCHOLARSHIP', platform: 'scholarship' },
        create: { userId: user.id, plan: 'scholarship', status: 'SCHOLARSHIP', platform: 'scholarship' },
      });
    }

    return { grant };
  },

  async listScholarships() {
    return prisma.scholarshipGrant.findMany({ where: { active: true }, orderBy: { grantedAt: 'desc' } });
  },
};
