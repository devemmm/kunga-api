#!/bin/bash
set -e

echo "▶  Pulling latest code..."
git pull origin dev

echo "▶  Building image (no cache)..."
docker compose build --no-cache

echo "▶  Restarting container..."
docker compose up -d

echo "▶  Waiting for container to be healthy..."
sleep 8

echo "▶  Running RBAC seed (idempotent)..."
docker exec kunga-api node -e "
const { PrismaClient } = require('/app/node_modules/.prisma/client/index.js');
const prisma = new PrismaClient();
async function main() {
  const { seedRbac } = await import('/app/dist/prisma/rbac-seed.js');
  await seedRbac(prisma);
  await prisma.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo "✅  API deployed and RBAC seed applied."
