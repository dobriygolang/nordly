# AGENTS.md — identity service

Work from this directory only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/identity`

## Purpose

Auth and user profiles: **Telegram bot code**, **RS256 JWT** + Redis refresh.

## Ports

HTTP `8080` | gRPC `9090` | Postgres `5432` / `nordly` | Redis `6379`

## Data

**users** — `id`, `username`, `telegram_id`, `avatar_url`, `timezone`. Migration `00002` drops legacy `yandex_id`.

**Redis:** `login_code:{code}` (5m), `refresh:{hash}` (720h).

## Auth flows

**Telegram:** bot issues code → `POST /v1/auth/telegram` → upsert by `telegram_id`.

**Refresh:** `POST /v1/auth/refresh` with refresh token.

Other services verify JWT via `pkg/jwt` or `GET /v1/jwt/public.pem`.

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/auth/telegram`, `/refresh` | no |
| GET | `/v1/auth/config` | no — Telegram bot username for login widget |

Internal gRPC (s2s token): `GetUser`, `GetUserByTelegramID`, `ValidateToken`, `MintScopedAccessToken` (rooms guests).

Extra HTTP: `/healthz`, `/v1/jwt/public.pem`, `GET /v1/users/{id}/avatar`.

## Commands

```bash
make gen-jwt-keys   # dev keys → scripts/dev/jwt/
make start          # deps + migrate + API
make run-bot        # Telegram bot
make gen-proto | lint | test | build
```

## Env (main)

| Variable | Default |
|----------|---------|
| JWT_* | required (`make gen-jwt-keys` for dev) |
| JWT_ACCESS_TTL / JWT_REFRESH_TTL | `15m` / `720h` |
| TELEGRAM_BOT_TOKEN | required (API avatar proxy + bot) |
| TELEGRAM_BOT_USERNAME | required (`GET /v1/auth/config`) |
| INTERNAL_API_TOKEN | required in production (s2s gRPC) |
