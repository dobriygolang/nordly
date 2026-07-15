# Runbook — Nordly production

## Restart order

1. `postgres`, `redis`
2. `migrate` (after schema change only)
3. `identity` → `billing` → `sandbox` → `rooms` → `tracker` → `notes` → `focus`
4. `identity-bot`, `caddy`

```bash
cd deploy
docker compose -f docker-compose.prod.yml --env-file .env restart identity billing sandbox rooms tracker notes focus caddy
```

## Health

Public: `https://api.trynordly.app/healthz`

Per-service: `/healthz`, `/readyz` on each container HTTP port.

### Tracker (first deploy on existing Postgres)

`init-databases.sql` runs only on a fresh volume. On an existing server:

```bash
cd deploy
# Add to .env: TRACKER_POSTGRES_DSN=postgres://nordly:...@postgres:5432/nordly_tracker?sslmode=disable
docker compose -f docker-compose.prod.yml --env-file .env exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c 'CREATE DATABASE nordly_tracker;'
docker compose -f docker-compose.prod.yml --env-file .env build migrate tracker caddy
docker compose -f docker-compose.prod.yml --env-file .env run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env up -d tracker notes focus caddy
```

## Logs

```bash
cd deploy
docker compose -f docker-compose.prod.yml logs -f identity tracker
```

## Common fixes

**sandbox timeout / go.mod not found** — `SANDBOX_DEFAULT_TIMEOUT_MS=10000`, host dir `/var/lib/sandbox-work` bind-mounted, `RUNNER_MODE=docker`.

**sandbox Docker access** — the sandbox runs unprivileged and reaches Docker through `docker-socket-proxy`; it does not mount `/var/run/docker.sock`. Prepare the workspace with `sudo install -d -m 700 -o 65534 -g 65534 /var/lib/sandbox-work`. The proxy is still a privileged boundary: keep it on the internal `sandbox_docker` network and do not publish port 2375.

**JWT errors** — run `make keys`; `private.pem` must remain `0600` and be owned by the account identified by `DEPLOY_UID`/`DEPLOY_GID` in `.env`. `public.pem` is `0644` and shared with JWT consumers.

**migrations failed**

Empty prod (no users):

```bash
cd deploy
docker compose -f docker-compose.prod.yml stop identity billing sandbox rooms tracker notes focus identity-bot caddy
make reset-db
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

Fresh / empty databases: `reset-db` then migrate (see [docs/MIGRATION_CUTOVER.md](./docs/MIGRATION_CUTOVER.md)).

Normal schema change (new goose files after init): `docker compose … run --rm migrate` only.

## Backups

```bash
cd deploy
make backup-db
```

Copy the archive and `.sha256` sidecar to encrypted off-site storage. Restore targets, verification, and drill procedure: [docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md).
Run and record the isolated restore drill quarterly; never use production as the drill target.

Read-only schema deprecation observations:

```bash
cd deploy
make audit-schema >"/var/lib/nordly-ops/schema-audit-$(date -u +%Y%m%dT%H%M%SZ).txt"
```

Keep output in private ops storage, never Git. Before any DROP, satisfy the
full [schema contract gate](docs/SCHEMA_CONTRACT_GATE.md): at least 30 daily
observations and two production releases, with PostgreSQL statistics resets
accounted for, code/query evidence, approvals, and a successful isolated restore
drill. Observation never authorizes a DROP by itself.

## Monitoring

Self-hosted: [grafana/README.md](grafana/README.md). **Default:** `make up` and `make deploy` start Prometheus + Grafana (`--profile monitoring`).

```bash
docker compose -f docker-compose.prod.yml --profile monitoring up -d prometheus grafana
```

Grafana: https://grafana.trynordly.app — configure alert notification channels for rules in `prometheus-alerts.yml`.

**Dashboards** (auto-provisioned from `deploy/grafana/dashboards/`):

| File | Title |
|------|-------|
| `nordly-platform.json` | Platform |
| `nordly-http-routes.json` | HTTP routes |
| `nordly-billing.json` | Billing |
| `nordly-product.json` | Product |

Key metrics: `up`, `http_requests_total`, `http_request_duration_seconds`.

Metrics endpoints are not published on host ports; Prometheus scrapes service names over the Compose network. Do not add a public `/metrics` route. A dedicated scrape-only network and bearer authentication should be added before any external metrics consumer is introduced; retain the current internal scrape path so Prometheus continues to work.

**Business counters:** `identity_auth_total`, `tracker_work_tasks_total`, `focus_sessions_total`, `billing_usage_consume_total`, `billing_subscriptions_total`, `billing_webhook_events_total` — see Product dashboard and [grafana/README.md](grafana/README.md).

## Rooms scale

Single replica by default. Multiple pods need sticky `/ws/*` — see [services/rooms/AGENTS.md](../services/rooms/AGENTS.md).

## Secret rotation

**INTERNAL_API_TOKEN** — update `.env`, restart services that use `x-internal-token` (tracker, billing adapters, etc.).

**JWT keys** — maintenance window; redeploy all JWT consumers.

## Pre-deploy security check

Run `make audit-env` before a manual deployment (it is also a prerequisite of `make up` and `make deploy`). For production-like environments it rejects `CHANGE_ME` placeholders, missing Redis/Grafana/Tribute secrets, unset deploy UID/GID, and absent JWT key files.

## Deploy from CI

GitHub Actions (`deploy.yml`) runs on merge to `main`. Server repo: `/opt/project-nordly`.

If git fails with "dubious ownership" after manual rsync: `git config --global --add safe.directory /opt/project-nordly && chown -R $(whoami):$(id -gn) /opt/project-nordly`.
