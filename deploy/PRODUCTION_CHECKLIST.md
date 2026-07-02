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
| `INTERNAL_API_TOKEN` | `openssl rand -hex 32` |
| `PUBLIC_BASE_URL` | `https://trynordly.app` (notes publish + rooms live/board links) |
| `NORDLY_CALLBACK_URL` | `nordly://settings` (Google Calendar OAuth → Nordly desktop) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Cloud OAuth app (Calendar integration; optional) |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (encrypts Google refresh tokens at rest; optional but recommended) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | BotFather |
| `CADDY_EMAIL` | Let's Encrypt |

JWT: `cd deploy && make keys` → `secrets/jwt/*.pem` (do not commit).

Optional: Tribute webhooks, CI-only `services/ai` LLM keys, Grafana password — see [RUNBOOK.md](./RUNBOOK.md).

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

## 4. Smoke test

- [ ] `https://api.trynordly.app/healthz`
- [ ] Live room guest create + WS
- [ ] Published note `/notes/{slug}` and board `/board/{slug}`
- [ ] Nordly login (Telegram)
- [ ] `docker compose ps` — healthy

Ops: [RUNBOOK.md](./RUNBOOK.md)
