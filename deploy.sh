#!/bin/bash
set -e

echo "▶  Pulling latest code..."
git pull origin dev

echo "▶  Building image (no cache)..."
docker compose build --no-cache

echo "▶  Restarting container..."
docker compose up -d

echo "✅  API deployed."
