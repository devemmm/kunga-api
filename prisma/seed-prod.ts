/// <reference types="node" />
/**
 * Kunga Basics — Production Seed
 * ────────────────────────────────
 * Creates ONLY the super-admin account — no dummy users, no test data.
 * Safe to run on a live database; uses upsert so it is idempotent.
 *
 * Run:
 *   npx tsx prisma/seed-prod.ts
 *
 * Docker:
 *   docker compose exec kunga-api npx tsx prisma/seed-prod.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🚀 Kunga Basics — Production Seed\n');

  // ── Super Admin ─────────────────────────────────────────────────────────────
  // Change the password here before running in production, or update it
  // immediately after via the admin portal → profile settings.
  const defaultPassword = 'Admin@1234';
  const passwordHash    = await bcrypt.hash(defaultPassword, 12);

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@kungabasics.com' },
    update: {
      // Keep role and status correct if the row already exists
      role:               'ADMIN',
      subscriptionStatus: 'ACTIVE',
    },
    create: {
      email:              'admin@kungabasics.com',
      name:               'Dr. Gad (Admin)',
      passwordHash,
      role:               'ADMIN',
      subscriptionStatus: 'ACTIVE',
      theme:              'system',
      lang:               'en',
      mfaEnabled:         false,
      preferences:        { create: {} },
    },
  });

  console.log('✅ Super admin created / verified');
  console.log(`   Email    : ${admin.email}`);
  console.log(`   Password : ${defaultPassword}`);
  console.log(`   Role     : ${admin.role}`);
  console.log('\n⚠️  Change the admin password immediately after first login!\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('\n❌ Production seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
