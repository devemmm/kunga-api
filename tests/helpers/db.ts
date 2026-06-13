import { prisma } from '../../src/lib/prisma.js';
import { seedRbac } from '../../prisma/rbac-seed.js';
import { PricingService } from '../../src/services/admin.service.js';

const TABLES = [
  'activity_logs', 'audit_logs', 'app_config', 'users', 'child_profiles',
  'user_preferences', 'subscriptions', 'question_credits', 'module_groups',
  'modules', 'module_resources', 'videos', 'user_progress', 'video_bookmarks',
  'video_notes', 'routine_entries', 'milestone_reports', 'module_feedback',
  'ask_gad_submissions', 'journal_entries', 'user_announcement_dismissals',
  'announcements', 'donations', 'scholarship_grants', 'roles', 'role_permissions',
  'permissions', 'user_roles', 'user_permissions', 'visitor_sessions', 'analytics_events',
];

/** Truncates every app table (cascading) and restarts identity sequences. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/**
 * Truncates only per-test/user-generated tables (cascades from `users` cover
 * role assignments, permission overrides, ask-gad submissions, etc).
 * Leaves RBAC roles/permissions, app_config, and module_groups in place —
 * use this in `beforeEach` after seeding once in `beforeAll` via `seedBase()`.
 */
export async function resetMutableData(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "users", "audit_logs", "activity_logs" RESTART IDENTITY CASCADE`,
  );
}

const MODULE_GROUPS = [
  { name: 'Speech & Language',    emoji: '🗣️', description: 'Help your child find their voice and communicate', sortOrder: 1 },
  { name: 'Calm & Focus',         emoji: '🧘', description: 'Building emotional regulation and attention skills', sortOrder: 2 },
  { name: 'Movement & Motor',     emoji: '🏃', description: 'Developing coordination and body awareness', sortOrder: 3 },
  { name: 'Social & Play Skills', emoji: '🤝', description: 'Building connection through guided play', sortOrder: 4 },
  { name: 'Gut, Sleep & Feeding', emoji: '🌙', description: 'Supporting whole-body development', sortOrder: 5 },
];

/** Seeds RBAC permissions/roles, app_config defaults, and module group taxonomy. */
export async function seedBase(): Promise<void> {
  await seedRbac(prisma);
  await PricingService.ensureTable();
  for (const g of MODULE_GROUPS) {
    await prisma.moduleGroup.upsert({ where: { name: g.name }, update: {}, create: g });
  }
}

/**
 * Seeds a stable set of Module/Video fixtures for Phase 2a suites. Idempotent
 * (upserts by unique `code`/`cloudflareStreamId`). `modules`/`videos` have no
 * FK to `users`, so they are not cleared by `resetMutableData()` — call this
 * once in `beforeAll` after `seedBase()`.
 */
export async function seedModuleFixtures() {
  const group = await prisma.moduleGroup.findFirstOrThrow({ where: { name: 'Speech & Language' } });

  const publishedModule = await prisma.module.upsert({
    where: { code: 'T1' },
    update: {},
    create: {
      groupId: group.id,
      code: 'T1',
      title: 'Test Published Module',
      description: 'Seeded module for Phase 2a tests',
      status: 'PUBLISHED',
      sortOrder: 1,
    },
  });

  const draftModule = await prisma.module.upsert({
    where: { code: 'T2' },
    update: {},
    create: {
      groupId: group.id,
      code: 'T2',
      title: 'Test Draft Module',
      description: 'Seeded draft module for Phase 2a tests',
      status: 'DRAFT',
      sortOrder: 2,
    },
  });

  const publishedVideo = await prisma.video.upsert({
    where: { cloudflareStreamId: 'test-stream-published' },
    update: {},
    create: {
      moduleId: publishedModule.id,
      title: 'Test Published Video',
      type: 'EXPLANATION',
      cloudflareStreamId: 'test-stream-published',
      hlsUrl: 'https://example.com/test-published.m3u8',
      status: 'PUBLISHED',
      sortOrder: 1,
    },
  });

  const draftVideo = await prisma.video.upsert({
    where: { cloudflareStreamId: 'test-stream-draft' },
    update: {},
    create: {
      moduleId: publishedModule.id,
      title: 'Test Draft Video',
      type: 'EXPLANATION',
      cloudflareStreamId: 'test-stream-draft',
      status: 'DRAFT',
      sortOrder: 2,
    },
  });

  return { group, publishedModule, draftModule, publishedVideo, draftVideo };
}
