#!/usr/bin/env bash
# Compare deploy/.env keys against .env.example and reject unsafe production values.
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

example_keys="$(keys_in "$EXAMPLE")"
env_keys="$(keys_in "$ENV_FILE")"

echo "==> Keys in $ENV_FILE but not in $EXAMPLE (consider removing):"
comm -23 <(printf '%s\n' "$env_keys") <(printf '%s\n' "$example_keys") || true

echo
echo "==> Keys in $EXAMPLE but not in $ENV_FILE (may need adding):"
comm -13 <(printf '%s\n' "$env_keys") <(printf '%s\n' "$example_keys") || true

value_of() {
  local key="$1"
  awk -v key="$key" '
    $0 ~ "^[[:space:]]*" key "=" {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' "$ENV_FILE"
}

app_env="$(value_of APP_ENV)"
case "$app_env" in
  production|prod|staging)
    ;;
  *)
    echo
    echo "Skipping production secret checks (APP_ENV=${app_env:-unset})."
    exit 0
    ;;
esac

fail=0
fail_check() {
  echo "ERROR: $*" >&2
  fail=1
}

if grep -E '^[A-Z][A-Z0-9_]*=.*CHANGE_ME' "$ENV_FILE" >/dev/null; then
  fail_check "$ENV_FILE contains a CHANGE_ME placeholder"
fi

for key in GRAFANA_ADMIN_PASSWORD TRIBUTE_WEBHOOK_SECRET REDIS_PASSWORD; do
  if [[ -z "$(value_of "$key")" ]]; then
    fail_check "$key must be set for $app_env"
  fi
done

for key in DEPLOY_UID DEPLOY_GID; do
  if [[ -z "$(value_of "$key")" ]]; then
    fail_check "$key must be set so identity can read its 0600 JWT private key"
  fi
done

for key in private.pem public.pem; do
  if [[ ! -f "secrets/jwt/$key" ]]; then
    fail_check "missing JWT key secrets/jwt/$key (run make keys)"
  fi
done

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo
echo "Production environment audit passed."
