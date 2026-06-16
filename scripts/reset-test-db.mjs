// Loads credentials from .env.test (gitignored) and resets kunga_test database.
// Run with: node scripts/reset-test-db.mjs
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.test') });

console.log('Resetting kunga_test database…');
execSync('npx prisma migrate reset --force --skip-seed', {
  stdio: 'inherit',
  env: process.env,
  cwd: resolve(__dirname, '..'),
});
console.log('Done. kunga_test is clean and migrated.');
