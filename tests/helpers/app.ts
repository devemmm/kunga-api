import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';

let appPromise: Promise<FastifyInstance> | undefined;

/** Returns a singleton Fastify instance (built once per test run) for `.inject()`. */
export async function getTestApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildServer();
  }
  return appPromise;
}

export async function closeTestApp(): Promise<void> {
  if (!appPromise) return;
  const app = await appPromise;
  await app.close();
  appPromise = undefined;
}
