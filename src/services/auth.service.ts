import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../lib/email.js';
import type {
  RegisterInput,
  LoginInput,
  GoogleAuthInput,
  ResetPasswordInput,
} from '../models/auth.model.js';

const googleClient = new OAuth2Client(config.google.clientId);

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────

export function generateTokens(server: FastifyInstance, userId: string, role: string) {
  const accessToken = server.jwt.sign(
    { sub: userId, role },
    { expiresIn: config.jwt.accessExpires },
  );
  const refreshToken = server.jwt.sign(
    { sub: userId, type: 'refresh' },
    { expiresIn: config.jwt.refreshExpires },
  );
  return { accessToken, refreshToken };
}

// ─── AUTH SERVICE ─────────────────────────────────────────────────────────────

export const AuthService = {
  async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw Object.assign(new Error('Email already in use'), { status: 409 });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        preferences: { create: {} },
      },
    });

    // Send welcome email (best-effort — never blocks registration)
    sendWelcomeEmail(user.email, user.name ?? '').catch(() => {});

    return user;
  },

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.passwordHash) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return user;
  },

  async googleAuth(data: GoogleAuthInput) {
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: data.idToken,
        audience: config.google.clientId,
      });
    } catch {
      throw Object.assign(new Error('Invalid Google ID token'), { status: 401 });
    }

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw Object.assign(new Error('Google token missing email'), { status: 400 });
    }

    const { sub: googleId, email, name = '', picture: avatarUrl } = payload;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email, name, googleId, avatarUrl, preferences: { create: {} } },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl: avatarUrl ?? user.avatarUrl, lastLoginAt: new Date() },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const isNewUser = !(await prisma.childProfile.findUnique({ where: { userId: user.id } }));
    return { user, isNewUser };
  },

  async forgotPassword(server: FastifyInstance, email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetToken = server.jwt.sign(
        { sub: user.id, type: 'password_reset' },
        { expiresIn: '1h' },
      );
      // Send real password reset email via Resend (best-effort)
      sendPasswordResetEmail(user.email, user.name ?? '', resetToken).catch(() => {});
    }
    // Always return same response to prevent email enumeration
    return { message: 'If that email exists, a reset link has been sent' };
  },

  async resetPassword(server: FastifyInstance, data: ResetPasswordInput) {
    let payload: { sub: string; type: string };
    try {
      payload = server.jwt.verify(data.token) as typeof payload;
      if (payload.type !== 'password_reset') throw new Error('Wrong token type');
    } catch {
      throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({ where: { id: payload.sub }, data: { passwordHash } });
    return { message: 'Password updated successfully' };
  },

  async refreshTokens(server: FastifyInstance, refreshToken: string) {
    let payload: { sub: string; type: string };
    try {
      payload = server.jwt.verify(refreshToken) as typeof payload;
      if (payload.type !== 'refresh') throw new Error('Not a refresh token');
    } catch {
      throw Object.assign(new Error('Invalid or expired refresh token'), { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 401 });

    return { user, tokens: generateTokens(server, user.id, user.role) };
  },

  async getMe(userId: string) {
    const [rawUser, childProfile, subscription, preferences] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.childProfile.findUnique({ where: { userId } }),
      prisma.subscription.findUnique({ where: { userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
    ]);
    if (!rawUser) return { user: null, childProfile, subscription, preferences };
    const { passwordHash: _, ...user } = rawUser;
    return { user, childProfile, subscription, preferences };
  },

  async updateMe(userId: string, data: {
    name?:       string;
    avatarUrl?:  string;
    theme?:      string;   // "system" | "light" | "dark"
    lang?:       string;   // "en" | "fr" | "kin"
    mfaEnabled?: boolean;
  }) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name       !== undefined && { name:       data.name       }),
        ...(data.avatarUrl  !== undefined && { avatarUrl:  data.avatarUrl  }),
        ...(data.theme      !== undefined && { theme:      data.theme      }),
        ...(data.lang       !== undefined && { lang:       data.lang       }),
        ...(data.mfaEnabled !== undefined && { mfaEnabled: data.mfaEnabled }),
      },
    });
    const { passwordHash: _, ...user } = updated;
    return { user };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw Object.assign(new Error('No password set — use Google sign-in'), { status: 400 });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw Object.assign(new Error('Current password is incorrect'), { status: 401 });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password changed successfully' };
  },
};
