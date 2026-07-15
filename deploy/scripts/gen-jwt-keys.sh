#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${ROOT}/secrets/jwt"
mkdir -p "$DIR"

# Deploy runs as root and often `chown -R` the repo; identity uses DEPLOY_UID:DEPLOY_GID.
# Keep private.pem readable by that user only (mode 0600) after every `make keys`.
load_deploy_ids() {
  if [[ -n "${DEPLOY_UID:-}" && -n "${DEPLOY_GID:-}" ]]; then
    return 0
  fi
  if [[ ! -f "$ROOT/.env" ]]; then
    return 0
  fi
  local uid gid
  uid="$(awk -F= '$1=="DEPLOY_UID"{print $2; exit}' "$ROOT/.env")"
  gid="$(awk -F= '$1=="DEPLOY_GID"{print $2; exit}' "$ROOT/.env")"
  DEPLOY_UID="${DEPLOY_UID:-$uid}"
  DEPLOY_GID="${DEPLOY_GID:-$gid}"
}

apply_jwt_perms() {
  load_deploy_ids
  chmod 700 "$DIR"
  chmod 600 "$DIR/private.pem"
  chmod 644 "$DIR/public.pem"
  if [[ -n "${DEPLOY_UID:-}" && -n "${DEPLOY_GID:-}" ]]; then
    chown -R "${DEPLOY_UID}:${DEPLOY_GID}" "$DIR"
  fi
}

if [[ -f "$DIR/private.pem" && -f "$DIR/public.pem" ]]; then
  echo "JWT keys already exist in $DIR (skip)"
  apply_jwt_perms
  exit 0
fi

openssl genrsa -out "$DIR/private.pem" 2048
openssl rsa -in "$DIR/private.pem" -pubout -out "$DIR/public.pem"
# private.pem is consumed by identity as the host user configured through
# DEPLOY_UID/DEPLOY_GID in docker-compose.prod.yml; never make it world-readable.
apply_jwt_perms

echo "generated:"
echo "  $DIR/private.pem"
echo "  $DIR/public.pem"
