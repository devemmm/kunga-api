/// <reference types="node" />
/**
 * RBAC seed — permission catalogue + default roles.
 * Idempotent: safe to re-run on every `npm run db:seed`.
 */

import { PrismaClient } from '@prisma/client';

export const PERMISSIONS: { code: string; description: string; category: string }[] = [
  // Dashboard
  { code: 'VIEW_DASHBOARD',       description: 'View admin dashboard',                   category: 'Dashboard' },
  // Analytics
  { code: 'VIEW_ANALYTICS',       description: 'View analytics & reports',               category: 'Analytics' },
  // Users
  { code: 'VIEW_USERS',           description: 'View user accounts',                     category: 'Users' },
  { code: 'MANAGE_USERS',         description: 'Edit/manage user accounts',              category: 'Users' },
  { code: 'VIEW_SUBSCRIPTIONS',   description: 'View subscriptions',                     category: 'Users' },
  { code: 'MANAGE_SUBSCRIPTIONS', description: 'Override/cancel/restore subscriptions',  category: 'Users' },
  // Ask Dr. Gad
  { code: 'VIEW_QUESTIONS',       description: 'View Ask Dr. Gad submissions',           category: 'Ask Dr. Gad' },
  { code: 'ASSIGN_QUESTIONS',     description: 'Assign questions to agents',             category: 'Ask Dr. Gad' },
  { code: 'ANSWER_QUESTIONS',     description: 'Respond to submissions',                 category: 'Ask Dr. Gad' },
  { code: 'ESCALATE_QUESTIONS',   description: 'Escalate questions to Dr. Gad',          category: 'Ask Dr. Gad' },
  // Content
  { code: 'VIEW_CONTENT',         description: 'View modules/content',                   category: 'Content' },
  { code: 'MANAGE_CONTENT',       description: 'Create/edit/delete modules',             category: 'Content' },
  { code: 'MANAGE_VIDEOS',        description: 'Manage videos',                          category: 'Content' },
  { code: 'MANAGE_ANNOUNCEMENTS', description: 'Manage announcements',                   category: 'Content' },
  // Revenue
  { code: 'VIEW_DONATIONS',       description: 'View donations',                         category: 'Revenue' },
  { code: 'VIEW_MOBILE_MONEY',    description: 'View mobile money transactions',         category: 'Revenue' },
  { code: 'VIEW_CARD_PAYMENTS',   description: 'View card payments',                     category: 'Revenue' },
  { code: 'MANAGE_PRICING',       description: 'Edit subscription pricing config',       category: 'Revenue' },
  // Administration
  { code: 'MANAGE_ROLES',         description: 'Manage roles & permission assignments',  category: 'Administration' },
  { code: 'MANAGE_PERMISSIONS',   description: 'View/manage permission catalogue',       category: 'Administration' },
  { code: 'VIEW_SUPPORT_TEAM',    description: 'View support team members',              category: 'Administration' },
  { code: 'MANAGE_SUPPORT_TEAM',  description: 'Create/edit support team members',       category: 'Administration' },
  { code: 'VIEW_AUDIT_LOGS',      description: 'View audit logs',                        category: 'Administration' },
];

export const SUPER_ADMIN_ROLE = 'Super Admin';

export const ROLES: { name: string; description: string; permissions: string[] | '*' }[] = [
  {
    name: SUPER_ADMIN_ROLE,
    description: 'Full system access — all modules, settings, role & permission management, audit logs',
    permissions: '*',
  },
  {
    name: 'Support Manager',
    description: 'Oversees the support team and Ask Dr. Gad queue',
    permissions: [
      'VIEW_DASHBOARD', 'VIEW_USERS', 'VIEW_SUBSCRIPTIONS',
      'VIEW_QUESTIONS', 'ASSIGN_QUESTIONS', 'ANSWER_QUESTIONS', 'ESCALATE_QUESTIONS',
      'VIEW_SUPPORT_TEAM',
    ],
  },
  {
    name: 'Support Agent',
    description: 'Handles assigned Ask Dr. Gad questions',
    permissions: ['VIEW_DASHBOARD', 'VIEW_QUESTIONS', 'ANSWER_QUESTIONS', 'ESCALATE_QUESTIONS'],
  },
  {
    name: 'Content Manager',
    description: 'Manages modules, videos and announcements',
    permissions: ['VIEW_DASHBOARD', 'VIEW_CONTENT', 'MANAGE_CONTENT', 'MANAGE_VIDEOS', 'MANAGE_ANNOUNCEMENTS'],
  },
  {
    name: 'Finance Officer',
    description: 'Views revenue and manages pricing',
    permissions: ['VIEW_DASHBOARD', 'VIEW_DONATIONS', 'VIEW_MOBILE_MONEY', 'VIEW_CARD_PAYMENTS', 'MANAGE_PRICING'],
  },
];

export async function seedRbac(prisma: PrismaClient) {
  console.log('\n🔐 Seeding RBAC permissions & roles...');

  // 1. Upsert permissions
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description, category: p.category },
      create: p,
    });
  }
  const allPerms = await prisma.permission.findMany();
  console.log(`   ✅ ${allPerms.length} permissions`);

  // 2. Upsert roles + role-permission links
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description, isSystem: true, isActive: true },
      create: { name: r.name, description: r.description, isSystem: true },
    });

    const permIds = r.permissions === '*'
      ? allPerms.map(p => p.id)
      : allPerms.filter(p => (r.permissions as string[]).includes(p.code)).map(p => p.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permIds.map(permissionId => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });

    console.log(`   ✅ Role: ${role.name} (${permIds.length} permissions)`);
  }

  // 3. Backward-compat: assign "Super Admin" role to all existing ADMIN users
  const superAdmin = await prisma.role.findUnique({ where: { name: SUPER_ADMIN_ROLE } });
  if (superAdmin) {
    const adminUsers = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    await prisma.userRoleAssignment.createMany({
      data: adminUsers.map(u => ({ userId: u.id, roleId: superAdmin.id })),
      skipDuplicates: true,
    });
    console.log(`   ✅ ${adminUsers.length} existing ADMIN user(s) assigned "${SUPER_ADMIN_ROLE}"`);
  }
}
