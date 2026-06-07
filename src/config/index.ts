// ─── APP CONFIGURATION ───────────────────────────────────────────────────────
// Centralised config reading from environment variables.
// All process.env access should go through this file.

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '30d',
  },

  cors: {
    // CORS_ORIGINS takes priority — comma-separated list of allowed origins.
    // Example: CORS_ORIGINS=https://portal.kunga.devemm.rw,https://app.kungabasics.com
    // Falls back to FRONTEND_URL + ADMIN_URL for backwards compatibility.
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
      : [
          process.env.FRONTEND_URL ?? 'http://localhost:5173',
          process.env.ADMIN_URL   ?? 'http://localhost:5174',
        ],
  },

  google: {
    clientId:    process.env.GOOGLE_CLIENT_ID    ?? '',
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? '',
  },

  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    streamApiToken: process.env.CLOUDFLARE_STREAM_API_TOKEN ?? '',
    r2AccessKey: process.env.CLOUDFLARE_R2_ACCESS_KEY ?? '',
    r2SecretKey: process.env.CLOUDFLARE_R2_SECRET_KEY ?? '',
    r2Bucket: process.env.CLOUDFLARE_R2_BUCKET ?? 'kunga-basics',
    r2PublicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    monthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID ?? '',
    annualPriceId: process.env.STRIPE_ANNUAL_PRICE_ID ?? '',
  },

  flutterwave: {
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY ?? '',
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY ?? '',
    webhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH ?? '',
    redirectUrl: process.env.FLUTTERWAVE_REDIRECT_URL ?? 'kungabasics://payment',
  },

  revenuecat: {
    webhookAuthKey: process.env.REVENUECAT_WEBHOOK_AUTH_KEY ?? '',
    apiKey: process.env.REVENUECAT_API_KEY ?? '',
  },

  expo: {
    accessToken: process.env.EXPO_ACCESS_TOKEN ?? '',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? 'noreply@kungabasics.com',
  },

  smtp: {
    host:     process.env.SMTP_HOST     ?? 'mail.devemm.rw',
    port:     Number(process.env.SMTP_PORT ?? 587),
    user:     process.env.SMTP_USER     ?? 'noreply@devemm.rw',
    password: process.env.SMTP_PASSWORD ?? '',
    from:     process.env.SMTP_FROM     ?? 'Kunga Basics <noreply@devemm.rw>',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  posthog: {
    apiKey: process.env.POSTHOG_API_KEY ?? '',
    host: process.env.POSTHOG_HOST ?? 'https://app.posthog.com',
  },

  app: {
    deepLinkScheme: 'kungabasics',
    portalUrl:      process.env.PORTAL_URL ?? 'https://portal.kunga.devemm.rw',
    askGadMonthlyLimit: 2,
    streamUrlExpirySecs: 7200, // 2 hours
    serverUrl: process.env.SERVER_URL ?? '', // e.g. https://api.yourdomain.com — used to build public URLs for server-stored files
    logDir: process.env.LOG_DIR ?? '/opt/kunga/logs', // daily rotating log directory (production)
    logRetentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 30),
  },

  minio: {
    // Internal S3 API endpoint — backend calls MinIO directly on port 9000.
    // If MinIO is on the same server, use http://localhost:9000.
    // Do NOT point this at the console port (9001) or the reverse-proxy domain
    // (which routes to the console); you'll get "S3 API Requests must be made to API port".
    endpoint:  process.env.MINIO_ENDPOINT   ?? 'https://api.resources.devemm.rw',
    // Public base URL used when building file URLs returned to browsers.
    publicUrl: process.env.MINIO_PUBLIC_URL ?? 'https://api.resources.devemm.rw',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'admin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'admin12345',
    bucket:    process.env.MINIO_BUCKET     ?? 'kunga',
  },
} as const;

export type Config = typeof config;
