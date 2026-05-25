import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AuthService, generateTokens } from '../services/auth.service.js';
import { prisma } from '../lib/prisma.js';
import { randomUUID } from 'crypto';
import { uploadToMinio } from '../lib/minio.js';
import {
  RegisterDto, LoginDto, GoogleAuthDto,
  RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto,
} from '../models/auth.model.js';

export const AuthController = {
  async register(req: FastifyRequest, reply: FastifyReply) {
    const body = RegisterDto.parse(req.body);
    const user = await AuthService.register(body);
    const tokens = generateTokens(req.server as FastifyInstance, user.id, user.role);
    return reply.status(201).send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  },

  async login(req: FastifyRequest, reply: FastifyReply) {
    const body = LoginDto.parse(req.body);
    const user = await AuthService.login(body);
    const tokens = generateTokens(req.server as FastifyInstance, user.id, user.role);

    // Log login with IP + user-agent (fire-and-forget, never block the response)
    const ipAddress = ((req.headers['x-forwarded-for'] as string) ?? '').split(',')[0]?.trim() || (req as any).ip || 'unknown';
    const userAgent = (req.headers['user-agent'] as string) ?? '';
    prisma.activityLog.create({
      data: { userId: user.id, action: 'user.login', details: 'Admin panel sign-in', ipAddress, userAgent },
    }).catch(() => {/* non-critical */});

    return reply.send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, subscriptionStatus: user.subscriptionStatus, avatarUrl: user.avatarUrl ?? null },
      ...tokens,
    });
  },

  async googleAuth(req: FastifyRequest, reply: FastifyReply) {
    const body = GoogleAuthDto.parse(req.body);
    const { user, isNewUser } = await AuthService.googleAuth(body);
    const tokens = generateTokens(req.server as FastifyInstance, user.id, user.role);
    return reply.send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, subscriptionStatus: user.subscriptionStatus, isNewUser },
      ...tokens,
    });
  },

  async refresh(req: FastifyRequest, reply: FastifyReply) {
    const { refreshToken } = RefreshTokenDto.parse(req.body);
    const { tokens } = await AuthService.refreshTokens(req.server as FastifyInstance, refreshToken);
    return reply.send(tokens);
  },

  async forgotPassword(req: FastifyRequest, reply: FastifyReply) {
    const { email } = ForgotPasswordDto.parse(req.body);
    const result = await AuthService.forgotPassword(req.server as FastifyInstance, email);
    return reply.send(result);
  },

  async resetPassword(req: FastifyRequest, reply: FastifyReply) {
    const body = ResetPasswordDto.parse(req.body);
    const result = await AuthService.resetPassword(req.server as FastifyInstance, body);
    return reply.send(result);
  },

  async logout(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send({ message: 'Logged out successfully' });
  },

  async me(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = await AuthService.getMe(user.id);
    return reply.send(data);
  },

  async updateMe(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { name, avatarUrl, theme, lang, mfaEnabled } = req.body as {
      name?: string; avatarUrl?: string;
      theme?: string; lang?: string; mfaEnabled?: boolean;
    };
    return reply.send(await AuthService.updateMe(user.id, { name, avatarUrl, theme, lang, mfaEnabled }));
  },

  /** Upload avatar image to MinIO and update user's avatarUrl. */
  async uploadAvatar(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = await (req as any).file();
    if (!data) return reply.status(400).send({ error: 'No file provided' });

    const ext = (data.filename?.split('.').pop() ?? '').toLowerCase();
    const key = `avatars/${randomUUID()}${ext ? '.' + ext : ''}`;

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const contentType = data.mimetype || 'image/jpeg';
    const avatarUrl = await uploadToMinio(key, buffer, contentType);

    const result = await AuthService.updateMe(user.id, { avatarUrl });
    return reply.send({ avatarUrl, user: result.user });
  },

  async changePassword(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    return reply.send(await AuthService.changePassword(user.id, currentPassword, newPassword));
  },
};
