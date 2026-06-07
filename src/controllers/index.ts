// ─── VIDEO CONTROLLER ────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from 'fastify';
import { VideoService } from '../services/video.service.js';
import { SubscriptionService, PaymentService } from '../services/subscription.service.js';
import { presignedPutMinio } from '../lib/minio.js';
import { randomUUID } from 'crypto';
import path from 'path';
import { DonationService } from '../services/donation.service.js';
import { AskGadService } from '../services/ask-gad.service.js';
import { AnnouncementService } from '../services/announcement.service.js';
import { AdminService, AnalyticsService, PricingService } from '../services/admin.service.js';
import {
  CreateVideoDto, UpdateVideoDto, VideoUploadUrlDto, VideoNoteDto,
  OverrideSubscriptionDto, RevenueCatSyncDto,
  FlutterwaveInitiateDto, StripeCheckoutDto,
  InitiateDonationDto, GrantScholarshipDto,
  AskGadSubmissionDto, AskGadResponseDto,
  CreateAnnouncementDto, UpdateAnnouncementDto,
} from '../models/index.js';

export const VideoController = {
  async list(req: FastifyRequest, reply: FastifyReply) {
    const { moduleId, type, page, limit } = req.query as any;
    return reply.send(await VideoService.listVideos({ moduleId, type, page: Number(page ?? 1), limit: Number(limit ?? 20) }));
  },
  async getStreamUrl(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const user = (req as any).currentUser;
    return reply.send(await VideoService.getStreamUrl(id, user.id));
  },
  async getUploadUrl(req: FastifyRequest, reply: FastifyReply) {
    const data = VideoUploadUrlDto.parse(req.body);
    return reply.send(await VideoService.getUploadUrl(data));
  },

  /**
   * Return a presigned MinIO PUT URL so the browser uploads the video file
   * DIRECTLY to MinIO — no buffering through the API server.
   * Query params: ?filename=my-video.mp4&contentType=video/mp4
   */
  async getMinioUploadUrl(req: FastifyRequest, reply: FastifyReply) {
    const { filename = 'video.mp4' } = req.query as { filename?: string };
    const ext = path.extname(filename).toLowerCase() || '.mp4';
    const key = `videos/${randomUUID()}${ext}`;
    const { uploadUrl, fileUrl } = await presignedPutMinio(key, 3600);
    return reply.send({ uploadUrl, fileUrl, key, expiresIn: 3600 });
  },
  async create(req: FastifyRequest, reply: FastifyReply) {
    const data = CreateVideoDto.parse(req.body);
    return reply.status(201).send(await VideoService.createVideo(data));
  },
  async update(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = UpdateVideoDto.parse(req.body);
    return reply.send(await VideoService.updateVideo(id, data));
  },
  async remove(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await VideoService.deleteVideo(id));
  },
  async bookmark(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { id } = req.params as { id: string };
    return reply.send(await VideoService.bookmarkVideo(id, user.id));
  },
  async getNotes(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { id } = req.params as { id: string };
    return reply.send(await VideoService.getNotes(id, user.id));
  },
  async addNote(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { id } = req.params as { id: string };
    const data = VideoNoteDto.parse(req.body);
    return reply.status(201).send(await VideoService.addNote(id, user.id, data));
  },

  async updateNote(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { noteId } = req.params as { noteId: string };
    const { noteText } = req.body as { noteText: string };
    if (!noteText?.trim()) throw Object.assign(new Error('noteText is required'), { status: 400 });
    return reply.send(await VideoService.updateNote(noteId, user.id, noteText.trim()));
  },

  async deleteNote(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { noteId } = req.params as { noteId: string };
    return reply.send(await VideoService.deleteNote(noteId, user.id));
  },
};

// ─── SUBSCRIPTION CONTROLLER ─────────────────────────────────────────────────

export const SubscriptionController = {
  async getStatus(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    return reply.send(await SubscriptionService.getStatus(user.id));
  },
  async list(req: FastifyRequest, reply: FastifyReply) {
    const { platform, status, plan, search, page, limit } = req.query as any;
    return reply.send(await SubscriptionService.listSubscriptions({ platform, status, plan, search, page: Number(page ?? 1), limit: Number(limit ?? 20) }));
  },
  async override(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const { userId } = req.params as { userId: string };
    const data = OverrideSubscriptionDto.parse(req.body);
    return reply.send(await SubscriptionService.override(userId, data, admin.id));
  },
  async cancel(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const { userId } = req.params as { userId: string };
    return reply.send(await SubscriptionService.cancel(userId, admin.id));
  },
  async restore(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const { userId } = req.params as { userId: string };
    return reply.send(await SubscriptionService.restore(userId, admin.id));
  },
  async syncRevenueCat(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = RevenueCatSyncDto.parse(req.body);
    return reply.send(await SubscriptionService.syncFromRevenueCat(user.id, data));
  },
};

// ─── PAYMENT CONTROLLER ──────────────────────────────────────────────────────

export const PaymentController = {
  async initiateFlutterwave(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = FlutterwaveInitiateDto.parse(req.body);
    return reply.send(await PaymentService.initiateFlutterwave(user.id, data));
  },
  async flutterwaveCallback(req: FastifyRequest, reply: FastifyReply) {
    const { tx_ref, status } = req.query as { tx_ref: string; status: string };
    const { deepLink } = await PaymentService.handleFlutterwaveCallback(tx_ref, status);
    return reply.redirect(deepLink);
  },
  async stripeCheckout(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = StripeCheckoutDto.parse(req.body);
    return reply.send(await PaymentService.createStripeCheckout(user.id, data));
  },
  async listMobileMoney(req: FastifyRequest, reply: FastifyReply) {
    const { provider, status, plan, page, limit } = req.query as any;
    return reply.send(await PaymentService.listMobileMoneyTransactions({ provider, status, plan, page: Number(page ?? 1), limit: Number(limit ?? 20) }));
  },
  async verifyFlutterwave(req: FastifyRequest, reply: FastifyReply) {
    const { tx_ref } = req.query as { tx_ref?: string };
    if (!tx_ref) return reply.status(400).send({ error: 'tx_ref query param is required' });
    return reply.send(await PaymentService.verifyFlutterwave(tx_ref));
  },
  async manualActivate(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const { txId } = req.params as { txId: string };
    return reply.send(await PaymentService.manualActivate(txId, admin.id));
  },
};

// ─── DONATION CONTROLLER ─────────────────────────────────────────────────────

export const DonationController = {
  async initiate(req: FastifyRequest, reply: FastifyReply) {
    const data = InitiateDonationDto.parse(req.body);
    return reply.status(201).send(await DonationService.initiate(data));
  },
  async list(req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await DonationService.list(req.query as any));
  },
  async getStats(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await DonationService.getStats());
  },
  async getDonorWall(_req: FastifyRequest, reply: FastifyReply) {
    const donors = await DonationService.getDonorWall();
    return reply.send({ donors });
  },
  async grantScholarship(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const data = GrantScholarshipDto.parse(req.body);
    return reply.status(201).send(await DonationService.grantScholarship(data, admin.id));
  },
  async listScholarships(_req: FastifyRequest, reply: FastifyReply) {
    const grants = await DonationService.listScholarships();
    return reply.send({ grants });
  },
};

// ─── ASK DR. GAD CONTROLLER ──────────────────────────────────────────────────

export const AskGadController = {
  async list(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    return reply.send(await AskGadService.list(user.id)); // { submissions, monthlyLimit }
  },
  async submit(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = AskGadSubmissionDto.parse(req.body);
    return reply.status(201).send(await AskGadService.submit(user.id, data));
  },
  async getUploadUrl(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AskGadService.getUploadUrl());
  },
  async getQueue(req: FastifyRequest, reply: FastifyReply) {
    const { status, search, page, limit } = req.query as any;
    const result = await AskGadService.getQueue({ status, search, page: Number(page ?? 1), limit: Number(limit ?? 50) });
    return reply.send(result);
  },

  async getById(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await AskGadService.getById(id));
  },
  async respond(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = AskGadResponseDto.parse(req.body);
    return reply.send(await AskGadService.respond(id, data));
  },
  async getResponseUploadUrl(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AskGadService.getResponseUploadUrl());
  },

  async purchaseCredit(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    return reply.status(201).send(await AskGadService.purchaseCredit(user.id));
  },

  async verifyCredit(req: FastifyRequest, reply: FastifyReply) {
    const { tx_ref } = req.query as { tx_ref?: string };
    if (!tx_ref) return reply.status(400).send({ error: 'tx_ref is required' });
    return reply.send(await AskGadService.verifyCredit(tx_ref));
  },
};

// ─── ANNOUNCEMENT CONTROLLER ─────────────────────────────────────────────────

export const AnnouncementController = {
  async getActive(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const announcements = await AnnouncementService.getActive(user.id, req);
    return reply.send({ announcements });
  },
  async getActiveBanner(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const banner = await AnnouncementService.getActiveBanner(user.id, req);
    return reply.send({ banner });
  },
  async dismiss(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { id } = req.params as { id: string };
    return reply.send(await AnnouncementService.dismiss(id, user.id));
  },
  async list(_req: FastifyRequest, reply: FastifyReply) {
    const announcements = await AnnouncementService.list();
    return reply.send({ announcements });
  },
  async create(req: FastifyRequest, reply: FastifyReply) {
    const data = CreateAnnouncementDto.parse(req.body);
    return reply.status(201).send(await AnnouncementService.create(data));
  },
  async update(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = UpdateAnnouncementDto.parse(req.body);
    return reply.send(await AnnouncementService.update(id, data));
  },
  async remove(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await AnnouncementService.delete(id));
  },
  async publish(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await AnnouncementService.publish(id));
  },
};

// ─── ADMIN CONTROLLER ────────────────────────────────────────────────────────

export const AdminController = {
  async getDashboard(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AdminService.getDashboard());
  },
  async getActivityLog(req: FastifyRequest, reply: FastifyReply) {
    const { page, limit } = req.query as any;
    return reply.send(await AdminService.getActivityLog(Number(page ?? 1), Number(limit ?? 30)));
  },
  async getModuleStats(_req: FastifyRequest, reply: FastifyReply) {
    const stats = await AdminService.getModuleStats();
    return reply.send({ stats });
  },
  async getPaymentStats(_req: FastifyRequest, reply: FastifyReply) {
    const stats = await AdminService.getPaymentStats();
    return reply.send({ stats });
  },
  async getSignupTrend(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AdminService.getSignupTrend());
  },
  async getSigninTrend(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AdminService.getSigninTrend());
  },
  async getLiveUsers(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AdminService.getLiveUsers());
  },
};

// ─── ANALYTICS CONTROLLER ────────────────────────────────────────────────────

export const AnalyticsController = {
  async getOverview(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AnalyticsService.getOverview());
  },
  async getFunnel(_req: FastifyRequest, reply: FastifyReply) {
    const funnel = await AnalyticsService.getFunnel();
    return reply.send({ funnel });
  },
  async getRetention(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AnalyticsService.getRetention());
  },
  async getMobileMoney(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await AnalyticsService.getMobileMoney());
  },
};

// ─── PRICING CONTROLLER ──────────────────────────────────────────────────────

export const PricingController = {
  async getAll(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await PricingService.getAll());
  },
  async set(req: FastifyRequest, reply: FastifyReply) {
    const { key, value } = req.body as { key: string; value: string };
    if (!key || value === undefined) return reply.status(400).send({ error: 'key and value are required' });
    return reply.send(await PricingService.set(key, String(value)));
  },
};
