#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${ROOT}/secrets/jwt"
mkdir -p "$DIR"

if [[ -f "$DIR/private.pem" && -f "$DIR/public.pem" ]]; then
  echo "JWT keys already exist in $DIR (skip)"
  chmod 600 "$DIR/private.pem"
  chmod 644 "$DIR/public.pem"
  exit 0
fi

openssl genrsa -out "$DIR/private.pem" 2048
openssl rsa -in "$DIR/private.pem" -pubout -out "$DIR/public.pem"
# private.pem is consumed by identity as the host user configured through
# DEPLOY_UID/DEPLOY_GID in docker-compose.prod.yml; never make it world-readable.
chmod 600 "$DIR/private.pem"
chmod 644 "$DIR/public.pem"

echo "generated:"
echo "  $DIR/private.pem"
echo "  $DIR/public.pem"
