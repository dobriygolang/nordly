#!/usr/bin/env bash
# Production image build with BuildKit caches (run on the VPS from deploy/).
set -euo pipefail

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-4}"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)
if [ "$#" -eq 0 ]; then
  exec "${COMPOSE[@]}" build
else
  exec "${COMPOSE[@]}" build "$@"
fi
