import type { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { RbacService } from '../services/rbac.service.js';
import { AuthService } from '../services/auth.service.js';

function actorMeta(req: FastifyRequest) {
  const actor = (req as any).currentUser;
  return {
    userId: actor?.id as string | undefined,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
  };
}

async function serialize(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    roles: (user.roleAssignments ?? []).map((ra: any) => ({ id: ra.role.id, name: ra.role.name })),
    permissions: (user.permissionOverrides ?? []).map((up: any) => up.permission.code),
  };
}

export const SupportTeamController = {
  async list(req: FastifyRequest, reply: FastifyReply) {
    const { page = '1', limit = '20', search } = req.query as { page?: string; limit?: string; search?: string };
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;

    const where: any = { role: 'ADMIN' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          roleAssignments: { include: { role: true } },
          permissionOverrides: { include: { permission: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({
      members: await Promise.all(users.map(serialize)),
      total,
      page: pageNum,
      limit: limitNum,
    });
  },

  async create(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body as { name: string; email: string; phone?: string; roleIds?: string[]; password?: string };
    if (!body.name || !body.email) {
      return reply.status(400).send({ error: 'Name and email are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(400).send({ error: 'A user with this email already exists' });
    }

    const tempPassword = body.password || Math.random().toString(36).slice(-10) + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        theme: 'system',
        lang: 'en',
        preferences: { create: {} },
      },
    });

    if (body.roleIds?.length) {
      await prisma.userRoleAssignment.createMany({
        data: body.roleIds.map(roleId => ({ userId: user.id, roleId })),
        skipDuplicates: true,
      });
    }

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'support_team.create',
      module: 'SupportTeam',
      entityType: 'User',
      entityId: user.id,
      newValue: { name: user.name, email: user.email, roleIds: body.roleIds ?? [] },
    });

    // Send a password-reset email so the new member can set their own password
    await AuthService.forgotPassword(req.server as any, user.email);

    const full = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        roleAssignments: { include: { role: true } },
        permissionOverrides: { include: { permission: true } },
      },
    });

    return reply.status(201).send({ member: await serialize(full), tempPassword });
  },

  async update(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; phone?: string };

    const existing = await prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
    if (!existing) return reply.status(404).send({ error: 'Support team member not found' });

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone }),
      },
    });

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'support_team.update',
      module: 'SupportTeam',
      entityType: 'User',
      entityId: id,
      previousValue: { name: existing.name, phone: existing.phone },
      newValue: { name: updated.name, phone: updated.phone },
    });

    return reply.send({ message: 'Updated' });
  },

  async deactivate(req: FastifyRequest, reply: FastifyReply) {
    return setActive(req, reply, false);
  },

  async activate(req: FastifyRequest, reply: FastifyReply) {
    return setActive(req, reply, true);
  },

  async resetPassword(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const member = await prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
    if (!member) return reply.status(404).send({ error: 'Support team member not found' });

    await AuthService.forgotPassword(req.server as any, member.email);

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'support_team.reset_password',
      module: 'SupportTeam',
      entityType: 'User',
      entityId: id,
      newValue: { email: member.email },
    });

    return reply.send({ message: 'Password reset email sent' });
  },

  async regeneratePassword(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const member = await prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
    if (!member) return reply.status(404).send({ error: 'Support team member not found' });

    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({ where: { id }, data: { passwordHash } });

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'support_team.regenerate_password',
      module: 'SupportTeam',
      entityType: 'User',
      entityId: id,
      newValue: { email: member.email },
    });

    return reply.send({ tempPassword });
  },

  async updateRoles(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const { roleIds } = req.body as { roleIds: string[] };

    const member = await prisma.user.findFirst({
      where: { id, role: 'ADMIN' },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!member) return reply.status(404).send({ error: 'Support team member not found' });

    const previousRoles = member.roleAssignments.map(ra => ra.role.name);

    await prisma.userRoleAssignment.deleteMany({ where: { userId: id } });
    await prisma.userRoleAssignment.createMany({
      data: roleIds.map(roleId => ({ userId: id, roleId })),
      skipDuplicates: true,
    });

    const newRoles = await prisma.role.findMany({ where: { id: { in: roleIds } } });

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'support_team.update_roles',
      module: 'SupportTeam',
      entityType: 'User',
      entityId: id,
      previousValue: { roles: previousRoles },
      newValue: { roles: newRoles.map(r => r.name) },
    });

    return reply.send({ message: 'Roles updated' });
  },

  async updatePermissions(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const { permissionCodes } = req.body as { permissionCodes: string[] };

    const member = await prisma.user.findFirst({
      where: { id, role: 'ADMIN' },
      include: { permissionOverrides: { include: { permission: true } } },
    });
    if (!member) return reply.status(404).send({ error: 'Support team member not found' });

    const previousCodes = member.permissionOverrides.map(up => up.permission.code);
    const perms = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });

    await prisma.userPermission.deleteMany({ where: { userId: id } });
    await prisma.userPermission.createMany({
      data: perms.map(p => ({ userId: id, permissionId: p.id })),
      skipDuplicates: true,
    });

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'support_team.update_permissions',
      module: 'SupportTeam',
      entityType: 'User',
      entityId: id,
      previousValue: { permissionCodes: previousCodes },
      newValue: { permissionCodes: perms.map(p => p.code) },
    });

    return reply.send({ message: 'Direct permissions updated' });
  },
};

async function setActive(req: FastifyRequest, reply: FastifyReply, isActive: boolean) {
  const { id } = req.params as { id: string };
  const member = await prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
  if (!member) return reply.status(404).send({ error: 'Support team member not found' });

  await prisma.user.update({ where: { id }, data: { isActive } });

  await RbacService.writeAuditLog({
    ...actorMeta(req),
    action: isActive ? 'support_team.activate' : 'support_team.deactivate',
    module: 'SupportTeam',
    entityType: 'User',
    entityId: id,
    previousValue: { isActive: member.isActive },
    newValue: { isActive },
  });

  return reply.send({ message: isActive ? 'Member activated' : 'Member deactivated' });
}
