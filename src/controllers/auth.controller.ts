import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AuthService, generateTokens } from '../services/auth.service.js';
import { prisma } from '../lib/prisma.js';
import { randomUUID } from 'crypto';
import { uploadToMinio } from '../lib/minio.js';
import {
  RegisterDto, LoginDto, GoogleAuthDto,
  RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto,
  MfaVerifyDto, MfaResendDto, MfaSetupVerifyDto, MfaDisableVerifyDto,
} from '../models/auth.model.js';

export const AuthController = {
  async sendRegistrationOtp(req: FastifyRequest, reply: FastifyReply) {
    const { email } = req.body as { email: string };
    const result = await AuthService.sendRegistrationOtp(email.trim().toLowerCase());
    return reply.send(result);
  },

  async resendRegistrationOtp(req: FastifyRequest, reply: FastifyReply) {
    const { email } = req.body as { email: string };
    const result = await AuthService.resendRegistrationOtp(email.trim().toLowerCase());
    return reply.send(result);
  },

  async register(req: FastifyRequest, reply: FastifyReply) {
    const body = RegisterDto.parse(req.body);
    const user = await AuthService.register(req.server as FastifyInstance, body as any);
    const tokens = generateTokens(req.server as FastifyInstance, user.id, user.role);
    return reply.status(201).send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  },

  async login(req: FastifyRequest, reply: FastifyReply) {
    const body   = LoginDto.parse(req.body);
    const result = await AuthService.login(req.server as FastifyInstance, body);

    // MFA required — return challenge token, not real tokens
    if (result.mfaRequired) {
      return reply.send({
        mfaRequired:  true,
        mfaToken:     result.mfaToken,
        maskedEmail:  result.maskedEmail,
      });
    }

    const { user } = result;
    const tokens = generateTokens(req.server as FastifyInstance, user!.id, user!.role);

    const ipAddress = ((req.headers['x-forwarded-for'] as string) ?? '').split(',')[0]?.trim() || (req as any).ip || 'unknown';
    const userAgent = (req.headers['user-agent'] as string) ?? '';
    const clientSource = req.headers['x-client-source'];
    const details      = clientSource === 'admin-portal' ? 'Admin panel sign-in' : 'App sign-in';
    prisma.activityLog.create({
      data: { userId: user!.id, action: 'user.login', details, ipAddress, userAgent },
    }).catch(() => {});

    return reply.send({
      user: { id: user!.id, email: user!.email, name: user!.name, role: user!.role, subscriptionStatus: user!.subscriptionStatus, avatarUrl: user!.avatarUrl ?? null, mfaEnabled: user!.mfaEnabled ?? false },
      ...tokens,
    });
  },

  async verifyMfa(req: FastifyRequest, reply: FastifyReply) {
    const body   = MfaVerifyDto.parse(req.body);
    const result = await AuthService.verifyMfa(req.server as FastifyInstance, body);
    const { user } = result;
    const tokens = generateTokens(req.server as FastifyInstance, user!.id, user!.role);

    // Log the successful 2FA login (the earlier /login call is not logged for MFA users)
    const ipAddress    = ((req.headers['x-forwarded-for'] as string) ?? '').split(',')[0]?.trim() || (req as any).ip || 'unknown';
    const userAgent    = (req.headers['user-agent'] as string) ?? '';
    const clientSource = req.headers['x-client-source'];
    const details      = clientSource === 'admin-portal' ? 'Admin panel sign-in' : 'App sign-in';
    prisma.activityLog.create({
      data: { userId: user!.id, action: 'user.login', details, ipAddress, userAgent },
    }).catch(() => {});

    return reply.send({
      user: { id: user!.id, email: user!.email, name: user!.name, role: user!.role, subscriptionStatus: user!.subscriptionStatus, avatarUrl: user!.avatarUrl ?? null, mfaEnabled: user!.mfaEnabled ?? false },
      ...tokens,
    });
  },

  async resendMfa(req: FastifyRequest, reply: FastifyReply) {
    const { mfaToken } = MfaResendDto.parse(req.body);
    return reply.send(await AuthService.resendMfa(req.server as FastifyInstance, mfaToken));
  },

  /** Sends an OTP to the current user's own email before enabling 2FA. */
  async sendMfaSetup(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    return reply.send(await AuthService.sendMfaSetupOtp(user.id));
  },

  /** Verifies the setup OTP and enables 2FA for the current user. */
  async verifyMfaSetup(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { otp } = MfaSetupVerifyDto.parse(req.body);
    const { user: updated } = await AuthService.verifyMfaSetup(user.id, otp);
    return reply.send({ user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, subscriptionStatus: updated.subscriptionStatus, avatarUrl: updated.avatarUrl ?? null, mfaEnabled: updated.mfaEnabled ?? false } });
  },

  /** Sends an OTP to the current user's own email before disabling 2FA. */
  async sendMfaDisable(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    return reply.send(await AuthService.sendMfaDisableOtp(user.id));
  },

  /** Verifies the disable OTP and disables 2FA for the current user. */
  async verifyMfaDisable(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { otp } = MfaDisableVerifyDto.parse(req.body);
    const { user: updated } = await AuthService.verifyMfaDisable(user.id, otp);
    return reply.send({ user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, subscriptionStatus: updated.subscriptionStatus, avatarUrl: updated.avatarUrl ?? null, mfaEnabled: updated.mfaEnabled ?? false } });
  },

  async googleAuth(req: FastifyRequest, reply: FastifyReply) {
    const body = GoogleAuthDto.parse(req.body);
    const { user, isNewUser, childProfile } = await AuthService.googleAuth(body);
    const tokens = generateTokens(req.server as FastifyInstance, user.id, user.role);
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        isNewUser,
        // Include childProfile so the mobile app can determine navigation without
        // a second /me request — null means the user still needs to complete setup
        childProfile: childProfile ?? null,
      },
      ...tokens,
    });
  },

  async appleAuth(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body as { identityToken: string; fullName?: string | null };
    if (!body?.identityToken) throw Object.assign(new Error('identityToken required'), { status: 400 });
    const { user, isNewUser, childProfile } = await AuthService.appleAuth(body);
    const tokens = generateTokens(req.server as FastifyInstance, user.id, user.role);
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        isNewUser,
        childProfile: childProfile ?? null,
      },
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

  async verifyPassword(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { password } = req.body as { password: string };
    return reply.send(await AuthService.verifyPassword(user.id, password));
  },
};
