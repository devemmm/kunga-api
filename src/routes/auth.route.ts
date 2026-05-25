import type { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export async function authRoutes(server: FastifyInstance) {
  server.post('/register', {
    schema: {
      tags: ['Auth'], summary: 'Register with email & password',
      body: {
        type: 'object', required: ['email', 'name', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 2 },
          password: { type: 'string', minLength: 8 },
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
  }, AuthController.register);

  server.post('/login', {
    schema: {
      tags: ['Auth'], summary: 'Login with email & password',
      body: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
    },
  }, AuthController.login);

  server.post('/google', {
    schema: {
      tags: ['Auth'], summary: 'Google Sign-In — exchange Google ID token for app JWT',
      body: {
        type: 'object', required: ['idToken'],
        properties: { idToken: { type: 'string' } },
      },
    },
  }, AuthController.googleAuth);

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
  }, AuthController.forgotPassword);

  server.post('/reset-password', {
    schema: {
      tags: ['Auth'], summary: 'Confirm password reset with token',
      body: {
        type: 'object', required: ['token', 'newPassword'],
        properties: { token: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } },
      },
    },
  }, AuthController.resetPassword);

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

  server.post('/avatar', {
    schema: { tags: ['Auth'], summary: 'Upload avatar image (multipart/form-data)', security: [{ bearerAuth: [] }] },
    preHandler: [requireAuth],
  }, AuthController.uploadAvatar);
}
