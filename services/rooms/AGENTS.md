# AGENTS.md — rooms service

Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/rooms`

## Purpose

Live collab rooms: REST lifecycle + WebSocket Yjs sync for **code** (`Y.Text code`) and **system design** (Excalidraw: `Y.Map elements` + `Y.Array elementIds` + `Y.Map files`; legacy `Y.Text scene` auto-migrated).

Room types: `practice` (code), `system_design` (Excalidraw).

## Layout

```
internal/app/api/rooms/          transport + proto_enums.go (ROOM_TYPE_*, ROOM_LANGUAGE_*)
internal/ws/                     hub.go + room_hub.go + conn.go + kinds.go (custom WS JSON)
internal/room/model/             entities + typed enums + errors.go
internal/room/repository/        Store port + Postgres (sentinels alias model)
internal/room/service/           thin delegate + GetRoom/CloseRoom
internal/room/usecase/command/   guest create/join, share/publish whiteboard
```

Persistence port: `repository.Store` (mockery). Domain sentinels live in `model/errors.go`.

## Ports

HTTP `8087` | gRPC `9097` | PG `5440` / `nordly_rooms`

## API

| RPC | HTTP | Auth |
|-----|------|------|
| GetRoom | `GET /v1/rooms/{room_id}` | `editor:{room_id}` scoped JWT; bad input → InvalidArgument; expired → gRPC FailedPrecondition / HTTP 410 Gone |
| GuestJoin | `POST /v1/rooms/{room_id}/guest-join` | no |
| CreateGuestRoom | `POST /v1/rooms/guest-create` | no — `practice` or `system_design` only |
| CloseRoom | `POST /v1/rooms/{room_id}/close` | `editor:{room_id}` scoped JWT; expired → gRPC FailedPrecondition / HTTP 410 Gone |
| ShareWhiteboard | `POST /v1/rooms/share-whiteboard` | user-session JWT (no `scp`, not guest) |
| GetInitialScene | `GET /v1/rooms/{room_id}/initial-scene` | `editor:{room_id}` scoped JWT; expired → gRPC FailedPrecondition / HTTP 410 Gone |
| PublishWhiteboard | `POST /v1/rooms/publish-whiteboard` | user-session JWT (no `scp`, not guest) |
| GetPublishedBoard | `GET /v1/rooms/boards/public/{slug}` | no |

WebSocket: `GET /ws/editor/{room_id}` requires `editor:{room_id}` via `Authorization: Bearer` or `Sec-WebSocket-Protocol: access_token.<JWT>` — not `?token=`, so access logs cannot capture the JWT. The token subject must already exist in `code_room_participants`; the upgrade path never creates participants. Expired rooms return HTTP 410. Browser origins must match `CORS_ALLOWED_ORIGINS`; this setting is required in production.

Each room hub serializes sequence assignment, replay-buffer insertion, and fanout under one room order. Registration queues the latest snapshot plus buffered operations after its sequence watermark before making the client visible to live fanout. Every accepted snapshot replaces the previous one by receive order, regardless of payload size. The replay ring retains the latest 10,000 operations while the process is alive.

Each socket has one write pump for data, ping/pong, and close frames. Room closure sends `room_closed` then close 1000 (`room closed`); process shutdown uses 1001; rate-limit, read-only-write, and slow-client violations use 1008; internal failures use 1011. Enqueue after closure is rejected. A client over 200 messages/second or a writer that cannot keep up is disconnected instead of silently dropping live updates.

**Creation and token order:** `CreateRoom` persists the room, owner participant, and optional initial scene in one PostgreSQL transaction. `CreateGuestRoom` and `ShareWhiteboard` call that operation first, mint the explicitly persisted owner subject after commit, and check `DeleteRoom` compensation if minting fails. `GuestJoin` persists a generated participant before minting that exact subject and checks `DeleteParticipant` compensation on mint failure. The identity adapter rejects an empty token or a returned subject different from the requested persisted UUID.

**Whiteboard (Nordly):** `ShareWhiteboard` requires a user-session JWT at the interceptor, seeds an Excalidraw scene, and returns `room_id` + scoped JWT + invite URL (title required). `PublishWhiteboard` stores a read-only snapshot (title + scene_json required); `GetPublishedBoard` serves them by slug. Empty/non-latin titles get a random UUID slug (no invented word like `board`). Empty names, bad types, or bad UUIDs map to `InvalidArgument`. Guest rate limiting uses the rightmost `X-Forwarded-For` hop.

**Public `Room` JSON:** `id`, `owner_id`, `room_type`, `language`, `expires_at`, `created_at` only (no ws_url, visibility, participants). `room_type` / `language` are proto enums (`ROOM_TYPE_PRACTICE`, `ROOM_LANGUAGE_GO`, …). Domain/DB stay `practice` / `go`. Guest create still accepts only practice + system_design.

Frontend: `code.trynordly.app/` — public create via `CreateGuestRoom`; guest flow mints scoped JWT via identity s2s. Short room URL `code.trynordly.app/{roomId}` (legacy `trynordly.app/live/{roomId}` still served by the same SPA).

**Guest join is open:** shared rooms join via `/{roomId}` on the live host (UUID in path is the capability). Private rooms remain forbidden for guests.
Guest create/join accepts only `practice` and `system_design` rooms. Both unauthenticated endpoints are limited to 30 requests per client IP per minute.

**Share URLs:** `CreateGuestRoom` and `ShareWhiteboard` return `InviteLink.url` = `{LIVE_PUBLIC_BASE_URL}/{room_id}`. Frontend copies the same short URL client-side. Published boards use `{PUBLIC_BASE_URL}/board/{slug}`.

Roles: `owner`, `participant`, `viewer`. Migration `00002` rewrites legacy `interviewer` rows to `participant`; unknown stored roles, room types, languages, and visibility values fail scanning.

## Scale

Yjs snapshots, replay buffers, sequence counters, and fanout are **in-process**. Production therefore defaults to one Rooms replica. With multiple replicas, the proxy must consistently route every `/ws/editor/{roomId}` connection for the same room to the same long-lived replica; ordinary per-client affinity can split collaborators and is insufficient. Replica restart or drain discards in-memory bootstrap history. See [deploy/RUNBOOK.md](../../deploy/RUNBOOK.md).

## Commands

```bash
cd services/rooms
make start   # JWT_PUBLIC_KEY_FILE=../identity/scripts/dev/jwt/public.pem
make gen-proto | build
```

Env: JWT, `INTERNAL_API_TOKEN`, `IDENTITY_GRPC_ADDR`, `PUBLIC_BASE_URL` (published boards), `LIVE_PUBLIC_BASE_URL` (guest invite / live-share links), `CORS_ALLOWED_ORIGINS` (required in production; include `https://code.trynordly.app`), `GUEST_ROOM_TTL` (3h).

## Layout

```
internal/room/
├── model/           # entities, Room.IsExpired, ScopedRole, policy, invite/publish helpers
├── dto/             # RoomView, guest/share/publish result DTOs
├── repository/      # Store port + Postgres
├── service/         # Service interface; thin delegate to usecases + trivial reads
                         # New returns error if Repo, Identity, URLs, GuestRoomTTL, or Now missing
└── usecase/command/
    ├── create_guest_room/
    ├── guest_join/
    ├── share_whiteboard/
    └── publish_whiteboard/
internal/app/api/rooms/   # transport — one RPC per file
internal/ws/              # Yjs hub
```

## Metrics

`GET /metrics` — HTTP instrumentation only (no domain counters yet).
