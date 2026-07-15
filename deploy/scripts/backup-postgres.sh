#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=services.conf.sh
source "$ROOT/scripts/services.conf.sh"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/$STAMP"
mkdir -p "$OUT"

: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}"
: "${POSTGRES_HOST:=postgres}"

export PGPASSWORD="$POSTGRES_PASSWORD"

for db in "${DB_DATABASES[@]}"; do
  echo "==> dump $db"
  pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -Fc "$db" > "$OUT/${db}.dump"
done

archive="$BACKUP_DIR/nordly_${STAMP}.tar.gz"
tar -czf "$archive" -C "$BACKUP_DIR" "$STAMP"
rm -rf "$OUT"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$archive")" >"$(basename "$archive").sha256")

echo "backup: $archive"
echo "checksum: ${archive}.sha256"

# Cron example (daily 03:00 UTC, run from deploy/ with .env loaded):
# 0 3 * * * cd /opt/project-nordly/deploy && set -a && source .env && set +a && ./scripts/backup-postgres.sh
