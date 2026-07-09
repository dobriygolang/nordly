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
| **Public** | `GET /v1/notes/public/{slug}` — metadata only when password-protected; `POST /v1/notes/public/{slug}/access` with `{ password }` unlocks body |

## Env

| Var | Default (dev) |
|-----|---------------|
| `HTTP_PORT` | `8090` |
| `GRPC_PORT` | `9100` |
| `POSTGRES_DSN` | `postgres://postgres:postgres@localhost:5442/nordly_notes?sslmode=disable` |
| `JWT_PUBLIC_KEY` or `JWT_PUBLIC_KEY_FILE` | required |
| `BILLING_GRPC_ADDR` | default `127.0.0.1:9095` |
| `INTERNAL_API_TOKEN` | **required** — billing gRPC for publish feature gates |
| `PUBLIC_BASE_URL` | **required** — publish link base |

## Billing

`ShareNoteToWeb` enforces `published_notes_active` quota on new publishes (unlimited on `default` plan). **Private link** (`publish_password` entitlement):

- `password_protected` + `password` — bcrypt hash; public GET omits body until `AccessPublishedNote`.
- Optional `expires_in_days` — link stops working after 7/30/90 days.
- Opaque UUID slug when password is set.

`GetPublishStatus` returns `password_protected` and `expires_at` for the owner UI.

## Data model

- `vault_salts` — per-user random 32-byte salt (base64 to client)
- `notes` — `body_md` plaintext or ciphertext; `encrypted`, `published`, `publish_slug`, `publish_password_hash`, `publish_expires_at`

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
