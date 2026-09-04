# AGENTS.md — Web companion (Nordly)

Work from `apps/web/` only. Desktop app: [../nordly/AGENTS.md](../nordly/AGENTS.md). Monorepo: [../../AGENTS.md](../../AGENTS.md).

**Agent rules:** [.cursor/rules/web.mdc](.cursor/rules/web.mdc) + root [fail-fast-no-fallbacks.mdc](../../.cursor/rules/fail-fast-no-fallbacks.mdc).

## Purpose

Thin public web surface for Nordly: landing + download, guest live collab (code + Excalidraw), legal pages, published notes and whiteboards. **No user auth** on web — JWT cleared on boot; live rooms use scoped guest tokens.

## Scope (active)

| Area | Routes |
|------|--------|
| Landing | `/`, `/download` |
| Live collab | `code.trynordly.app/` (create), `code.trynordly.app/{roomId}` (join); legacy `/live/new`, `/live/:roomId` on main site |
| Public notes | `/notes/:slug`, `/n/:slug` → redirect |
| Public boards | `/board/:slug` |
| Legal | `/legal/terms`, `/legal/privacy` |

Retired routes redirect to `/` (see below).

## Routes

Defined in `src/components/AnimatedRoutes.tsx` (mounted from `src/App.tsx`):

| Route | Page | Auth |
|-------|------|------|
| `/` | `WelcomePage` on `trynordly.app`; `LiveNewPage` on `code.trynordly.app` | — |
| `/welcome` | → `/` | legacy redirect |
| `/download` | `NordlyDownloadPage` | starts latest OS installer, or shows an OS picker if none matches |
| `/oauth/google-calendar` | `OAuthBridgePage` (`google_calendar`) | OAuth bridge → `nordly://settings?google_calendar=…` |
| `/oauth/zoom` | `OAuthBridgePage` (`zoom`) | OAuth bridge → `nordly://settings?zoom=…` |
| `/notes/:slug` | `PublishedNotePage` — Nordly-flavored markdown via `lib/markdown/renderNordlyMarkdown.ts` + `styles/published-note.css` | — |
| `/n/:slug` | → `/notes/:slug` | — |
| `/board/:slug` | `PublishedBoardPage` | — |
| `/live/new` | `pages/LiveNewPage` | legacy path (still works) |
| `/live/:roomId` | `CollabRoomPage` | guest JWT (legacy path) |
| `/:roomId` | `CollabRoomPage` when UUID | short share link (canonical on `code.trynordly.app`) |
| `/pricing`, `/checkout`, `/checkout/:planSlug`, `/billing/welcome` | → `/` | retired monetization paths |
| `/legal/terms` | `LegalTermsPage` | — |
| `/legal/privacy` | `LegalPrivacyPage` | — |
| `/login`, `/profile`, `/settings`, `/auth/callback` | → `/` | retired |
| `/today`, `/dashboard`, `/learn/*`, `/mock/*`, `/interview/*`, `/tasks`, `/admin/*` | → `/` | retired |

## Backend dependencies

Base: `VITE_API_BASE` (default `/v1`). Dev proxy: `vite.config.ts`. Prod: same-origin via Caddy on `trynordly.app` (tracker OAuth callbacks at `/v1/tracker/integrations/*/callback`).

| Service | Port | Proxy prefix |
|---------|------|--------------|
| identity | 8080 | `/v1/auth` |
| sandbox | 8086 | `/v1/sandbox` |
| rooms | 8087 | `/v1/rooms`, `/ws` |
| notes | 8090 | `/v1/notes` |

### REST endpoints (active)

**rooms** — `lib/api/rooms.ts`

| Method | Path | Used by |
|--------|------|---------|
| POST | `/v1/rooms/guest-create` | `/live/new` |
| GET | `/v1/rooms/{id}` | `CollabRoomPage` |
| POST | `/v1/rooms/{id}/guest-join` | join flow |
| POST | `/v1/rooms/{id}/close` | owner controls |
| GET | `/v1/rooms/{id}/initial-scene` | system-design room bootstrap |
| GET | `/v1/rooms/boards/public/{slug}` | `PublishedBoardPage` |

**sandbox** — `lib/api/sandbox.ts`

| Method | Path | Used by |
|--------|------|---------|
| POST | `/v1/sandbox/code-runs` | code rooms |
| GET | `/v1/sandbox/code-runs/{id}` | run polling |
| POST | `/v1/sandbox/format` | Go format |

Wire `RUN_STATUS_*`: `QUEUED` / `RUNNING` / `SUCCESS` / `COMPILE_ERROR` / `RUNTIME_ERROR` / `TIMEOUT` / `INTERNAL_ERROR`. `RUN_STATUS_FAILED` is reserved and rejected.

**notes** — `lib/api/publicNotes.ts`

| Method | Path | Used by |
|--------|------|---------|
| GET | `/v1/notes/public/{slug}` | `PublishedNotePage` |
| POST | `/v1/notes/public/{slug}/access` | password-protected note unlock |

### WebSockets

| Path | Service | Client |
|------|---------|--------|
| `WS /ws/editor/{roomId}` (`Sec-WebSocket-Protocol: access_token.<JWT>`) | rooms | `lib/ws/collabEditor.ts` |

WS envelope kinds: `snapshot`, `op`, `presence`, `cursor`, `code_run`, `room_closed`.
Corrupt JSON, unknown kinds, missing Yjs/presence/`code_run` payloads, or invalid Yjs payload types fail the socket (`status: failed`, no retry). `cursor` / `room_closed` / `code_run` are side-effect kinds (not applied to the Y.Doc). Close 1000 (room closed) and 1008 (policy) are terminal; 1001/1006/1011 may retry. Expired rooms return HTTP 410 on REST and WS upgrade.

## Guest JWT flow

1. `code.trynordly.app/` (or `/live/new`) → `POST /v1/rooms/guest-create` → scoped JWT + room
2. Token stored: `sessionStorage['nordly_guest_token_{roomId}']` plus optional `expiresAt` from `expires_in`
3. Room REST + WS use guest token via `readGuestToken(roomId)` (expired local sessions are treated as missing)
4. Transient `getRoom` errors keep the stored token; 401/403/404/410 clear it and navigate home with `liveExpired`
5. Joining is open: `/{roomId}` (or `/live/:roomId`) shows a name prompt → `POST guest-join` → guest token. Canonical share URLs: `{LIVE_PUBLIC_BASE_URL}/{roomId}` (`lib/live/liveRoomUrl.ts`).

Share URLs: `publicLiveRoomUrl(roomId)` — client-side short link; Invite button copies without `POST /invite`.

Sandbox run/format send the guest JWT **and** `roomId` (editor-scoped tokens require `editor:{roomId}`).

## Live collab

| Mode | `room_type` | Editor |
|------|-------------|--------|
| Code | `practice` | `CollabCodeEditor` (CodeMirror + Yjs) |
| Diagram | `system_design` | `CollabExcalidrawEditor` |

Yjs Excalidraw schema: `lib/collab/excalidrawYjsDoc.ts` — maps `elements`, `elementIds`, `files`.

Room types in prod UI: `practice`, `system_design` only.

## Nordly integration

| Feature | Nordly action | Web result |
|---------|-------------|------------|
| Note share | `POST /v1/notes/{id}/share-to-web` | `/notes/{slug}` |
| Whiteboard live share | `POST /v1/rooms/share-whiteboard` | `code.trynordly.app/{roomId}` |
| Whiteboard publish | `POST /v1/rooms/publish-whiteboard` | `/board/{slug}` |

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE` | `/v1` | API prefix |
| `VITE_NORDLY_DOWNLOAD_MAC` | — | Override landing macOS download URL |
| `VITE_NORDLY_DOWNLOAD_WIN` | — | Override landing Windows download URL |
| `VITE_NORDLY_HERO_VIDEO` | — | Landing hero video |
| `VITE_NORDLY_HERO_POSTER` | — | Landing hero poster |
| `VITE_SITE_ORIGIN` | current origin | Canonical SEO origin |
| `VITE_LIVE_ORIGIN` | `https://code.trynordly.app` (prod); current origin in Vite dev | Live share / create links |
| `VITE_WS_BASE` | derived from API origin | Live room WebSocket base |
| `VITE_IDENTITY_URL`, `VITE_SANDBOX_URL`, `VITE_ROOMS_URL`, `VITE_NOTES_URL` | localhost service ports | Vite dev proxy targets |

Landing download: `lib/landing/nordlyRelease.ts` reads `https://trynordly.app/desktop/releases.json`. Hero + header CTA; short link `/download` starts the installer or shows an OS picker (never self-redirects). Logo on `code.trynordly.app` goes to `https://trynordly.app/`.

## Commands

```bash
cd apps/web
npm install
npm run dev    # :5173, proxies to local services
npm run build
```

Local stack for live rooms:

```bash
cd services/identity && make start
cd services/sandbox && make start
cd services/rooms && make start
cd services/notes && make start   # published notes
```

## Layout

```
apps/web/src/
├── App.tsx                    # mounts AnimatedRoutes
├── components/
│   ├── AnimatedRoutes.tsx     # route table
│   └── …                      # landing, collab editors, shell
├── pages/                     # Welcome, CollabRoom, Legal, Published*, OAuth bridges
├── lib/
│   ├── api/                   # REST clients
│   ├── ws/                    # collab WebSocket
│   └── collab/                # Excalidraw Yjs helpers
```

## Retired (removed from routing)

Auth, profile, checkout pages and their API helpers were removed. Auth lives in Nordly desktop only.
