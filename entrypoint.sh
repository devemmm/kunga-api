#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
#  kunga-api — Docker Entrypoint
#
#  Handles two database states before starting the server:
#
#  1. Fresh database (no tables)
#     → prisma migrate deploy runs all migrations normally.
#
#  2. Existing database (tables created via prisma db push — no migration
#     history in _prisma_migrations) → auto-baselines all migrations, then
#     retries deploy. No manual intervention required.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        kunga-api  —  starting up         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

echo "▶  Applying database migrations..."

# Try migrate deploy and capture output + exit code
MIGRATE_OUT=$(npx prisma migrate deploy 2>&1) && MIGRATE_OK=true || MIGRATE_OK=false

if $MIGRATE_OK; then
    echo "✅ Migrations applied."
else
    # P3005 = database has tables but no migration history (_prisma_migrations
    # table is missing or empty). Auto-baseline every migration and retry.
    if echo "$MIGRATE_OUT" | grep -q "P3005"; then
        echo ""
        echo "⚠  P3005: database schema exists but has no migration history."
        echo "   Auto-baselining all migrations…"
        echo ""

        for dir in prisma/migrations/*/; do
            migration=$(basename "$dir")
            # skip the lock file (it is not a directory entry we can baseline)
            case "$migration" in
                migration_lock.toml) continue ;;
            esac
            echo "   ✓ baseline: $migration"
            npx prisma migrate resolve --applied "$migration" 2>/dev/null || true
        done

        echo ""
        echo "▶  Retrying migrations after baseline…"
        npx prisma migrate deploy
        echo "✅ Migrations applied."
    else
        # Any other error — print it and exit so Docker restarts the container
        echo ""
        echo "❌ Migration failed:"
        echo "$MIGRATE_OUT"
        exit 1
    fi
fi

echo ""
echo "▶  Starting server…"
echo ""
exec node dist/server.js
