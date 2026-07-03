# AGENTS.md — notes service

Work from `services/notes/` only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/notes`

## Purpose

Obsidian-like notes for Nordly (Tauri desktop app):

- Markdown notes (CRUD)
- E2EE vault: server stores salt + ciphertext only (client PBKDF2 200k + AES-256-GCM)
- Share-to-web / unpublish / make-private flows

## Ports

HTTP `8090` | gRPC `9100` | PG `5442` / `nordly_notes`

## HTTP (grpc-gateway)

| Area | Paths |
|------|-------|
| Vault | `POST /v1/notes/vault/init`, `GET /v1/notes/vault/salt`, `POST /v1/notes/vault/notes/{id}/encrypt` |
| Notes | `GET/POST /v1/notes`, `GET/PUT/DELETE /v1/notes/{id}` |
| Publish | `POST /v1/notes/{id}/share-to-web`, `unpublish`, `make-private`, `GET publish-status` |
| **Public** | `GET /v1/notes/public/{slug}` — no auth; published plaintext only |

## Env

| Var | Default (dev) |
|-----|---------------|
| `HTTP_PORT` | `8090` |
| `GRPC_PORT` | `9100` |
| `POSTGRES_DSN` | `postgres://postgres:postgres@localhost:5442/nordly_notes?sslmode=disable` |
| `JWT_PUBLIC_KEY` or `JWT_PUBLIC_KEY_FILE` | required |
| `BILLING_GRPC_ADDR` | default `127.0.0.1:9095` |
| `INTERNAL_API_TOKEN` | **required** — billing gRPC for `cloud_notes_count` gate |
| `PUBLIC_BASE_URL` | **required** — publish link base |

## Billing

`CreateNote` checks active note count against billing gauge `cloud_notes_count`. Billing client is always wired at startup; missing entitlement or billing error fails the create (no noop/unlimited fallback).

`ShareNoteToWeb` enforces `published_notes_active` quota on new publishes. Optional request flags `unlisted` and `password_protected` gate `publish_unlisted` and `publish_password` entitlements.

## Data model

- `vault_salts` — per-user random 32-byte salt (base64 to client)
- `notes` — `body_md` plaintext or ciphertext; `encrypted`, `published`, `publish_slug`

Soft-delete: `archived_at` set on delete.

## Commands

```bash
cd services/notes
make start | gen-proto | test | lint | build
```

Build: `GOWORK=off`

## Metrics

`GET /metrics` — HTTP instrumentation only (no domain counters yet).

Nordly client: `apps/nordly/src/renderer/src/features/notes/api/notesClient.ts`, vault in `apps/nordly/src/renderer/src/features/notes/repository/vaultRemote.ts`.
