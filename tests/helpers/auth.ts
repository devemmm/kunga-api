import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma.js';

export const DEFAULT_PASSWORD = 'Password@123';

export interface CreateUserOpts {
  email: string;
  name?: string;
  password?: string;
  role?: 'PARENT' | 'ADMIN';
  roleNames?: string[];
  subscriptionStatus?: 'NONE' | 'ACTIVE' | 'TRIAL' | 'SCHOLARSHIP';
}

/** Creates a user (with preferences) and optionally assigns RBAC roles by name. */
export async function createUser(opts: CreateUserOpts) {
  const passwordHash = await bcrypt.hash(opts.password ?? DEFAULT_PASSWORD, 12);

  const user = await prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name ?? 'Test User',
      passwordHash,
      role: opts.role ?? 'PARENT',
      subscriptionStatus: opts.subscriptionStatus ?? 'NONE',
      preferences: { create: {} },
    },
  });

  if (opts.roleNames?.length) {
    const roles = await prisma.role.findMany({ where: { name: { in: opts.roleNames } } });
    await prisma.userRoleAssignment.createMany({
      data: roles.map(r => ({ userId: user.id, roleId: r.id })),
      skipDuplicates: true,
    });
  }

  return user;
}

/** Logs in via POST /api/v1/auth/login and returns the access token. */
export async function loginAs(app: FastifyInstance, email: string, password = DEFAULT_PASSWORD): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed for ${email}: ${res.statusCode} ${res.body}`);
  }
  return res.json().accessToken as string;
}

/** Creates a user + RBAC role assignment, then logs in. Returns {user, token}. */
export async function createAndLogin(app: FastifyInstance, opts: CreateUserOpts) {
  const user = await createUser(opts);
  const token = await loginAs(app, opts.email, opts.password ?? DEFAULT_PASSWORD);
  return { user, token };
}

export const FIXTURES = {
  SUPER_ADMIN: { email: 'super-admin@test.kungabasics.com', name: 'Super Admin', role: 'ADMIN' as const, roleNames: ['Super Admin'] },
  SUPPORT_AGENT: { email: 'support-agent@test.kungabasics.com', name: 'Support Agent', role: 'ADMIN' as const, roleNames: ['Support Agent'] },
  SUPPORT_MANAGER: { email: 'support-manager@test.kungabasics.com', name: 'Support Manager', role: 'ADMIN' as const, roleNames: ['Support Manager'] },
  PLAIN_USER: { email: 'plain-user@test.kungabasics.com', name: 'Plain User', role: 'PARENT' as const, subscriptionStatus: 'ACTIVE' as const },
  NO_SUBSCRIPTION_USER: { email: 'no-sub-user@test.kungabasics.com', name: 'No Subscription User', role: 'PARENT' as const, subscriptionStatus: 'NONE' as const },
  CONTENT_MANAGER: { email: 'content-manager@test.kungabasics.com', name: 'Content Manager', role: 'ADMIN' as const, roleNames: ['Content Manager'] },
};
