#!/bin/bash
set -e

echo "▶  Pulling latest code..."
git pull origin dev

echo "▶  Building image (no cache)..."
docker compose build --no-cache

echo "▶  Restarting container..."
docker compose up -d

echo "▶  Waiting for container to be ready..."
sleep 10

echo "▶  Running RBAC seed (idempotent)..."
docker compose exec -T kunga-api node -e "
const { PrismaClient } = require('/app/node_modules/.prisma/client/index.js');
const prisma = new PrismaClient();
(async () => {
  const perms = [
    { code: 'VIEW_DASHBOARD',       description: 'View dashboard & summary stats',              category: 'Dashboard' },
    { code: 'VIEW_ANALYTICS',       description: 'View analytics data',                          category: 'Dashboard' },
    { code: 'VIEW_CONTENT',         description: 'View modules, videos & announcements',         category: 'Content' },
    { code: 'MANAGE_CONTENT',       description: 'Create/edit/delete modules',                   category: 'Content' },
    { code: 'MANAGE_VIDEOS',        description: 'Upload and manage video lessons',              category: 'Content' },
    { code: 'MANAGE_ANNOUNCEMENTS', description: 'Create and publish announcements',             category: 'Content' },
    { code: 'VIEW_USERS',           description: 'View user list and profiles',                  category: 'Users' },
    { code: 'MANAGE_USERS',         description: 'Edit and deactivate users',                   category: 'Users' },
    { code: 'VIEW_QUESTIONS',       description: 'View Ask Dr. Gad submissions',                category: 'AskGad' },
    { code: 'ANSWER_QUESTIONS',     description: 'Answer Ask Dr. Gad questions',                category: 'AskGad' },
    { code: 'ASSIGN_QUESTIONS',     description: 'Assign questions to support agents',          category: 'AskGad' },
    { code: 'ESCALATE_QUESTIONS',   description: 'Escalate questions to senior staff',          category: 'AskGad' },
    { code: 'VIEW_DONATIONS',       description: 'View donation records',                        category: 'Revenue' },
    { code: 'VIEW_MOBILE_MONEY',    description: 'View mobile money transactions',              category: 'Revenue' },
    { code: 'VIEW_CARD_PAYMENTS',   description: 'View card payments',                          category: 'Revenue' },
    { code: 'MANAGE_PRICING',       description: 'Edit subscription pricing config',            category: 'Revenue' },
    { code: 'VIEW_COUNTRIES',       description: 'View country availability settings',          category: 'Administration' },
    { code: 'MANAGE_COUNTRIES',     description: 'Manage country availability & scheduling',    category: 'Administration' },
    { code: 'MANAGE_ROLES',         description: 'Manage roles & permission assignments',       category: 'Administration' },
    { code: 'MANAGE_PERMISSIONS',   description: 'View/manage permission catalogue',            category: 'Administration' },
    { code: 'VIEW_SUPPORT_TEAM',    description: 'View support team members',                   category: 'Administration' },
    { code: 'MANAGE_SUPPORT_TEAM',  description: 'Add/remove support team members',            category: 'Administration' },
    { code: 'VIEW_AUDIT_LOGS',      description: 'View system audit logs',                      category: 'Administration' },
    { code: 'VIEW_ASSESSMENTS',     description: 'View child assessments',                      category: 'Assessments' },
  ];

  for (const p of perms) {
    await prisma.permission.upsert({ where: { code: p.code }, update: { description: p.description, category: p.category }, create: p });
  }

  const allPerms = await prisma.permission.findMany();
  const byCode = Object.fromEntries(allPerms.map(p => [p.code, p.id]));

  const roles = [
    { name: 'Super Admin',     description: 'Full access to everything', permissions: '*' },
    { name: 'Support Agent',   description: 'Handles assigned Ask Dr. Gad questions', permissions: ['VIEW_DASHBOARD','VIEW_QUESTIONS','ANSWER_QUESTIONS','ESCALATE_QUESTIONS'] },
    { name: 'Content Manager', description: 'Manages modules, videos and announcements', permissions: ['VIEW_DASHBOARD','VIEW_CONTENT','MANAGE_CONTENT','MANAGE_VIDEOS','MANAGE_ANNOUNCEMENTS'] },
    { name: 'Finance Officer', description: 'Views revenue and manages pricing', permissions: ['VIEW_DASHBOARD','VIEW_DONATIONS','VIEW_MOBILE_MONEY','VIEW_CARD_PAYMENTS','MANAGE_PRICING'] },
  ];

  for (const r of roles) {
    const role = await prisma.role.upsert({ where: { name: r.name }, update: { description: r.description, isSystem: true, isActive: true }, create: { name: r.name, description: r.description, isSystem: true } });
    const permIds = r.permissions === '*' ? allPerms.map(p => p.id) : r.permissions.map(code => byCode[code]).filter(Boolean);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permIds.length) await prisma.rolePermission.createMany({ data: permIds.map(permissionId => ({ roleId: role.id, permissionId })), skipDuplicates: true });
    console.log('Role seeded:', r.name, '(' + permIds.length + ' permissions)');
  }

  await prisma.\$disconnect();
  console.log('✅ RBAC seed done.');
})().catch(e => { console.error(e); process.exit(1); });
"

echo "✅  API deployed."
