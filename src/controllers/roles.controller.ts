import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { RbacService } from '../services/rbac.service.js';

function actorMeta(req: FastifyRequest) {
  const actor = (req as any).currentUser;
  return {
    userId: actor?.id as string | undefined,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
  };
}

export const RolesController = {
  async list(_req: FastifyRequest, reply: FastifyReply) {
    const roles = await prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userAssignments: true } },
      },
    });
    return reply.send({
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: r.isActive,
        isSystem: r.isSystem,
        permissions: r.rolePermissions.map(rp => rp.permission.code),
        userCount: r._count.userAssignments,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  },

  async listPermissions(_req: FastifyRequest, reply: FastifyReply) {
    const permissions = await prisma.permission.findMany({ orderBy: { category: 'asc' } });
    const grouped: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      const cat = p.category ?? 'Other';
      (grouped[cat] ??= []).push(p);
    }
    return reply.send({ permissions, grouped });
  },

  async create(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body as { name: string; description?: string; permissionCodes?: string[] };
    if (!body.name) {
      return reply.status(400).send({ error: 'Name is required' });
    }
    const existing = await prisma.role.findUnique({ where: { name: body.name } });
    if (existing) {
      return reply.status(400).send({ error: 'A role with this name already exists' });
    }

    const role = await prisma.role.create({
      data: { name: body.name, description: body.description, isSystem: false },
    });

    if (body.permissionCodes?.length) {
      const perms = await prisma.permission.findMany({ where: { code: { in: body.permissionCodes } } });
      await prisma.rolePermission.createMany({
        data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'role.create',
      module: 'RBAC',
      entityType: 'Role',
      entityId: role.id,
      newValue: { name: role.name, description: role.description, permissionCodes: body.permissionCodes ?? [] },
    });

    return reply.status(201).send({ role });
  },

  async update(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; description?: string; isActive?: boolean };

    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Role not found' });
    if (existing.isSystem && body.name && body.name !== existing.name) {
      return reply.status(400).send({ error: 'Cannot rename a system role' });
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'role.update',
      module: 'RBAC',
      entityType: 'Role',
      entityId: id,
      previousValue: { name: existing.name, description: existing.description, isActive: existing.isActive },
      newValue: { name: updated.name, description: updated.description, isActive: updated.isActive },
    });

    return reply.send({ role: updated });
  },

  async remove(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { userAssignments: true } } } });
    if (!role) return reply.status(404).send({ error: 'Role not found' });
    if (role.isSystem) return reply.status(400).send({ error: 'Cannot delete a system role' });
    if (role._count.userAssignments > 0) {
      return reply.status(400).send({ error: 'Cannot delete a role that has assigned users' });
    }

    await prisma.role.delete({ where: { id } });

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'role.delete',
      module: 'RBAC',
      entityType: 'Role',
      entityId: id,
      previousValue: { name: role.name },
    });

    return reply.send({ message: 'Role deleted' });
  },

  async getUsers(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { roleId: id },
      include: { user: { select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true } } },
    });
    return reply.send({ users: assignments.map(a => a.user) });
  },

  async updatePermissions(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const { permissionCodes } = req.body as { permissionCodes: string[] };

    const role = await prisma.role.findUnique({
      where: { id },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) return reply.status(404).send({ error: 'Role not found' });

    const previousCodes = role.rolePermissions.map(rp => rp.permission.code);
    const perms = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });

    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.rolePermission.createMany({
      data: perms.map(p => ({ roleId: id, permissionId: p.id })),
      skipDuplicates: true,
    });

    await RbacService.writeAuditLog({
      ...actorMeta(req),
      action: 'role.update_permissions',
      module: 'RBAC',
      entityType: 'Role',
      entityId: id,
      previousValue: { permissionCodes: previousCodes },
      newValue: { permissionCodes: perms.map(p => p.code) },
    });

    return reply.send({ message: 'Permissions updated' });
  },
};
