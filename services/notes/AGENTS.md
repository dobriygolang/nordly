# AGENTS.md — notes service

Work from `services/notes/` only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/notes`

## Layout

```
internal/notes/model/              — entities + AttachmentInput
internal/notes/repository/           — Store port + Postgres
internal/notes/service/              — Service facade (notes.go, vault.go, attachments.go, publish.go); JWT user_id is not re-checked
internal/notes/usecase/support/      — shared attachment normalization + publish asset refs
internal/notes/usecase/command/share_note_to_web/ — ShareNoteToWeb CQRS command
internal/notes/usecase/query/access_published_note/ — public password unlock
internal/app/api/notes/              — gRPC/HTTP transport (one RPC per file)
```

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
| Attachments | `PUT/GET/DELETE /v1/notes/{note_id}/attachments/{id}`, `GET /v1/notes/{note_id}/attachments` (metadata only) |
| Publish | `POST /v1/notes/{id}/share-to-web`, `unpublish`, `make-private`, `GET publish-status` |
| **Public** | `GET /v1/notes/public/{slug}` — metadata only when password-protected; `POST /v1/notes/public/{slug}/access` with `{ password }` unlocks body; `GET /v1/notes/public/{slug}/assets/{asset_id}` serves published image bytes |

## Env

| Var | Default (dev) |
|-----|---------------|
| `HTTP_PORT` | `8090` |
| `GRPC_PORT` | `9100` |
| `POSTGRES_DSN` | `postgres://postgres:postgres@localhost:5442/nordly_notes?sslmode=disable` |
| `JWT_PUBLIC_KEY` or `JWT_PUBLIC_KEY_FILE` | required — user-session JWT (collab/guest scoped tokens rejected) |
| `PUBLIC_BASE_URL` | **required** — publish link base |

## Publish

`ShareNoteToWeb` locks the owner note row and treats that row as authoritative for encrypted/published state. It rejects `encrypted=true` under the lock (the client must first store plaintext). Publishing keeps the existing live-note behavior: `body_md` is updated in place, while `published_note_assets` is a per-share snapshot.

- `access_mode`: `PUBLIC` or `PASSWORD`; `expiry_policy`: `NEVER`, `SEVEN_DAYS`, `THIRTY_DAYS`, or `NINETY_DAYS`. Unspecified enum values are invalid.
- `PUBLIC` requires `NEVER` and no password. It always clears any password hash and expiry.
- `PASSWORD` accepts a new 4..72-byte password. An empty password is allowed only when the locked row is already password-protected, in which case its existing bcrypt hash is retained.
- Every share applies the selected expiry policy atomically; `NEVER` clears an existing expiry. A `PUBLIC` → `PASSWORD` transition rotates to an opaque UUID slug.
- Public GET omits a password-protected body until `AccessPublishedNote`. Wrong passwords map to gRPC `PermissionDenied`; malformed stored bcrypt hashes are internal errors.
- Password access is limited to 10 attempts per client IP per minute at the shared gRPC boundary used by direct gRPC and grpc-gateway HTTP traffic. Direct gRPC peers cannot override their key with forwarded metadata; gateway traffic uses the rightmost forwarded hop appended from the HTTP peer.

`GetPublishStatus` returns canonical `access_mode` and `expires_at` for the owner UI.

## Data model

- `vault_salts` — per-user random 32-byte salt (base64 to client)
- `notes` — `body_md` plaintext or ciphertext; `encrypted`, `published`, `publish_slug`, `publish_password_hash`, `publish_expires_at`. Database CHECK constraints require complete plaintext publish state, forbid publish state on unpublished/archived/encrypted rows, and allow expiry only with password access.
- `note_links` — wiki-link graph metadata (`source_note_id`, optional `target_note_id`, `link_text`); **client-provided** on create/update (server does not parse encrypted `body_md`)
- `note_attachments` — owner-only image data (PNG/JPEG/GIF/WebP, matching plaintext magic bytes, max 5 MiB each and 50 per note); encrypted bytes are opaque; attachments are removed when the note is archived
- `published_note_assets` — public-share image snapshots; public shares reference relative asset paths, while password-protected shares embed data URLs (capped at 15 MiB total raw bytes). Public asset GET requires an unprotected (non-password) published note.

Soft-delete: `archived_at` is set transactionally; all publish fields/assets, attachments, and source/target `note_links` are cleared.
Create/update validates every non-empty wiki target in the same write transaction and locks active target rows before replacing links.
Titles are capped at 1 KiB and note/ciphertext/published bodies at 32 MiB.
`ListNotes` is intentionally capped at 200 newest notes; cursor pagination is deferred until the
desktop sync protocol can consume pages without introducing a second list path.

## Commands

```bash
cd services/notes
make start | gen-proto | test | lint | build
go generate ./internal/notes/repository/
NOTES_TEST_POSTGRES_DSN='postgres://postgres:postgres@localhost:5442/nordly_notes?sslmode=disable' go test -race ./internal/notes/repository
```

Build: `GOWORK=off`. Domain ports use mockery (`repository/mocks`); `service.New` returns an error if Repo/PublicBaseURL missing.

## Metrics

`GET /metrics` — HTTP instrumentation only (no domain counters yet).

Nordly client: `apps/nordly/src/renderer/src/features/notes/api/notesClient.ts`, vault HTTP in `apps/nordly/src/renderer/src/features/notes/remote/vaultRemote.ts`.
