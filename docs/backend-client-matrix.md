# Backend ↔ client matrix

Cross-reference of **what ships in proto/HTTP** vs **what Nordly desktop + web companion actually call**.

**Legend**

| Mark | Meaning |
|------|---------|
| ✅ | Called by at least one client; fields listed are **read or sent** |
| ⚠️ | HTTP exists; **no app client** (s2s, admin, or dead) |
| 🔸 | Called but **some response/request fields unused** by all clients |

Last reviewed: 2026-08-27 (backend consistency pass).

---

## identity

| RPC / HTTP | Nordly | Web | Notes |
|------------|--------|-----|-------|
| POST `/v1/auth/telegram` | ✅ `code` → tokens + `user.id` | — | |
| POST `/v1/auth/refresh` | ✅ `refreshToken` | 🔸 dormant if no tokens | Web clears JWT on boot |
| GET `/v1/auth/config` | ✅ `telegramBotUsername` | — | Custom HTTP |
| POST `/v1/devices/register` | ✅ `deviceId`, `name`, `appVersion` → all response fields | — | Custom HTTP; user-session JWT |
| HEAD `/healthz` | ✅ status only | — | SyncEngine |
| GET `/v1/users/{id}/avatar` | 🔸 via `avatar_url` path in user | — | Not fetched directly; relative URL in user |
| GetUser / GetUserByTelegramID / ValidateToken / MintScopedAccessToken | — | — | **s2s only** (rooms, sandbox). Mint role is proto `SCOPED_ROLE_GUEST` / `SCOPED_ROLE_OWNER`. ValidateToken accepts user-session JWTs only (scoped collab/guest tokens are invalid). |

**Removed (no client):** Yandex OAuth, GetMe, UpdateMe, Logout.

---

## tracker

| RPC / HTTP | Nordly | Web | Unused / local-only |
|------------|--------|-----|------------------------|
| Work tasks CRUD + schedule + patch + conference | ✅ proto `WORK_STATUS_*` / `WORK_KIND_*` / `CONFERENCE_PROVIDER_*` (IDB stays `todo` / `meet`); patch sends `googleEventId`+`googleCalendarId` together | — | |
| ListEpics | ✅ `id,name,color` | — | |
| Settings get/patch | ✅ Google + Zoom flags | — | |
| Google Calendar events CRUD + calendars + url + disconnect | ✅ update/delete require exact `calendarId` | — | |
| Zoom url + disconnect | ✅ | — | |
| Google OAuth callback HTTP | ✅ browser | — | Not called from TS |

**Task fields:** `order` is **client-only** (IndexedDB); not read from API responses.  
**Not in proto:** `CreateEpic` removed; epics seeded in `ListEpics`.

---

## notes

| RPC / HTTP | Nordly | Web | Unused fields |
|------------|--------|-----|----------------|
| Notes CRUD | ✅ | — | `CreateNote` / `UpdateNote` also accept `wikiLinks[]` (`linkText`, `targetNoteId`) |
| PUT/GET/DELETE `/v1/notes/{noteId}/attachments/{id}` | ✅ sync + editor | — | PNG/JPEG/GIF/WebP ≤5 MiB; 50/note; body base64 |
| GET `/v1/notes/{noteId}/attachments` | ✅ sync list | — | metadata only (no dataB64) |
| Vault init/salt/encrypt | ✅ | — | |
| Publish flow (status, share, unpublish, make-private) | ✅ proto `PUBLISH_ACCESS_MODE_*` / `PUBLISH_EXPIRY_POLICY_*`; `attachments[]` on share | — | reserved `passwordProtected` / `expiresInDays`; client sends plaintext image bytes; server rewrites `nordly-asset:`; password shares embed data URLs (≤15 MiB raw) |
| GET `/v1/notes/public/{slug}` | — | ✅ `title`, `body_md`, `password_required` | `published_at` parsed, **not shown** |
| POST `/v1/notes/public/{slug}/access` | — | ✅ `password` → `title`, `body_md` | `published_at` parsed, **not shown** |
| GET `/v1/notes/public/{slug}/assets/{assetId}` | — | ✅ published `<img>` | raw bytes + nosniff; public shares only (`publish_password_hash IS NULL`) |

**Removed:** ListNotes pagination (`limit`/`cursor`/`next_cursor`).

---

## focus

| RPC / HTTP | Nordly | Web |
|------------|--------|-----|
| start / end session | ✅ proto `SESSION_MODE_POMODORO` / `SESSION_MODE_STOPWATCH` (local stays `pomodoro`) | — |
| GET stats | ✅ heatmap, streaks, totals | — |

**Removed from API:** `queue` (client zeros locally).

---

## rooms

| RPC / HTTP | Nordly | Web | Unused fields |
|------------|--------|-----|----------------|
| POST share-whiteboard | ✅ `accessToken`, `roomId`, `invite.url`, `expiresIn` | — | |
| POST publish-whiteboard | ✅ `slug`, `url` | — | reserved `publishedAt` |
| POST guest-create | — | ✅ proto `ROOM_TYPE_*` / `ROOM_LANGUAGE_*` | `invite.url`; client builds share URL from `room.id` |
| GET room | — | ✅ `id`, `owner_id`, proto `room_type` / `language`, `created_at`, `expires_at` | expired → HTTP 410 |
| POST guest-join | — | ✅ `displayName` body | expired → HTTP 410 |
| POST close | — | ✅ | expired → HTTP 410 |
| GET `/v1/rooms/{id}/initial-scene` | — | ✅ `scene_json` | expired → HTTP 410 |
| GET boards/public/{slug} | — | ✅ `title`, `sceneJson` | |
| WS `/ws/editor/{roomId}` | — | ✅ `Sec-WebSocket-Protocol: access_token.<JWT>` | expired → HTTP 410; close 1000/1008 are terminal |

**Removed:** legacy `invite_token`, `InviteLink.token`, `ws_url`, `visibility`, `participants`, `ListParticipants`.

---

## sandbox

| RPC / HTTP | Nordly | Web | Unused fields |
|------------|--------|-----|----------------|
| POST code-runs, GET code-runs/{id} | — | ✅ proto `LANGUAGE_*` / `RUN_STATUS_*`; stdout, stderr, compile output, error, exit code, duration | reserved `RUN_STATUS_FAILED`, `run_type`, `memory_kb`, `tests_*` |
| POST format | — | ✅ Go only | |

---

## Wire-format debt

Closed-set fields are proto enums (grpc-gateway emits names). HTTP remotes map to snake_case domain/UI. No dual-read of old string literals.

- **Nordly:** camelCase via `shared/api/json.ts`; task/focus remotes map `WORK_STATUS_*` / `SESSION_MODE_*`
- **Web:** camelCase on wire → `normalizeProtoJson()` → snake_case keys; rooms/sandbox remotes map `ROOM_TYPE_*` / `LANGUAGE_*` / `RUN_STATUS_*`

---

## Recommended next cuts

1. **Full field-level pass:** auto-generate this doc from proto + ripgrep on `requireJson*`.
