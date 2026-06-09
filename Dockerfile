# ═══════════════════════════════════════════════════════════════════════════════
#  kunga-api — Dockerfile
#  Multi-stage build: compile TypeScript → lean production image
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# OpenSSL is required by Prisma engine binaries on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Install ALL dependencies (including devDeps for tsc + prisma)
COPY package*.json ./
RUN npm ci

# Copy Prisma schema first — generate client before copying src
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Prune dev dependencies — keep only production deps
RUN npm prune --production

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup -S kunga && adduser -S kunga -G kunga

# Copy production artifacts from builder
COPY --from=builder --chown=kunga:kunga /app/dist          ./dist
COPY --from=builder --chown=kunga:kunga /app/node_modules  ./node_modules
COPY --from=builder --chown=kunga:kunga /app/prisma        ./prisma
COPY --from=builder --chown=kunga:kunga /app/package.json  ./package.json

# Copy entrypoint — handles both fresh and pre-existing databases
COPY --chown=kunga:kunga entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER kunga

EXPOSE 3001

# entrypoint.sh: auto-baselines if DB has tables but no migration history (P3005),
# then starts the server. No manual intervention needed.
CMD ["sh", "entrypoint.sh"]
