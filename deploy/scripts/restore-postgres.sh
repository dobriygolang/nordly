#!/usr/bin/env bash
# Verify or restore a backup created by backup-postgres.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=services.conf.sh
source "$ROOT/scripts/services.conf.sh"

usage() {
  echo "usage: $0 /path/to/nordly_YYYYmmdd_HHMMSS.tar.gz" >&2
  echo "default: verify only; set RESTORE_MODE=apply CONFIRM_RESTORE=RESTORE_nordly to restore" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

ARCHIVE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[[ -f "$ARCHIVE" ]] || { echo "restore: archive not found: $ARCHIVE" >&2; exit 1; }

if [[ -f "${ARCHIVE}.sha256" ]]; then
  (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")
else
  echo "restore: warning: no ${ARCHIVE}.sha256; integrity is not independently verified" >&2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/nordly-restore.XXXXXX")"
trap 'rm -rf "$work"' EXIT

tar -tzf "$ARCHIVE" | awk '
  /^\/|(^|\/)\.\.(\/|$)/ { bad=1 }
  END { exit bad }
' || { echo "restore: unsafe archive path" >&2; exit 1; }
tar -xzf "$ARCHIVE" -C "$work"

dump_root="$(find "$work" -mindepth 1 -maxdepth 1 -type d -print -quit)"
[[ -n "$dump_root" ]] || { echo "restore: archive has no dump directory" >&2; exit 1; }

for db in "${DB_DATABASES[@]}"; do
  dump="$dump_root/${db}.dump"
  [[ -f "$dump" ]] || { echo "restore: missing ${db}.dump" >&2; exit 1; }
  pg_restore --list "$dump" >/dev/null
done

if [[ "${RESTORE_MODE:-verify}" != "apply" ]]; then
  echo "restore: verified ${#DB_DATABASES[@]} dumps; no database changes made"
  exit 0
fi

if [[ "${CONFIRM_RESTORE:-}" != "RESTORE_nordly" ]]; then
  echo "restore: apply requires CONFIRM_RESTORE=RESTORE_nordly" >&2
  exit 1
fi

: "${POSTGRES_USER:?POSTGRES_USER required for apply}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required for apply}"
: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"

export PGPASSWORD="$POSTGRES_PASSWORD"
for db in "${DB_DATABASES[@]}"; do
  echo "==> restore $db"
  pg_restore \
    --host "$POSTGRES_HOST" \
    --port "$POSTGRES_PORT" \
    --username "$POSTGRES_USER" \
    --dbname "$db" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --exit-on-error \
    --single-transaction \
    "$dump_root/${db}.dump"
done

echo "restore: completed ${#DB_DATABASES[@]} databases"
