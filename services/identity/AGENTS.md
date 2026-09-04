# AGENTS.md — identity service

Work from this directory only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/identity`

## Purpose

Auth and user profiles: **Telegram bot code**, **RS256 JWT** + Redis refresh.

## Layout

```
internal/app/api/identity/     transport (Service + Telegram bot token only)
internal/adapter/telegram/     avatar download
internal/user/                model + repository.Store
internal/auth/                model + repository ports + service + usecase/command/*
                              # service.New returns error if Users, LoginCodes, RefreshTokens, or Tokens missing
                              # GetUser / GetUserByTelegramID / ValidateToken are one method per file (no query packages)
internal/device/              Store port + service (already)
```

## Ports

HTTP `8080` | gRPC `9090` | Postgres `5432` / `nordly` | Redis `6379`

## Data

**users** — `id`, `username`, `telegram_id`, `avatar_url`, `timezone`.

**Redis:** `login_code:{code}` (fixed 5m, reserved with `SET NX`), `refresh:{hash}` → userID (default 720h), `refresh_user:{userID}` → current hash (default 720h).
Login and refresh issuance revoke the previous hash for that user. Refresh first resolves the old hash without consuming it, prepares the replacement pair, then uses one Lua rotation to verify both old mappings and swap old→new. A failed lookup, user load, token preparation, or replacement-hash collision leaves the old credential untouched; concurrent rotation has exactly one winner.

**user_devices** — registered Nordly desktops for cloud sync (`user_id`, `device_id`, `name`, `app_version`, `first_seen_at`, `last_seen_at`).
Registration locks the parent user row, so counting devices and upserting are atomic per user.

## Auth flows

**Telegram:** bot generates and atomically reserves a code, retrying random collisions → `POST /v1/auth/telegram` → upsert by `telegram_id`. Redis `Consume` is `GETDEL`; if user create/update or token issue fails afterwards, the code is reserved again with its remaining TTL so the same code can be retried. PostgreSQL username and Telegram unique violations are mapped separately: username races retry allocation, while Telegram races reload the winning user.

**Refresh:** `POST /v1/auth/refresh` prepares a new pair and atomically rotates the current refresh hash. A concurrent refresh of the same token fails with `ErrInvalidRefreshToken`; no credential is removed before the successful Redis rotation.

Auth HTTP rate limit (`/v1/auth*`) keys by the rightmost `X-Forwarded-For` hop (same as rooms guest limits).

Other services verify JWT via `pkg/jwt` or `GET /v1/jwt/public.pem`. `pkg/jwt` exposes separate strict parsers for unrestricted user sessions and `editor:{canonical non-nil UUID}` access; editor tokens require a canonical non-nil UUID subject plus a typed `guest`/`owner` role and cannot parse as user sessions.

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/auth/telegram`, `/refresh` | no |
| GET | `/v1/auth/config` | no — Telegram bot username for login widget |
| POST | `/v1/devices/register` | user-session JWT (not collab/guest scoped) — cloud sync device registration |

Internal gRPC (s2s token): `GetUser`, `GetUserByTelegramID`, `ValidateToken` (user-session JWT only — collab/guest scoped tokens are `valid: false`; infra errors are not mapped to `valid: false`), `MintScopedAccessToken` (rooms guests; proto `ScopedRole` `SCOPED_ROLE_GUEST` | `SCOPED_ROLE_OWNER`; JWT claims stay `guest` / `owner`; canonical `editor:{uuid}` scope and `0 < ttl_seconds <= 24h` required; optional `user_id` is the token subject rooms generate before persist).

Custom HTTP contracts (not in proto):

| Method | Path | Contract |
|--------|------|----------|
| GET | `/v1/auth/config` | Public; returns `{ "telegramBotUsername": string }` |
| POST | `/v1/devices/register` | User-session Bearer JWT (collab/guest scoped tokens rejected); user must still exist; `{ deviceId, name, appVersion }` (`X-Device-ID` may supply a missing `deviceId`); returns `{ deviceId, cloudSyncEnabled: true, deviceLimit: -1, devicesRegistered }` (unlimited; no quota) |
| GET | `/v1/jwt/public.pem` | Public RS256 verification key |
| GET | `/v1/users/{id}/avatar` | Public proxy for the stored Telegram file reference emitted by identity; other stored avatar shapes are invariant errors |
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
| HTTP_PORT / GRPC_PORT | `8080` / `9090`; each must be within `1..65535` |
| LOG_LEVEL | `info`; must be a valid zap level |
| JWT_* | required (`make gen-jwt-keys` for dev) |
| JWT_ACCESS_TTL / JWT_REFRESH_TTL | `15m` / `720h`; whole seconds from `1s` through `24h` / `8760h` |
| TELEGRAM_BOT_TOKEN | required (API avatar proxy + bot) |
| TELEGRAM_BOT_USERNAME | required (`GET /v1/auth/config`) |
| INTERNAL_API_TOKEN | required in production (s2s gRPC) |
| REDIS_ADDR | default `localhost:6379` — login codes + refresh tokens |
| REDIS_PASSWORD | required in production; passed to identity and identity-bot Redis clients |
| AUTH_RATE_LIMIT_PER_MINUTE | `60` in every environment; must be greater than zero |

## Metrics

`GET /metrics` — HTTP instrumentation + `identity_auth_total{method,result}` (`internal/auth/metrics/`).
