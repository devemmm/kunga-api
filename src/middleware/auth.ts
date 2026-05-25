import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    const payload = req.user as { sub: string; role: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }
    (req as any).currentUser = user;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  const user = (req as any).currentUser;
  if (user?.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}

export async function requireSubscription(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  const user = (req as any).currentUser;
  const validStatuses = ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'];
  if (!validStatuses.includes(user?.subscriptionStatus)) {
    return reply.status(402).send({ error: 'Active subscription required' });
  }
}
