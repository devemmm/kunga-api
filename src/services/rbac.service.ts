import { prisma } from '../lib/prisma.js';

const SUPER_ADMIN_ROLE = 'Super Admin';

export const RbacService = {
  async getEffectivePermissions(userId: string): Promise<Set<string> | 'ALL'> {
    const roleAssignments = await prisma.userRoleAssignment.findMany({
      where: { userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    if (roleAssignments.some(ra => ra.role.name === SUPER_ADMIN_ROLE)) {
      return 'ALL';
    }

    const codes = new Set<string>();
    for (const ra of roleAssignments) {
      for (const rp of ra.role.rolePermissions) codes.add(rp.permission.code);
    }

    const userPerms = await prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    });
    for (const up of userPerms) codes.add(up.permission.code);

    return codes;
  },

  async hasPermission(userId: string, ...codes: string[]): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId);
    if (effective === 'ALL') return true;
    return codes.some(c => effective.has(c));
  },

  async getAllPermissionCodes(): Promise<string[]> {
    return (await prisma.permission.findMany({ select: { code: true } })).map(p => p.code);
  },

  async writeAuditLog(opts: {
    userId?: string | null;
    action: string;
    module: string;
    entityType?: string;
    entityId?: string;
    previousValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        action: opts.action,
        module: opts.module,
        entityType: opts.entityType,
        entityId: opts.entityId,
        previousValue: opts.previousValue as any,
        newValue: opts.newValue as any,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
      },
    });
  },
};
