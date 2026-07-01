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
| GetRoom | `GET /v1/rooms/{room_id}` | JWT |
| GuestJoin | `POST /v1/rooms/{room_id}/guest-join` | no |
| CreateGuestRoom | `POST /v1/rooms/guest-create` | no |
| CloseRoom | `POST /v1/rooms/{room_id}/close` | JWT |
| ShareWhiteboard | `POST /v1/rooms/share-whiteboard` | JWT |
| GetInitialScene | `GET /v1/rooms/{room_id}/initial-scene` | JWT |
| PublishWhiteboard | `POST /v1/rooms/publish-whiteboard` | JWT |
| GetPublishedBoard | `GET /v1/rooms/boards/public/{slug}` | no |

WebSocket: `GET /ws/editor/{room_id}?token=JWT`.

**Whiteboard (Hone):** `ShareWhiteboard` seeds an Excalidraw scene and returns a live room + invite. `PublishWhiteboard` stores a read-only snapshot; `GetPublishedBoard` serves it by slug.

Frontend: `/live/new` — public create via `CreateGuestRoom`; guest flow mints scoped JWT via identity s2s. `/live/:roomId` → `CollabRoomPage.tsx` (CodeMirror or Excalidraw by `room_type`).

**Guest join is open:** shared rooms join via `/live/{roomId}` (UUID in path is the capability). `GuestJoin` accepts an **optional** legacy `invite_token` from old `?invite=…` links; when present it must be valid and bind to the room. Private rooms remain forbidden for guests.

**Share URLs:** `CreateGuestRoom` and `ShareWhiteboard` return `InviteLink.url` = `{PUBLIC_BASE_URL}/live/{room_id}` (no query token). Frontend copies the same short URL client-side.

Roles: `owner`, `participant`, `viewer`. Legacy DB value `interviewer` may still exist on old rooms.

## Scale

Yjs state is **in-process** per pod. Default: single replica. Multiple replicas need sticky sessions on `/ws/*` — see [deploy/RUNBOOK.md](../../deploy/RUNBOOK.md).

## Commands

```bash
cd services/rooms
make start   # JWT_PUBLIC_KEY_FILE=../identity/scripts/dev/jwt/public.pem
make gen-proto | build
```

Env: JWT, `INTERNAL_API_TOKEN`, `IDENTITY_GRPC_ADDR`, `ROOM_INVITE_SECRET` (legacy `?invite=` validation only), `ROOM_TTL` (6h), `GUEST_ROOM_TTL` (1h).
