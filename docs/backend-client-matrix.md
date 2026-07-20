# Backend ↔ client matrix

Cross-reference of **what ships in proto/HTTP** vs **what Nordly desktop + web companion actually call**.

**Legend**

| Mark | Meaning |
|------|---------|
| ✅ | Called by at least one client; fields listed are **read or sent** |
| ⚠️ | HTTP exists; **no app client** (s2s, admin, or dead) |
| 🔸 | Called but **some response/request fields unused** by all clients |

Last reviewed: 2026-07-15 (grep-based inventory, not OpenAPI diff).

---

## identity

| RPC / HTTP | Nordly | Web | Notes |
|------------|--------|-----|-------|
| POST `/v1/auth/telegram` | ✅ `code` → tokens + `user.id` | — | |
| POST `/v1/auth/refresh` | ✅ `refreshToken` | 🔸 dormant if no tokens | Web clears JWT on boot |
| GET `/v1/auth/config` | ✅ `telegramBotUsername` | — | Custom HTTP |
| POST `/v1/devices/register` | ✅ `deviceId`, `name`, `appVersion` → all response fields | — | Custom HTTP; JWT |
| HEAD `/healthz` | ✅ status only | — | SyncEngine |
| GET `/v1/users/{id}/avatar` | 🔸 via `avatar_url` path in user | — | Not fetched directly; relative URL in user |
| GetUser / GetUserByTelegramID / ValidateToken / MintScopedAccessToken | — | — | **s2s only** (rooms, billing, sandbox) |

**Removed (no client):** Yandex OAuth, GetMe, UpdateMe, Logout.

---

## tracker

| RPC / HTTP | Nordly | Web | Unused / local-only |
|------------|--------|-----|------------------------|
| Work tasks CRUD + schedule + patch + conference | ✅ | — | |
| ListEpics | ✅ `id,name,color` | — | |
| Settings get/patch | ✅ Google + Zoom flags | — | |
| Google Calendar events CRUD + calendars + url + disconnect | ✅ | — | |
| Zoom url + disconnect | ✅ | — | |
| Google OAuth callback HTTP | ✅ browser | — | Not called from TS |

**Task fields:** `order` is **client-only** (IndexedDB); not read from API responses.  
**Not in proto:** `CreateEpic` removed; epics seeded in `ListEpics`.

---

## notes

| RPC / HTTP | Nordly | Web | Unused fields |
|------------|--------|-----|----------------|
| Notes CRUD | ✅ | — | `CreateNote` / `UpdateNote` also accept `wikiLinks[]` (`linkText`, `targetNoteId`) |
| GET `/v1/notes/{id}/backlinks` | — | — | API only (no UI yet) |
| PUT/GET/DELETE `/v1/notes/{noteId}/attachments/{id}` | ✅ sync + editor | — | PNG/JPEG/GIF/WebP ≤5 MiB; 50/note; body base64 |
| GET `/v1/notes/{noteId}/attachments` | ✅ sync list | — | metadata only (no dataB64) |
| Vault init/salt/encrypt | ✅ | — | |
| Publish flow (status, share, unpublish, make-private) | ✅ `attachments[]` on share | — | client sends plaintext image bytes; server rewrites `nordly-asset:`; password shares embed data URLs (≤15 MiB raw) |
| GET `/v1/notes/public/{slug}` | — | ✅ `title`, `body_md`, `password_required` | `published_at` parsed, **not shown** |
| POST `/v1/notes/public/{slug}/access` | — | ✅ `password` → `title`, `body_md` | `published_at` parsed, **not shown** |
| GET `/v1/notes/public/{slug}/assets/{assetId}` | — | ✅ published `<img>` | raw bytes + nosniff; public shares only (`publish_password_hash IS NULL`) |

**Removed:** ListNotes pagination (`limit`/`cursor`/`next_cursor`).

---

## focus

| RPC / HTTP | Nordly | Web |
|------------|--------|-----|
| start / end session | ✅ | — |
| GET stats | ✅ heatmap, streaks, totals | — |

**Removed from API:** `queue` (client zeros locally).

---

## rooms

| RPC / HTTP | Nordly | Web | Unused fields |
|------------|--------|-----|----------------|
| POST share-whiteboard | ✅ `accessToken`, `roomId`, `invite.url`, `expiresIn` | — | |
| POST publish-whiteboard | ✅ `slug`, `url` | — | |
| POST guest-create | — | ✅ | `invite.url`; client builds share URL from `room.id` |
| GET room | — | ✅ `id`, `owner_id`, `room_type`, `language`, `created_at`, `expires_at` | |
| POST guest-join | — | ✅ `displayName` body | |
| POST close | — | ✅ | |
| GET `/v1/rooms/{id}/initial-scene` | — | ✅ `scene_json` | |
| GET boards/public/{slug} | — | ✅ `title`, `sceneJson` | |
| WS `/ws/editor/{roomId}` | — | ✅ | |

**Removed:** legacy `invite_token`, `InviteLink.token`.

---

## billing

| RPC / HTTP | Nordly | Web | Notes |
|------------|--------|-----|-------|
| GET `/v1/billing/me` | ✅ `features`, `limits` | — | JWT |
| Admin grant/revoke/entitlement | — | — | **Ops only** |
| BillingInternalService gRPC | — | — | notes, identity, sandbox (required at startup) |

**Removed (no client):** `GET /v1/billing/plans`, `POST /v1/billing/trial/start`.

---

## sandbox

| RPC / HTTP | Nordly | Web | Unused fields |
|------------|--------|-----|----------------|
| POST code-runs, GET code-runs/{id} | — | ✅ | `tests_total` / `tests_passed` only |
| POST format | — | ✅ Go only | |
| WS `/ws/lsp/go` | — | — | Proxied in vite, **no web caller** |

---

## Wire-format debt

None tracked — single read path per field (2026-07-02):

- **Nordly:** camelCase via `shared/api/json.ts`
- **Web:** camelCase on wire → `normalizeProtoJson()` → snake_case internal types; `parseAuthTokens` vs `parseGuestAccessToken`

---

## Recommended next cuts

1. **Full field-level pass:** auto-generate this doc from proto + ripgrep on `requireJson*`.
