import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { RbacService } from './rbac.service.js';
import { config } from '../config/index.js';
import { sendPasswordResetEmail, sendWelcomeEmail, sendOtpEmail, sendMfaEnabledEmail, sendMfaDisabledEmail } from '../lib/email.js';
import type {
  RegisterInput,
  LoginInput,
  GoogleAuthInput,
  ResetPasswordInput,
  MfaVerifyInput,
} from '../models/auth.model.js';

// ─── MFA helpers ──────────────────────────────────────────────────────────────

const MFA_TTL      = 600;  // OTP valid for 10 minutes
const MFA_MAX_TRIES = 3;   // lock out after 3 wrong attempts

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function mfaKey(userId: string) { return `mfa:otp:${userId}`; }

async function storeMfaOtp(userId: string, otp: string): Promise<void> {
  await redis.set(mfaKey(userId), JSON.stringify({ otp, attempts: 0 }), 'EX', MFA_TTL);
}

async function verifyMfaOtp(userId: string, inputOtp: string): Promise<'ok' | 'invalid' | 'expired' | 'locked'> {
  const raw = await redis.get(mfaKey(userId));
  if (!raw) return 'expired';

  const record = JSON.parse(raw) as { otp: string; attempts: number };

  if (record.attempts >= MFA_MAX_TRIES) {
    await redis.del(mfaKey(userId));
    return 'locked';
  }

  if (record.otp !== inputOtp) {
    // Increment attempts, keep same TTL
    const ttl = await redis.ttl(mfaKey(userId));
    await redis.set(
      mfaKey(userId),
      JSON.stringify({ ...record, attempts: record.attempts + 1 }),
      'EX', ttl > 0 ? ttl : MFA_TTL,
    );
    return 'invalid';
  }

  await redis.del(mfaKey(userId)); // consume the OTP
  return 'ok';
}

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

  async login(server: FastifyInstance, data: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.passwordHash) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // ── MFA gate ─────────────────────────────────────────────────────────────
    if (user.mfaEnabled) {
      const otp = generateOtp();
      await storeMfaOtp(user.id, otp);
      sendOtpEmail(user.email, user.name ?? '', otp).catch(() => {});

      // Short-lived challenge token — only usable at /auth/mfa/verify
      const mfaToken = server.jwt.sign(
        { sub: user.id, type: 'mfa_challenge', email: user.email },
        { expiresIn: '10m' },
      );
      return { mfaRequired: true, mfaToken, maskedEmail: maskEmail(user.email) };
    }

    return { mfaRequired: false, user };
  },

  async verifyMfa(server: FastifyInstance, data: MfaVerifyInput) {
    // Validate the challenge token
    let payload: { sub: string; type: string; email: string };
    try {
      payload = server.jwt.verify(data.mfaToken) as typeof payload;
      if (payload.type !== 'mfa_challenge') throw new Error('Wrong token type');
    } catch {
      throw Object.assign(new Error('Invalid or expired MFA session. Please log in again.'), { status: 401 });
    }

    const result = await verifyMfaOtp(payload.sub, data.otp);

    if (result === 'expired') {
      throw Object.assign(new Error('Verification code has expired. Please log in again.'), { status: 401 });
    }
    if (result === 'locked') {
      throw Object.assign(new Error('Too many incorrect attempts. Please log in again.'), { status: 429 });
    }
    if (result === 'invalid') {
      throw Object.assign(new Error('Incorrect verification code. Please try again.'), { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    return { mfaRequired: false, user };
  },

  async resendMfa(server: FastifyInstance, mfaToken: string) {
    let payload: { sub: string; type: string; email: string };
    try {
      payload = server.jwt.verify(mfaToken) as typeof payload;
      if (payload.type !== 'mfa_challenge') throw new Error('Wrong token type');
    } catch {
      throw Object.assign(new Error('Invalid or expired MFA session. Please log in again.'), { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const otp = generateOtp();
    await storeMfaOtp(user.id, otp);
    sendOtpEmail(user.email, user.name ?? '', otp).catch(() => {});

    // Issue a fresh 10-min challenge token
    const newMfaToken = server.jwt.sign(
      { sub: user.id, type: 'mfa_challenge', email: user.email },
      { expiresIn: '10m' },
    );
    return { message: 'OTP resent', mfaToken: newMfaToken, maskedEmail: maskEmail(user.email) };
  },

  /** Sends an OTP to the current user's own email to confirm before enabling 2FA. */
  async sendMfaSetupOtp(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const otp = generateOtp();
    await storeMfaOtp(user.id, otp);
    sendOtpEmail(user.email, user.name ?? '', otp).catch(() => {});

    return { message: 'OTP sent', maskedEmail: maskEmail(user.email) };
  },

  /** Verifies the setup OTP and enables 2FA for the current user. */
  async verifyMfaSetup(userId: string, otp: string) {
    const result = await verifyMfaOtp(userId, otp);

    if (result === 'expired') {
      throw Object.assign(new Error('Verification code has expired. Please request a new one.'), { status: 401 });
    }
    if (result === 'locked') {
      throw Object.assign(new Error('Too many incorrect attempts. Please request a new code.'), { status: 429 });
    }
    if (result === 'invalid') {
      throw Object.assign(new Error('Incorrect verification code. Please try again.'), { status: 400 });
    }

    const updated = await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    const { passwordHash: _, ...user } = updated;
    sendMfaEnabledEmail(user.email, user.name ?? '').catch(() => {});
    return { user };
  },

  /** Sends an OTP to the current user's own email to confirm before disabling 2FA. */
  async sendMfaDisableOtp(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const otp = generateOtp();
    await storeMfaOtp(user.id, otp);
    sendOtpEmail(user.email, user.name ?? '', otp).catch(() => {});

    return { message: 'OTP sent', maskedEmail: maskEmail(user.email) };
  },

  /** Verifies the disable OTP and disables 2FA for the current user. */
  async verifyMfaDisable(userId: string, otp: string) {
    const result = await verifyMfaOtp(userId, otp);

    if (result === 'expired') {
      throw Object.assign(new Error('Verification code has expired. Please request a new one.'), { status: 401 });
    }
    if (result === 'locked') {
      throw Object.assign(new Error('Too many incorrect attempts. Please request a new code.'), { status: 429 });
    }
    if (result === 'invalid') {
      throw Object.assign(new Error('Incorrect verification code. Please try again.'), { status: 400 });
    }

    const updated = await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
    const { passwordHash: _, ...user } = updated;
    sendMfaDisabledEmail(user.email, user.name ?? '').catch(() => {});
    return { user };
  },

  async googleAuth(data: GoogleAuthInput) {
    let ticket;
    try {
      // Accept tokens issued for the web client, the iOS native client, or
      // the iOS-type client reused for the Android browser-redirect flow
      // (Android-type clients don't support that flow's redirect_uri).
      const audiences = [config.google.clientId, config.google.iosClientId, config.google.androidClientId]
        .filter(Boolean);
      ticket = await googleClient.verifyIdToken({
        idToken: data.idToken,
        audience: audiences,
      });
    } catch {
      throw Object.assign(new Error('Invalid Google ID token'), { status: 401 });
    }

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw Object.assign(new Error('Google token missing email'), { status: 400 });
    }

    const { sub: googleId, email, name = '', picture: avatarUrl } = payload;

    // Look up by googleId first (most specific), then fall back to email
    let user = await prisma.user.findUnique({ where: { googleId } }).catch(() => null)
      ?? await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: { email, name, googleId, avatarUrl, preferences: { create: {} } },
      });
    } else if (!user.googleId) {
      // Link googleId only if no other account already owns it
      const conflict = await prisma.user.findUnique({ where: { googleId } });
      if (!conflict) {
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
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const childProfile = await prisma.childProfile.findUnique({ where: { userId: user.id } });
    const isNewUser = !childProfile;
    return { user, isNewUser, childProfile };
  },

  async forgotPassword(server: FastifyInstance, email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetToken = server.jwt.sign(
        { sub: user.id, type: 'password_reset' },
        { expiresIn: '1h' },
      );
      // Send real password reset email via Resend (best-effort).
      // Admins reset via the admin portal; regular users via the public site.
      sendPasswordResetEmail(user.email, user.name ?? '', resetToken, user.role === 'ADMIN').catch(() => {});
    }
    // Always return same response to prevent email enumeration
    return { message: 'If that email exists, a reset link has been sent' };
  },

  async resetPassword(server: FastifyInstance, data: ResetPasswordInput) {
    let payload: { sub: string; type: string; iat: number };
    try {
      payload = server.jwt.verify(data.token) as typeof payload;
      if (payload.type !== 'password_reset') throw new Error('Wrong token type');
    } catch {
      throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });

    // Reject tokens issued before the most recent password reset, so a used
    // reset link can't be replayed within its remaining 1h validity window.
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
      throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
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

    if (rawUser.role === 'ADMIN') {
      const roleAssignments = await prisma.userRoleAssignment.findMany({
        where: { userId },
        include: { role: true },
      });
      const effective = await RbacService.getEffectivePermissions(userId);
      (user as any).roles = roleAssignments.map(ra => ({ id: ra.role.id, name: ra.role.name }));
      (user as any).effectivePermissions = effective === 'ALL' ? await RbacService.getAllPermissionCodes() : Array.from(effective);
    }

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Masks an email for display: "emmanuel@gmail.com" → "em***@gmail.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
