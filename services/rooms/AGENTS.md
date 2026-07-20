# AGENTS.md — rooms service

Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/rooms`

## Purpose

Live collab rooms: REST lifecycle + WebSocket Yjs sync for **code** (`Y.Text code`) and **system design** (Excalidraw: `Y.Map elements` + `Y.Array elementIds` + `Y.Map files`; legacy `Y.Text scene` auto-migrated).

Room types in prod UI: `practice` (code), `system_design` (Excalidraw). Legacy DB values `interview`, `pair_mock` may still exist.

## Ports

HTTP `8087` | gRPC `9097` | PG `5440` / `nordly_rooms`

## API

| RPC | HTTP | Auth |
|-----|------|------|
| GetRoom | `GET /v1/rooms/{room_id}` | `editor:{room_id}` scoped JWT |
| GuestJoin | `POST /v1/rooms/{room_id}/guest-join` | no |
| CreateGuestRoom | `POST /v1/rooms/guest-create` | no — `practice` or `system_design` only |
| CloseRoom | `POST /v1/rooms/{room_id}/close` | `editor:{room_id}` scoped JWT |
| ShareWhiteboard | `POST /v1/rooms/share-whiteboard` | JWT |
| GetInitialScene | `GET /v1/rooms/{room_id}/initial-scene` | `editor:{room_id}` scoped JWT |
| PublishWhiteboard | `POST /v1/rooms/publish-whiteboard` | JWT |
| GetPublishedBoard | `GET /v1/rooms/boards/public/{slug}` | no |

WebSocket: `GET /ws/editor/{room_id}?token=JWT` requires `editor:{room_id}` and rejects expired rooms. Browser origins must match `CORS_ALLOWED_ORIGINS`; this setting is required in production.

**Whiteboard (Nordly):** `ShareWhiteboard` seeds an Excalidraw scene and returns `room_id` + scoped JWT + invite URL (title required). `PublishWhiteboard` stores a read-only snapshot (title + scene_json required); `GetPublishedBoard` serves them by slug.

**Public `Room` JSON:** `id`, `owner_id`, `room_type`, `language`, `expires_at`, `created_at` only (no ws_url, visibility, participants).

Frontend: `/live/new` — public create via `CreateGuestRoom`; guest flow mints scoped JWT via identity s2s. `/live/:roomId` → `CollabRoomPage.tsx` (CodeMirror or Excalidraw by `room_type`).

**Guest join is open:** shared rooms join via `/live/{roomId}` (UUID in path is the capability). Private rooms remain forbidden for guests.
Guest create/join accepts only `practice` and `system_design` rooms. Both unauthenticated endpoints are limited to 30 requests per client IP per minute.

**Share URLs:** `CreateGuestRoom` and `ShareWhiteboard` return `InviteLink.url` = `{PUBLIC_BASE_URL}/live/{room_id}`. Frontend copies the same short URL client-side.

Roles: `owner`, `participant`, `viewer`. Legacy DB value `interviewer` may still exist on old rooms.

## Scale

Yjs state is **in-process** per pod. Default: single replica. Multiple replicas need sticky sessions on `/ws/*` — see [deploy/RUNBOOK.md](../../deploy/RUNBOOK.md).

## Commands

```bash
cd services/rooms
make start   # JWT_PUBLIC_KEY_FILE=../identity/scripts/dev/jwt/public.pem
make gen-proto | build
```

Env: JWT, `INTERNAL_API_TOKEN`, `IDENTITY_GRPC_ADDR`, `PUBLIC_BASE_URL`, `CORS_ALLOWED_ORIGINS` (required in production), `ROOM_TTL` (6h), `GUEST_ROOM_TTL` (3h).

**Billing:** not wired — `live_rooms_*` entitlements exist in billing but rooms service does not consume them yet.

## Metrics

`GET /metrics` — HTTP instrumentation only (no domain counters yet).
