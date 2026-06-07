import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import type { CreateVideoInput, UpdateVideoInput, VideoNoteInput } from '../models/index.js';

export const VideoService = {
  async listVideos(params: { moduleId?: string; type?: string; page?: number; limit?: number }) {
    const { moduleId, type, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (moduleId) where.moduleId = moduleId;
    if (type) where.type = type;

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
        include: { module: { select: { id: true, code: true, title: true } } },
      }),
      prisma.video.count({ where }),
    ]);

    return { videos, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async getStreamUrl(videoId: string, userId: string) {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw Object.assign(new Error('Video not found'), { status: 404 });

    // No video source attached yet — return gracefully so the mobile app can
    // display a friendly "coming soon" state instead of crashing.
    if (!video.cloudflareStreamId && !video.hlsUrl) {
      return {
        streamUrl:  null,
        hlsUrl:     null,
        noSource:   true,
        title:      video.title,
      };
    }

    // Preview clips are free — only enforce subscription for full content
    if (!video.isPreviewClip) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionStatus: true },
      });
      const activeStatuses = ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'];
      if (!activeStatuses.includes(user?.subscriptionStatus ?? '')) {
        throw Object.assign(new Error('Subscription required'), { status: 402 });
      }
    }

    // Use raw hlsUrl if provided (external CDN / direct upload)
    if (video.hlsUrl && !video.cloudflareStreamId) {
      return { streamUrl: video.hlsUrl, hlsUrl: video.hlsUrl, noSource: false, title: video.title };
    }

    // Cloudflare Stream — build the iframe-friendly URL
    const expiresAt = Math.floor(Date.now() / 1000) + config.app.streamUrlExpirySecs;
    const streamUrl = `https://customer-${config.cloudflare.accountId}.cloudflarestream.com/${video.cloudflareStreamId}/manifest/video.m3u8?token=SIGNED_TOKEN_HERE&expires=${expiresAt}`;

    // Track play event
    await prisma.activityLog.create({
      data: { userId, action: 'video.play', details: `Played video ${video.title}` },
    });

    return { streamUrl, hlsUrl: null, noSource: false, expiresAt, videoId: video.cloudflareStreamId };
  },

  async getUploadUrl(data: { moduleId: string; title: string; maxDurationSeconds: number }) {
    // In production: call Cloudflare Stream TUS API to get one-time upload URL
    // POST https://api.cloudflare.com/client/v4/accounts/{accountId}/stream
    const uploadUrl = `https://upload.videodelivery.net/tus/PLACEHOLDER_${Date.now()}`;
    return { uploadUrl, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
  },

  async createVideo(data: CreateVideoInput) {
    const { youtubeUrl, cloudflareVideoId, ...rest } = data as any;
    const video = await prisma.video.create({
      data: {
        ...rest,
        ...(youtubeUrl ? { hlsUrl: youtubeUrl } : {}),
        ...(cloudflareVideoId ? { cloudflareStreamId: cloudflareVideoId } : {}),
      },
      include: { module: true },
    });
    return { video };
  },

  async updateVideo(id: string, data: UpdateVideoInput) {
    const { youtubeUrl, cloudflareVideoId, ...rest } = data as any;
    const video = await prisma.video.update({
      where: { id },
      data: {
        ...rest,
        ...(youtubeUrl ? { hlsUrl: youtubeUrl } : {}),
        ...(cloudflareVideoId ? { cloudflareStreamId: cloudflareVideoId } : {}),
      },
    });
    return { video };
  },

  async deleteVideo(id: string) {
    await prisma.video.update({ where: { id }, data: { status: 'ARCHIVED' } });
    return { message: 'Video archived' };
  },

  async bookmarkVideo(videoId: string, userId: string, timestampSec = 0) {
    const existing = await prisma.videoBookmark.findFirst({ where: { videoId, userId } });
    if (existing) {
      await prisma.videoBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await prisma.videoBookmark.create({ data: { videoId, userId, timestampSec } });
    return { bookmarked: true };
  },

  async getNotes(videoId: string, userId: string) {
    const notes = await prisma.videoNote.findMany({
      where: { videoId, userId },
      orderBy: { timestampSec: 'asc' },
    });
    return { notes };
  },

  async addNote(videoId: string, userId: string, data: VideoNoteInput) {
    const note = await prisma.videoNote.create({ data: { videoId, userId, ...data } });
    return { note };
  },

  async updateNote(noteId: string, userId: string, noteText: string) {
    const existing = await prisma.videoNote.findUnique({ where: { id: noteId } });
    if (!existing) throw Object.assign(new Error('Note not found'), { status: 404 });
    if (existing.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
    const note = await prisma.videoNote.update({
      where: { id: noteId },
      data:  { noteText },
    });
    return { note };
  },

  async deleteNote(noteId: string, userId: string) {
    const existing = await prisma.videoNote.findUnique({ where: { id: noteId } });
    if (!existing) throw Object.assign(new Error('Note not found'), { status: 404 });
    if (existing.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
    await prisma.videoNote.delete({ where: { id: noteId } });
    return { message: 'Note deleted' };
  },
};
