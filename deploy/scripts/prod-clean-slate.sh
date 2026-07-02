#!/usr/bin/env bash
# Wipe all application databases, re-run migrations, restart prod stack, prune legacy images.
# Run on the VPS from deploy/ after backing up if needed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Stop app services"
docker compose -f docker-compose.prod.yml --env-file .env stop \
  caddy identity identity-bot billing sandbox rooms tracker notes focus migrate 2>/dev/null || true

echo "==> Reset databases"
make reset-db

echo "==> Migrate"
make migrate

echo "==> Start stack"
make up

echo "==> Remove legacy druzya images (if any)"
docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "^druzya-" | xargs -r docker rmi -f || true

echo "==> Prune dangling images"
./scripts/docker-prune.sh

echo "==> Done — empty databases, fresh migrations, single nordly-prod stack"
