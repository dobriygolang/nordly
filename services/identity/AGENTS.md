# AGENTS.md — identity service

Work from this directory only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/identity`

## Purpose

Auth and user profiles: **Telegram bot code**, **RS256 JWT** + Redis refresh.

## Ports

HTTP `8080` | gRPC `9090` | Postgres `5432` / `nordly` | Redis `6379`

## Data

**users** — `id`, `username`, `telegram_id`, `avatar_url`, `timezone`.

**Redis:** `login_code:{code}` (5m), `refresh:{hash}` (720h).

**user_devices** — registered Nordly desktops for cloud sync (`user_id`, `device_id`, `name`, `app_version`, `first_seen_at`, `last_seen_at`).
Registration locks the parent user row, so counting devices, enforcing the billing limit, and upserting are atomic per user.

## Auth flows

**Telegram:** bot issues code → `POST /v1/auth/telegram` → upsert by `telegram_id`.

**Refresh:** `POST /v1/auth/refresh` with refresh token.

Other services verify JWT via `pkg/jwt` or `GET /v1/jwt/public.pem`.

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/auth/telegram`, `/refresh` | no |
| GET | `/v1/auth/config` | no — Telegram bot username for login widget |
| POST | `/v1/devices/register` | JWT — cloud sync device registration (billing gates) |

Internal gRPC (s2s token): `GetUser`, `GetUserByTelegramID`, `ValidateToken`, `MintScopedAccessToken` (rooms guests; `role` + `scope` required — no silent `guest` invent).

Custom HTTP contracts (not in proto):

| Method | Path | Contract |
|--------|------|----------|
| GET | `/v1/auth/config` | Public; returns `{ "telegramBotUsername": string }` |
| POST | `/v1/devices/register` | Bearer JWT; `{ deviceId, name, appVersion }` (`X-Device-ID` may supply a missing `deviceId`); returns `{ deviceId, cloudSyncEnabled, deviceLimit, devicesRegistered }` |
| GET | `/v1/jwt/public.pem` | Public RS256 verification key |
| GET | `/v1/users/{id}/avatar` | Public avatar proxy for the profile URL emitted by identity |
| GET/HEAD | `/healthz` | Liveness |

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
| INTERNAL_API_TOKEN | required in production (s2s gRPC + billing adapter) |
| BILLING_GRPC_ADDR | default `127.0.0.1:9095` — entitlements for device registration |
| REDIS_ADDR | default `localhost:6379` — login codes + refresh tokens |
| REDIS_PASSWORD | required in production; passed to identity and identity-bot Redis clients |
| AUTH_RATE_LIMIT_PER_MINUTE | `60` in every environment; must be greater than zero |

## Metrics

`GET /metrics` — HTTP instrumentation + `identity_auth_total{method,result}` (`internal/auth/metrics/`).
