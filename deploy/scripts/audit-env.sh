#!/usr/bin/env bash
# Compare deploy/.env keys against .env.example; report missing required and obsolete keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env}"
EXAMPLE="${2:-.env.example}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

keys_in() {
  grep -E '^[A-Z][A-Z0-9_]*=' "$1" | cut -d= -f1 | sort -u
}

mapfile -t example_keys < <(keys_in "$EXAMPLE")
mapfile -t env_keys < <(keys_in "$ENV_FILE")

echo "==> Keys in $ENV_FILE but not in $EXAMPLE (consider removing):"
comm -23 <(printf '%s\n' "${env_keys[@]}") <(printf '%s\n' "${example_keys[@]}") || true

echo
echo "==> Keys in $EXAMPLE but not in $ENV_FILE (may need adding):"
comm -13 <(printf '%s\n' "${env_keys[@]}") <(printf '%s\n' "${example_keys[@]}") || true
