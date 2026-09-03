import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { CountryService } from '../services/country.service.js';

// Blocks sign-in / register / password reset from unavailable/maintenance countries.
// Requests from the admin portal carry X-Platform: admin and are always allowed through.
async function requireCountryAccess(type: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers['x-platform'] === 'admin') return;
    const access = await CountryService.checkAccess(req);
    if (!access.allowed) {
      await CountryService.recordAttempt(req, type);
      return reply.status(403).send({
        error:       'service_unavailable',
        status:      access.status,
        countryCode: access.countryCode,
        countryName: access.countryName,
        countryFlag: access.countryFlag,
        launchDate:  access.launchDate,
      });
    }
  };
}

export async function authRoutes(server: FastifyInstance) {
  const countrySignin    = await requireCountryAccess('signin');
  const countryRegister  = await requireCountryAccess('register');
  const countryReset     = await requireCountryAccess('reset_password');

  server.post('/register', {
    schema: {
      tags: ['Auth'], summary: 'Register with email & password',
      body: {
        type: 'object', required: ['email', 'name', 'password', 'otp'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 2 },
          password: { type: 'string', minLength: 8 },
          otp: { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            user: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } } },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    preHandler: [countryRegister],
  }, AuthController.register);

  server.post('/send-registration-otp', {
    schema: {
      tags: ['Auth'], summary: 'Send OTP to email before registration — no account created yet',
      body: {
        type: 'object', required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
    preHandler: [countryRegister],
  }, AuthController.sendRegistrationOtp);

  server.post('/resend-registration-otp', {
    schema: {
      tags: ['Auth'], summary: 'Resend registration OTP',
      body: {
        type: 'object', required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
    preHandler: [countryRegister],
  }, AuthController.resendRegistrationOtp);

  server.post('/login', {
    schema: {
      tags: ['Auth'], summary: 'Login with email & password',
      body: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
    },
    preHandler: [countrySignin],
  }, AuthController.login);

  server.post('/google', {
    schema: {
      tags: ['Auth'], summary: 'Google Sign-In — exchange Google ID token for app JWT',
      body: {
        type: 'object', required: ['idToken'],
        properties: { idToken: { type: 'string' } },
      },
    },
    preHandler: [countrySignin],
  }, AuthController.googleAuth);

  server.post('/apple', {
    schema: {
      tags: ['Auth'], summary: 'Sign in with Apple — exchange Apple identity token for app JWT',
      body: {
        type: 'object', required: ['identityToken'],
        properties: {
          identityToken: { type: 'string' },
          fullName:      { type: 'string', nullable: true },
        },
      },
    },
    preHandler: [countrySignin],
  }, AuthController.appleAuth);

  server.post('/refresh', {
    schema: {
      tags: ['Auth'], summary: 'Refresh access token',
      body: {
        type: 'object', required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
    },
  }, AuthController.refresh);

  server.post('/forgot-password', {
    schema: {
      tags: ['Auth'], summary: 'Request password reset email',
      body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
    },
    preHandler: [countryReset],
  }, AuthController.forgotPassword);

  server.post('/reset-password', {
    schema: {
      tags: ['Auth'], summary: 'Confirm password reset with token',
      body: {
        type: 'object', required: ['token', 'newPassword'],
        properties: { token: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } },
      },
    },
    preHandler: [countryReset],
  }, AuthController.resetPassword);

  server.post('/mfa/verify', {
    schema: {
      tags: ['Auth'], summary: 'Verify 2FA OTP and exchange for real tokens',
      body: {
        type: 'object', required: ['mfaToken', 'otp'],
        properties: { mfaToken: { type: 'string' }, otp: { type: 'string', minLength: 6, maxLength: 6 } },
      },
    },
  }, AuthController.verifyMfa);

  server.post('/mfa/resend', {
    schema: {
      tags: ['Auth'], summary: 'Resend 2FA OTP email',
      body: {
        type: 'object', required: ['mfaToken'],
        properties: { mfaToken: { type: 'string' } },
      },
    },
  }, AuthController.resendMfa);

  server.post('/mfa/setup/send', {
    schema: {
      tags: ['Auth'], summary: 'Send a 2FA setup OTP to the current user\'s email',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [requireAuth],
  }, AuthController.sendMfaSetup);

  server.post('/mfa/setup/verify', {
    schema: {
      tags: ['Auth'], summary: 'Verify 2FA setup OTP and enable 2FA for the current user',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['otp'],
        properties: { otp: { type: 'string', minLength: 6, maxLength: 6 } },
      },
    },
    preHandler: [requireAuth],
  }, AuthController.verifyMfaSetup);

  server.post('/mfa/disable/send', {
    schema: { tags: ['Auth'], summary: 'Send an OTP to the current user\'s email to confirm disabling 2FA', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, AuthController.sendMfaDisable);

  server.post('/mfa/disable/verify', {
    schema: {
      tags: ['Auth'], summary: 'Verify disable OTP and disable 2FA for the current user',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['otp'],
        properties: { otp: { type: 'string', minLength: 6, maxLength: 6 } },
      },
    },
    preHandler: [requireAuth],
  }, AuthController.verifyMfaDisable);

  server.post('/logout', {
    schema: { tags: ['Auth'], summary: 'Logout (client should discard tokens)' },
    preHandler: [requireAuth],
  }, AuthController.logout);

  server.get('/me', {
    schema: { tags: ['Auth'], summary: 'Get current authenticated user with profile', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, AuthController.me);

  server.patch('/me', {
    schema: {
      tags: ['Auth'], summary: 'Update current user profile (name)',
      security: [{ bearerAuth: [] }],
      body: { type: 'object', properties: { name: { type: 'string', minLength: 2 } } },
    },
    preHandler: [requireAuth],
  }, AuthController.updateMe);

  server.post('/change-password', {
    schema: {
      tags: ['Auth'], summary: 'Change password',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['currentPassword', 'newPassword'],
        properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } },
      },
    },
    preHandler: [requireAuth],
  }, AuthController.changePassword);

  server.post('/verify-password', {
    schema: {
      tags: ['Auth'], summary: 'Verify current user password (used before destructive actions)',
      security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } },
    },
    preHandler: [requireAuth],
  }, AuthController.verifyPassword);

  server.post('/avatar', {
    schema: { tags: ['Auth'], summary: 'Upload avatar image (multipart/form-data)', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, AuthController.uploadAvatar);
}
