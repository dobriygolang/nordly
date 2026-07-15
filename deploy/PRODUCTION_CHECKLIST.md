# Production checklist — Nordly (trynordly.app)

Before first deploy: fill secrets, then `cd deploy && make up`.

## 1. Server

| Item | Notes |
|------|-------|
| Ubuntu 22.04+ / Debian 12+ | Docker Compose v2 |
| Ports 80, 443, 22 | nginx TLS on host; Caddy on `127.0.0.1:18080` |
| DNS A-records | `trynordly.app`, `api.trynordly.app`, `app.trynordly.app`, `grafana.trynordly.app` |

## 2. `deploy/.env`

`cp deploy/.env.example deploy/.env`

| Variable | How |
|----------|-----|
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `REDIS_PASSWORD` | `openssl rand -hex 32` (required by identity, identity-bot, and billing) |
| `INTERNAL_API_TOKEN` | `openssl rand -hex 32` |
| `PUBLIC_BASE_URL` | `https://trynordly.app` (notes publish + rooms live/board links) |
| `NORDLY_CALLBACK_URL` | `https://trynordly.app/oauth/google-calendar` (prod — web OAuth bridge → `nordly://settings`; dev desktop-only: `nordly://settings`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Cloud OAuth app (Calendar integration; optional). Prod callback: `https://trynordly.app/v1/tracker/integrations/google/callback` |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI` | Zoom meetings (optional). Prod callback: `https://trynordly.app/v1/tracker/integrations/zoom/callback` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (encrypts Google/Zoom refresh tokens at rest; **required** in tracker prod) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | BotFather |
| `CADDY_EMAIL` | Let's Encrypt |
| `DEPLOY_UID`, `DEPLOY_GID` | `id -u` and `id -g` for the account that runs `make keys`; lets identity read its mode-0600 private key without root |

JWT: `cd deploy && make keys` → `secrets/jwt/*.pem` (do not commit).

Optional: Tribute webhooks — see [RUNBOOK.md](./RUNBOOK.md).

| `GRAFANA_ADMIN_PASSWORD` | required when using `--profile monitoring` (default in `make up`) |

Set `TRIBUTE_WEBHOOK_SECRET` before production deployment, even when no current payment link is configured. Then run `make audit-env`; it rejects placeholders, missing required production secrets, and missing JWT key paths.

## 3. GitHub Actions deploy

Secrets: `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY`, optional `DEPLOY_GIT_TOKEN`.

First time on VPS (manual or scripted):

```bash
# Option A — bootstrap script (Docker + clone + .env + JWT keys):
./deploy/scripts/bootstrap-server.sh git@github.com:YOUR_ORG/project-nordly.git

# Option B — manual:
git clone git@github.com:YOUR_ORG/project-nordly.git /opt/project-nordly
cd /opt/project-nordly/deploy
cp .env.example .env && nano .env && make keys && make up
```

Updates: merge to `main` → CI deploys automatically.

**Desktop installers:** tag `nordly-vX.Y.Z` → `nordly-release.yml` builds GitHub Release (private OK) → job `sync-cdn` uploads `latest.json` + installers to `trynordly.app/desktop/` (needs same `DEPLOY_SSH_*` secrets).

## 4. Smoke test

- [ ] `https://api.trynordly.app/healthz`
- [ ] `https://trynordly.app/desktop/releases.json` (after first `nordly-v*` tag release)
- [ ] Live room guest create + WS
- [ ] Published note `/notes/{slug}` and board `/board/{slug}`
- [ ] Nordly login (Telegram)
- [ ] `https://grafana.trynordly.app` — Platform + Product dashboards load
- [ ] `docker compose ps` — healthy
- [ ] Quarterly isolated restore drill recorded from an off-site backup
- [ ] Before any schema DROP: [schema contract gate](./docs/SCHEMA_CONTRACT_GATE.md) has 30 daily observations, two production releases, and complete approvals/evidence

Ops: [RUNBOOK.md](./RUNBOOK.md) · [Disaster recovery](./docs/DISASTER_RECOVERY.md) (configure encrypted off-site backups and schedule a quarterly restore drill)
