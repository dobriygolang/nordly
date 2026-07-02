# AGENTS.md — Web companion (Nordly)

Work from `apps/web/` only. Desktop app: [../nordly/AGENTS.md](../nordly/AGENTS.md). Monorepo: [../../AGENTS.md](../../AGENTS.md).

**Agent rules:** [.cursor/rules/web.mdc](.cursor/rules/web.mdc) + root [fail-fast-no-fallbacks.mdc](../../.cursor/rules/fail-fast-no-fallbacks.mdc).

## Purpose

Thin public web surface for Nordly: landing + download, guest live collab (code + Excalidraw), public pricing, legal pages, published notes and whiteboards. **No user auth** on web — JWT cleared on boot; live rooms use scoped guest tokens.

## Scope (active)

| Area | Routes |
|------|--------|
| Landing | `/`, `/download` |
| Live collab | `/live/new`, `/live/:roomId` |
| Public notes | `/notes/:slug`, `/n/:slug` → redirect |
| Public boards | `/board/:slug` |
| Pricing | `/pricing` |
| Legal | `/legal/terms`, `/legal/privacy` |

Retired routes redirect to `/` or `/pricing` (see below).

## Routes

Defined in `src/components/AnimatedRoutes.tsx` (mounted from `src/App.tsx`):

| Route | Page | Auth |
|-------|------|------|
| `/` | `WelcomePage` | — |
| `/welcome` | → `/` | legacy redirect |
| `/download` | `NordlyDownloadPage` | redirects to latest OS installer |
| `/oauth/google-calendar` | `GoogleCalendarOAuthPage` | OAuth bridge → `nordly://settings?google_calendar=…` |
| `/oauth/zoom` | `ZoomOAuthPage` | OAuth bridge → `nordly://settings?zoom=…` |
| `/notes/:slug` | `PublishedNotePage` | — |
| `/n/:slug` | → `/notes/:slug` | — |
| `/board/:slug` | `PublishedBoardPage` | — |
| `/live/new` | `LiveNewPage` | — |
| `/live/:roomId` | `CollabRoomPage` | guest JWT |
| `/pricing` | `PricingPage` | — |
| `/legal/terms` | `LegalTermsPage` | — |
| `/legal/privacy` | `LegalPrivacyPage` | — |
| `/login`, `/profile`, `/settings`, `/auth/callback` | → `/` | retired |
| `/checkout`, `/billing/welcome` | → `/pricing` | retired |
| `/today`, `/dashboard`, `/learn/*`, `/mock/*`, `/interview/*`, `/tasks`, `/admin/*` | → `/` | retired |

## Backend dependencies

Base: `VITE_API_BASE` (default `/v1`). Dev proxy: `vite.config.ts`. Prod: same-origin via Caddy on `trynordly.app` (tracker OAuth callbacks at `/v1/tracker/integrations/*/callback`).

| Service | Port | Proxy prefix |
|---------|------|--------------|
| identity | 8080 | `/v1/auth` |
| billing | 8085 | `/v1/billing` |
| sandbox | 8086 | `/v1/sandbox`, `/ws/lsp` |
| rooms | 8087 | `/v1/rooms`, `/ws` |
| notes | 8090 | `/v1/notes` |

### REST endpoints (active)

**billing** — `lib/api/billing.ts`

| Method | Path | Used by |
|--------|------|---------|
| GET | `/v1/billing/plans` | `PricingPage` — Nordly desktop entitlements (cloud sync, notes, publish) |

**rooms** — `lib/api/rooms.ts`

| Method | Path | Used by |
|--------|------|---------|
| POST | `/v1/rooms/guest-create` | `/live/new` |
| GET | `/v1/rooms/{id}` | `CollabRoomPage` |
| POST | `/v1/rooms/{id}/guest-join` | join flow |
| POST | `/v1/rooms/{id}/close` | owner controls |
| GET | `/v1/rooms/boards/public/{slug}` | `PublishedBoardPage` |

**sandbox** — `lib/api/sandbox.ts`

| Method | Path | Used by |
|--------|------|---------|
| POST | `/v1/sandbox/code-runs` | code rooms |
| GET | `/v1/sandbox/code-runs/{id}` | run polling |
| POST | `/v1/sandbox/format` | Go format |

**notes** — `lib/api/publicNotes.ts`

| Method | Path | Used by |
|--------|------|---------|
| GET | `/v1/notes/public/{slug}` | `PublishedNotePage` |

### WebSockets

| Path | Service | Client |
|------|---------|--------|
| `WS /ws/editor/{roomId}?token=JWT` | rooms | `lib/ws/collabEditor.ts` |
| `WS /ws/lsp/go?token=JWT` | sandbox | not wired in editor (future) |

WS envelope kinds: `snapshot`, `op`, `presence`, `cursor`, `code_run`, `room_closed`.

## Guest JWT flow

1. `/live/new` → `POST /v1/rooms/guest-create` → scoped JWT + room
2. Token stored: `sessionStorage['nordly_guest_token_{roomId}']`
3. Room REST + WS use guest token via `readGuestToken(roomId)`
4. Joining is open: `/live/:roomId` shows a name prompt → `POST guest-join` → guest token. Share URLs use `/live/{roomId}` only (`lib/live/liveRoomUrl.ts`).

Share URLs: `publicLiveRoomUrl(roomId)` — client-side short link; Invite button copies without `POST /invite`.

Sandbox run/format should use guest token when in live room (same as room REST).

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
| Whiteboard live share | `POST /v1/rooms/share-whiteboard` | `/live/{roomId}` |
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
| `VITE_WS_BASE` | derived from API origin | Live room WebSocket base |
| `VITE_IDENTITY_URL`, `VITE_BILLING_URL`, `VITE_SANDBOX_URL`, `VITE_ROOMS_URL`, `VITE_NOTES_URL` | localhost service ports | Vite dev proxy targets |

Landing download: `lib/landing/nordlyRelease.ts` fetches [GitHub latest Nordly release](https://github.com/dobriygolang/nordly/releases/latest) (`.dmg` / `-setup.exe`). Cached 15m in `sessionStorage`. Hero + header CTA; short link `/download`.

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
cd services/billing && make start
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
├── pages/                     # Welcome, CollabRoom, Pricing, Legal, Published*, OAuth bridges
├── lib/
│   ├── api/                   # REST clients
│   ├── ws/                    # collab WebSocket
│   └── collab/                # Excalidraw Yjs helpers
```

## Retired (removed from routing)

Auth, profile, checkout pages and their API helpers were removed. Auth lives in Nordly desktop only.
