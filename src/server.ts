import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from './config/index.js';
import { prisma } from './lib/prisma.js';
import { parseUA, SERVER_META, nextReqId, formatBytes, isSilentPath } from './lib/logger.js';
import { authRoutes } from './routes/auth.route.js';
import { usersRoutes } from './routes/users.route.js';
import {
  modulesRoutes, videosRoutes,
  subscriptionsRoutes, paymentsRoutes,
  donationsRoutes, askGadRoutes,
  announcementsRoutes, adminRoutes, analyticsRoutes,
} from './routes/index.js';
import {
  progressRoutes, routineRoutes, milestonesRoutes,
  preferencesRoutes, journalRoutes,
} from './routes/progress.route.js';
import { webhooksRoutes } from './routes/webhooks.route.js';
import { rolesRoutes, permissionsRoutes, supportTeamRoutes } from './routes/rbac.route.js';

async function main() {
  // ─── SERVER INSTANCE ───────────────────────────────────────────────────────

  const isDev = config.env !== 'production';

  const server = Fastify({
    // ── Pino logger ────────────────────────────────────────────────────────────
    logger: {
      level: 'info',
      // ── Dev  : colourised pretty-print to stdout
      // ── Prod : structured JSON → daily rotating files in LOG_DIR
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize:      true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              ignore:        'pid,hostname',
              messageFormat: '{msg}',
            },
          }
        : {
            target: 'pino-roll',
            options: {
              file:       `${config.app.logDir}/kunga-api`,
              frequency:  'daily',           // new file every midnight UTC
              extension:  '.log',            // → kunga-api.2026-05-24.log
              dateFormat: 'yyyy-MM-dd',
              mkdir:      true,              // create /opt/kunga/logs if it doesn't exist
              limit:      { count: config.app.logRetentionDays }, // keep N days of logs
            },
          },
    },
    // ── Request config ──────────────────────────────────────────────────────────
    disableRequestLogging: true,           // we emit our own structured request logs
    genReqId:              nextReqId,      // short, human-readable IDs (req-000001)
    trustProxy:            true,           // honour X-Forwarded-For → real client IP
  });

  // ─── PLUGINS ───────────────────────────────────────────────────────────────

  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, { origin: config.cors.origins, credentials: true });
  await server.register(rateLimit, { max: 100, timeWindow: '1 minute', keyGenerator: (req) => req.ip });
  await server.register(jwt, { secret: config.jwt.secret });
  await server.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });

  // ─── SWAGGER / OPENAPI DOCS ────────────────────────────────────────────────

  await server.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Kunga Basics API',
        description: `
## Kunga Basics Backend API

RESTful API powering the Kunga Basics mobile app and admin panel.

### Authentication
All protected endpoints require a **Bearer JWT** token:
\`Authorization: Bearer <accessToken>\`

Obtain tokens via \`POST /api/v1/auth/login\` or \`POST /api/v1/auth/google\`.
Access tokens expire in **15 minutes** — rotate using \`POST /api/v1/auth/refresh\`.

### Subscription Gating
Endpoints marked **[Subscription Required]** return \`402\` for non-subscribers.
Preview modules (\`isPreview: true\`) are always accessible.

### Rate Limiting
100 requests/minute per IP. Ask Dr. Gad: 2 submissions/month per user.
        `,
        version: '1.0.0',
        contact: { name: 'Kunga Basics', email: 'support@kungabasics.com' },
      },
      servers: [
        { url: 'http://localhost:3001', description: 'Local development' },
        { url: 'https://api.kungabasics.com', description: 'Production' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Auth',          description: '🔐 Register, login, Google OAuth, token refresh, password reset' },
        { name: 'Users',         description: '👤 Profile, child profile, GDPR data export & deletion' },
        { name: 'Modules',       description: '📚 Module groups and modules with subscription gating' },
        { name: 'Videos',        description: '🎥 Video management, signed HLS stream URLs, bookmarks & notes' },
        { name: 'Progress',      description: '📈 Per-module learning progress tracking' },
        { name: 'Routine',       description: '✅ Daily routine checklists with streak tracking' },
        { name: 'Milestones',    description: '🏆 Weekly milestone reports with photo uploads' },
        { name: 'Preferences',   description: '🔔 Notification and app preferences' },
        { name: 'Journal',       description: '📔 Child progress journal entries with photos' },
        { name: 'Subscriptions', description: '💳 Subscription status, RevenueCat sync, admin overrides' },
        { name: 'Payments',      description: '💰 Stripe, Flutterwave Mobile Money, manual activation' },
        { name: 'Donations',     description: '💝 Donation flows, donor wall, scholarship grants' },
        { name: 'Ask Dr. Gad',   description: '🎤 Premium video Q&A submissions (2/month)' },
        { name: 'Announcements', description: '📣 Push notifications and in-app banners' },
        { name: 'Webhooks',      description: '🔗 Flutterwave, Stripe and RevenueCat webhook receivers' },
        { name: 'Admin',         description: '🛠 Dashboard stats, activity log, module and payment analytics' },
        { name: 'Analytics',     description: '📊 DAU/MAU, funnel, cohort retention, mobile money breakdown' },
      ],
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      docExpansion: 'list',
      defaultModelExpandDepth: 2,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  });

  // ─── REQUEST / RESPONSE LOGGING ───────────────────────────────────────────

  /**
   * onRequest  — fired before the route handler.
   * Parses the User-Agent and stores timing context on the request object.
   */
  server.addHook('onRequest', async (req) => {
    if (isSilentPath(req.url)) return;

    const ua    = parseUA(req.headers['user-agent']);
    const start = Date.now();

    // Stash on request for use in onResponse
    (req as any)._ua    = ua;
    (req as any)._start = start;

    const clientStr = [
      ua.os, ua.osVersion,
      ua.browser, ua.browserVersion && `${ua.browser} ${ua.browserVersion}`,
    ].filter(Boolean).join(' ');

    server.log.info(
      {
        type:           'request',
        reqId:          req.id,
        method:         req.method,
        url:            req.url,
        ip:             req.ip,
        os:             ua.os,
        osVersion:      ua.osVersion,
        platform:       ua.platform,
        device:         ua.device,
        browser:        ua.browser,
        browserVersion: ua.browserVersion,
        userAgent:      req.headers['user-agent'] ?? '-',
        referer:        req.headers['referer'] ?? '-',
        contentType:    req.headers['content-type'] ?? '-',
      },
      `→  ${req.method.padEnd(6)} ${req.url.padEnd(50)}` +
      `  ip:${req.ip}  ${ua.platform}  ${clientStr}  [${req.id}]`,
    );
  });

  /**
   * onResponse — fired after the reply is sent.
   * Logs the completed request with status code, duration, size, and user identity.
   */
  server.addHook('onResponse', async (req, reply) => {
    if (isSilentPath(req.url)) return;

    const ua         = (req as any)._ua    ?? parseUA(req.headers['user-agent']);
    const start      = (req as any)._start ?? Date.now();
    const durationMs = Date.now() - start;
    const statusCode = reply.statusCode;
    const userId     = (req as any).currentUser?.id ?? null;
    const size       = formatBytes(Number(reply.getHeader('content-length')) || 0);

    const logLevel =
      statusCode >= 500 ? 'error' :
      statusCode >= 400 ? 'warn'  : 'info';

    server.log[logLevel](
      {
        type:           'response',
        reqId:          req.id,
        method:         req.method,
        url:            req.url,
        statusCode,
        responseTimeMs: durationMs,
        responseSize:   size,
        ip:             req.ip,
        userId:         userId ?? '-',
        os:             ua.os,
        osVersion:      ua.osVersion,
        platform:       ua.platform,
        device:         ua.device,
        browser:        ua.browser,
        browserVersion: ua.browserVersion,
      },
      `←  ${String(statusCode).padEnd(4)} ${req.method.padEnd(6)} ${req.url.padEnd(50)}` +
      `  ${String(durationMs).padStart(5)}ms  ${size.padStart(8)}` +
      `  user:${userId ?? '-'}  [${req.id}]`,
    );
  });

  // ─── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────

  server.setErrorHandler((error, req, reply) => {
    const status = (error as any).status ?? (error as any).statusCode ?? 500;
    server.log.error(
      {
        type:    'error',
        reqId:   req.id,
        method:  req.method,
        url:     req.url,
        status,
        ip:      req.ip,
        userId:  (req as any).currentUser?.id ?? null,
        message: error.message,
        stack:   status >= 500 ? error.stack : undefined,
      },
      `⚠  ${status}  ${req.method} ${req.url}  —  ${error.message}  [${req.id}]`,
    );
    return reply.status(status).send({
      error: error.message || 'Internal server error',
      statusCode: status,
    });
  });

  // ─── ROUTES ────────────────────────────────────────────────────────────────

  const API = '/api/v1';

  await server.register(authRoutes,          { prefix: `${API}/auth` });
  await server.register(usersRoutes,         { prefix: `${API}/users` });
  await server.register(modulesRoutes,       { prefix: `${API}/modules` });
  await server.register(videosRoutes,        { prefix: `${API}/videos` });
  await server.register(progressRoutes,      { prefix: `${API}/progress` });
  await server.register(routineRoutes,       { prefix: `${API}/routine` });
  await server.register(milestonesRoutes,    { prefix: `${API}/milestones` });
  await server.register(preferencesRoutes,   { prefix: `${API}/preferences` });
  await server.register(journalRoutes,       { prefix: `${API}/journal` });
  await server.register(subscriptionsRoutes, { prefix: `${API}/subscriptions` });
  await server.register(paymentsRoutes,      { prefix: `${API}/payments` });
  await server.register(donationsRoutes,     { prefix: `${API}/donations` });
  await server.register(askGadRoutes,        { prefix: `${API}/ask-gad` });
  await server.register(announcementsRoutes, { prefix: `${API}/announcements` });
  await server.register(webhooksRoutes,      { prefix: `${API}/webhooks` });
  await server.register(adminRoutes,         { prefix: `${API}/admin` });
  await server.register(analyticsRoutes,     { prefix: `${API}/analytics` });
  await server.register(rolesRoutes,         { prefix: `${API}/admin/roles` });
  await server.register(permissionsRoutes,   { prefix: `${API}/admin/permissions` });
  await server.register(supportTeamRoutes,   { prefix: `${API}/admin/support-team` });

  // ─── APP VERSION CHECK (public — no auth required) ────────────────────────
  // Mobile app calls this on startup to check for forced/optional updates.

  server.get(`${API}/app/version`, {
    schema: { tags: ['App'], summary: 'Get min/latest app version for update checks' },
  }, async (_req, reply) => {
    try {
      const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
        SELECT key, value FROM app_config
        WHERE key IN ('app_min_version','app_latest_version','app_store_url_ios','app_store_url_android')
      `;
      const m = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
      return reply.send({
        minVersion:         m.app_min_version         ?? '1.0.0',
        latestVersion:      m.app_latest_version      ?? '1.0.0',
        storeUrlIos:        m.app_store_url_ios        ?? '',
        storeUrlAndroid:    m.app_store_url_android    ?? '',
      });
    } catch {
      return reply.send({ minVersion: '1.0.0', latestVersion: '1.0.0', storeUrlIos: '', storeUrlAndroid: '' });
    }
  });

  // ─── PUBLIC: CONTACT CONFIG (WhatsApp) ────────────────────────────────────
  // Mobile app reads this on startup to know whether to show the WhatsApp FAB
  // and which number to dial. No auth required.

  server.get(`${API}/app/contact`, {
    schema: { tags: ['App'], summary: 'Get WhatsApp contact config for mobile app' },
  }, async (_req, reply) => {
    try {
      const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
        SELECT key, value FROM app_config
        WHERE key IN ('whatsapp_enabled', 'whatsapp_number')
      `;
      const m = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
      return reply.send({
        enabled: (m.whatsapp_enabled ?? 'true') === 'true',
        number:  m.whatsapp_number ?? '+250788596281',
      });
    } catch {
      return reply.send({ enabled: true, number: '+250788596281' });
    }
  });

  // ─── PUBLIC: SUBSCRIPTION PRICING ─────────────────────────────────────────
  // Mobile app reads this on the Paywall screen so prices always match what
  // the admin has configured. No auth required.

  server.get(`${API}/app/pricing`, {
    schema: { tags: ['App'], summary: 'Get subscription pricing for mobile paywall' },
  }, async (_req, reply) => {
    try {
      const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
        SELECT key, value FROM app_config
        WHERE key IN ('price_monthly_usd','price_annual_usd')
      `;
      const m = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
      return reply.send({
        monthly: parseFloat(m.price_monthly_usd) || 14,
        annual:  parseFloat(m.price_annual_usd)  || 140,
      });
    } catch {
      return reply.send({ monthly: 14, annual: 140 });
    }
  });

  // ─── HEALTH & ROOT ─────────────────────────────────────────────────────────

  server.get('/health', async () => ({
    status: 'ok', version: '1.0.0', timestamp: new Date().toISOString(),
  }));

  server.get('/', { schema: { hide: true } }, async () => ({
    name: 'Kunga Basics API', version: '1.0.0', docs: '/docs',
  }));

  // ─── START ─────────────────────────────────────────────────────────────────

  await server.listen({ port: config.port, host: config.host });

  server.log.info(
    {
      type:    'startup',
      env:     config.env,
      port:    config.port,
      ...SERVER_META,
    },
    `Kunga Basics API  |  ${config.env.toUpperCase()}  |  ` +
    `port:${config.port}  node:${SERVER_META.nodeVersion}  ` +
    `host:${SERVER_META.serverOS} (${SERVER_META.arch})  ` +
    `mem:${SERVER_META.memoryMB} MB  cpus:${SERVER_META.cpus}`,
  );

  return server;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
