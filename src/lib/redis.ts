import Redis from 'ioredis';
import { config } from '../config/index.js';

// Single shared Redis client — used for MFA OTP storage and any future caching.
// The URL switches automatically between docker (redis://kunga-redis:6379) and local.
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[Redis] connection error:', err.message);
});
