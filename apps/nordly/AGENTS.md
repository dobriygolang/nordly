# AGENTS.md — Nordly desktop app

Work from `apps/nordly/` only. Monorepo index: [../../AGENTS.md](../../AGENTS.md). Web companion: [../web/AGENTS.md](../web/AGENTS.md).

Agent rules (HTTP, Tauri, fail-fast): [.cursor/rules/nordly.mdc](.cursor/rules/nordly.mdc) + root [fail-fast-no-fallbacks.mdc](../../.cursor/rules/fail-fast-no-fallbacks.mdc).

## Purpose

Tauri 2 + React desktop focus workspace: pomodoro timer, notes (E2EE vault), task board with day schedule, local Excalidraw whiteboard, stats/calendar overlays, settings. Local-first IndexedDB; optional cloud sync when signed in and `LOCAL_ONLY=false`.

## Stack

| Layer | Path |
|-------|------|
| Native shell | `src-tauri/` — auth keychain, vault passphrase, pomodoro snapshot, deep links |
| Renderer | `src/renderer/src/` — React + Vite |
| Local DB | IndexedDB `nordly-db` v2 — `shared/db/nordlyDb.ts` |
| Sync | `shared/sync/` — outbox push + pull (notes, tasks, focus) |
| Platform bridge | `platform/ipc.ts`, `platform/native-bridge.ts` → `window.nordly` |
| HTTP (renderer) | `shared/api/http.ts` → `apiFetch()` — dev: browser `fetch` + Vite proxy; release: `tauri-plugin-http` |

## Pages and navigation

Dock/palette pages (`widgets/Dock.tsx`, `widgets/Palette.tsx`): `home`, `today`, `notes`, `whiteboard`, `calendar`, `planning`, `settings`.

| Page | Component | Notes |
|------|-----------|-------|
| Home | `pages/Home.tsx` | Poster + `widgets/HomeTodayTasks` (today list, obstacles; no plan header) |
| Today | `pages/TaskBoard/TaskBoardPage.tsx` | Day columns, infinite scroll, drag schedule; task UI in `features/tasks/components/` |
| Notes | `pages/Notes.tsx` | Sidebar + CodeMirror live-preview editor |
| Whiteboard | `pages/Whiteboard/WhiteboardPage.tsx` | Excalidraw, local IndexedDB only |
| Calendar | `pages/Calendar/CalendarModal.tsx` | PageStack full-screen calendar page; closes/navigates via Home |
| Daily Planning | `pages/DailyPlanning/DailyPlanningModal.tsx` | PageStack full-screen planning wizard |
| Settings | `pages/Settings/index.tsx` | Sidebar-navigated shell (General / Integrations / Vault / Shortcuts / About). General holds Appearance (wallpaper carousel via `WallpaperCarousel`, locale, text size, whiteboard canvas), Timer (default mode, duration, daily goal, end bell, notifications), Task Rollover. `NordlySettings` (`shared/model/settings.ts`) adds `timerMode`, `endBell`, `taskRollover` |

Home-only overlays: `AnimatedStatsOverlay`. Also global: `PomodoroController`, `Palette` (Cmd+K). Calendar and Daily Planning are regular `PageStack` pages so their Home transition uses the same crossfade as Today/Notes/Settings.

Task rollover (`features/tasks/lib/taskRollover.ts`): when `taskRollover` is on, at startup and on window focus (after 03:00 local, once/day via a `nordly:task-rollover-day` marker) unfinished tasks scheduled on earlier days are re-anchored onto today at the same clock time. End-bell sound on timer completion is gated by the `endBell` setting; default focus timer mode is seeded from `timerMode`.

**Daily Planning** (`pages/DailyPlanning/`): 3-step triage wizard — Pick (Today + All tasks), Defer (Today / Tomorrow / Next week; full-width, no timeline), Finalize (summary + obstacles + timeline preview). Open via Palette or `P`. On **Get started**: saves obstacles + plan snapshot to IndexedDB meta `daily_plan::{userId}::{YYYY-MM-DD}`, dispatches `nordly:daily-plan-changed`, navigates Home. **Home** shows today task list + obstacles (no plan progress header); **Stats** overlay shows plan vs actual when finalized today. Manual open only (no auto-open on launch).

## Env flags

| Variable | Default | Effect |
|----------|---------|--------|
| `VITE_NORDLY_LOCAL_ONLY` | `true` | Local-only: no cloud sync, no publish, no Google Calendar API |
| `VITE_NORDLY_LOCAL_API` | unset | Vite proxy to local services (8080/8087/8089/8090/8091) |
| `VITE_NORDLY_API_BASE` | unset | Direct API base (skip proxy) |
| `VITE_NORDLY_WEB_BASE` | **required for share** | Public web URL for live whiteboard links (`requireNordlyWebBaseUrl()`) |

Prod builds should set `VITE_NORDLY_LOCAL_ONLY=false` for cloud features.

## Backend dependencies

HTTP REST only (no gRPC in renderer). Prod base: `https://trynordly.app` via Vite proxy.

| Service | Port (dev) | Used for |
|---------|------------|----------|
| identity | 8080 | Auth, healthz |
| billing | 8085 | Feature usage (`GET /v1/billing/me`) for Settings → Features |
| tracker | 8089 | Work tasks, Google Calendar |
| notes | 8090 | Notes CRUD, vault, publish |
| focus | 8091 | Sessions, stats |
| rooms | 8087 | Whiteboard live share + publish |

Billing: `GET /v1/billing/me` — Settings → Features (feature usage when signed in).

### HTTP endpoints (when sync enabled)

**billing** — `shared/api/billingClient.ts`

| Method | Path |
|--------|------|
| GET | `/v1/billing/me` |

**identity**

| Method | Path | Client |
|--------|------|--------|
| GET | `/v1/auth/config` | `features/auth/api/auth.ts` via `apiFetch` — sole source for Telegram bot username on login |
| POST | `/v1/auth/telegram` | same |
| POST | `/v1/auth/refresh` | `shared/api/authSession.ts` via raw HTTP (no 401 retry loop) |
| HEAD | `/healthz` | `SyncEngine.ts` via `apiFetch` |

**Packaged builds:** all renderer HTTP goes through `apiFetch` → `tauri-plugin-http` (scope in `src-tauri/capabilities/default.json`). Dev (`npm run dev`) keeps browser `fetch` + Vite proxy. **Never add raw `fetch()` for `/v1/*` or `/healthz`** — see [.cursor/rules/nordly.mdc](.cursor/rules/nordly.mdc).

**Tauri shell (Rust)** — `src-tauri/src/auth.rs` (keychain session only):

**tracker** — `features/tasks/repository/tasksRemote.ts`, `features/calendar/api/calendarClient.ts`

| Method | Path |
|--------|------|
| GET/POST | `/v1/tracker/work/tasks` |
| POST | `/v1/tracker/work/tasks/{id}/status` |
| DELETE | `/v1/tracker/work/tasks/{id}` |
| POST | `/v1/tracker/work/tasks/{id}/schedule` |
| POST | `/v1/tracker/work/tasks/{id}/unschedule` |
| GET/PATCH | `/v1/tracker/settings` |
| GET | `/v1/tracker/integrations/google/url` |
| POST | `/v1/tracker/integrations/google/disconnect` |
| GET | `/v1/tracker/integrations/google/events` |
| POST/PATCH/DELETE | `/v1/tracker/integrations/google/events` (+ `{id}` for patch/delete) |
| GET | `/v1/tracker/integrations/google/calendars` |
| GET/POST | `/v1/tracker/integrations/zoom/url`, `/disconnect` |
| GET | `/v1/tracker/work/epics` |
| PATCH | `/v1/tracker/work/tasks/{id}` (epicId, clearEpic, clearConference) |
| POST | `/v1/tracker/work/tasks/{id}/conference` |

**notes** — `features/notes/repository/notesRemote.ts`, `publishRemote.ts`, `vaultRemote.ts`, `shared/crypto/vault.ts`

| Method | Path |
|--------|------|
| GET/POST/PUT/DELETE | `/v1/notes`, `/v1/notes/{id}` |
| GET | `/v1/notes/{id}/publish-status` |
| POST | `/v1/notes/{id}/share-to-web` |
| POST | `/v1/notes/{id}/unpublish` |
| POST | `/v1/notes/{id}/make-private` |
| POST | `/v1/notes/vault/init` |
| GET | `/v1/notes/vault/salt` |
| POST | `/v1/notes/vault/notes/{noteId}/encrypt` |

**focus** — `features/focus/repository/focusRemote.ts`

| Method | Path |
|--------|------|
| GET | `/v1/focus/stats?up_to_date=` |
| POST | `/v1/focus/sessions/start` |
| POST | `/v1/focus/sessions/{id}/end` |

**rooms** (whiteboard sharing) — `features/whiteboard/api/whiteboardRemote.ts`

| Method | Path |
|--------|------|
| POST | `/v1/rooms/share-whiteboard` |
| POST | `/v1/rooms/publish-whiteboard` |

## IndexedDB schema

Database: `nordly-db` v2. All entity stores use composite key `userId::id`.

| Store | Purpose |
|-------|---------|
| `notes` | Note bodies + wiki-link metadata (`wikiLinks` on create/update) |
| `tasks` | Work task cards |
| `focus_sessions` | Local pomodoro sessions |
| `whiteboards` | Excalidraw scene JSON |
| `outbox` | Pending sync operations |
| `id_map` | Local UUID → server ID |
| `meta` | Sync cursors, prefs |

Scoped by `setDbUserId()` on sign-in.

## Sync engine

**Local app access** (`canUseLocalApp()`): signed in with `userId` — works offline even when access token expired.

**Sync enabled** (`isSyncEnabled()`): signed in, `LOCAL_ONLY === false`, valid access token **or** refresh token when online. Offline + expired session → local-only grace (no sync, no logout).

**Session refresh** (`shared/api/authSession.ts`): proactive refresh 60s before JWT expiry + on focus/online; `POST /v1/auth/refresh` rotates tokens into keychain. On **401** when online: refresh once and retry authenticated requests; logout only if refresh fails. Offline 401/expiry: keep local session, show `SyncStatusBanner`.

Engine: `shared/sync/SyncEngine.ts` — debounced 3s + 60s interval + online/focus triggers. Calls `ensureAccessTokenForSync()` before each run.

| Domain | Push ops | Pull | Backend |
|--------|----------|------|---------|
| notes | create, update, delete | full list + get each | notes CRUD + vault encrypt |
| tasks | create, status, schedule, unschedule, delete, patch (clear conference) | full list | tracker work tasks |
| focus | session_start, session_end | none (stats on-demand) | focus sessions |

**Stats overlay** (`getStats` in `features/focus/api/focusClient.ts`): builds from local `focus_sessions` first. When sync is on, merges remote `/v1/focus/stats` with **unsynced local sessions only** (avoids double-count). Remote fetch errors propagate; empty remote with pending local unsynced sessions uses local pending totals.

Task fields **device-only** (preserved on pull/replace): `order`.

Task epics: `epicId` syncs to tracker when online; `epicColor` is offline/pending fallback until push resolves color → server epic. Epic list cached in IndexedDB `meta` (`tracker_epics::{userId}`).

Conflict: LWW by `updatedAt`. Outbox: `shared/sync/outbox.ts`. ID map: `shared/sync/idMap.ts`.

Not synced: whiteboards (local + share/publish via rooms), vault prefs, Google Calendar reads, publish status (direct API on user action).

## Vault (E2EE)

Client: PBKDF2 200k + AES-256-GCM. Server stores salt + ciphertext only.

| File | Role |
|------|------|
| `shared/crypto/vault.ts` | Init, unlock, encrypt/decrypt |
| `shared/crypto/vaultPrefs.ts` | Local vault enabled flag |
| `shared/crypto/recoveryKey.ts` | Recovery phrase |
| `widgets/VaultUnlockGate.tsx` | Unlock UI (mount in App when vault enabled) |
| `pages/Settings/sections/VaultSection.tsx` | Settings |

Tauri IPC (OS keychain for passphrase):

| Command | Purpose |
|---------|---------|
| `vault_pass_load` | Load passphrase |
| `vault_pass_save` | Save passphrase |
| `vault_pass_clear` | Clear passphrase |

## Whiteboard

Local Excalidraw (`@excalidraw/excalidraw`). Single board `DEFAULT_BOARD_ID = 'default'` per user.

| File | Role |
|------|------|
| `features/whiteboard/repository/whiteboardStore.ts` | IndexedDB read/write |
| `pages/Whiteboard/WhiteboardPage.tsx` | UI + debounced save |
| `shared/lib/excalidraw/nordlyTheme.ts` | Theme sync |

Sharing (requires sign-in + network):

- **Live share** → `POST /v1/rooms/share-whiteboard` → web `/live/{roomId}` (short URL copied client-side)
- **Publish** → `POST /v1/rooms/publish-whiteboard` → web `/board/{slug}` (read-only)

## Tauri IPC commands

Registered in `src-tauri/src/lib.rs`:

| Command | Purpose |
|---------|---------|
| `auth_session` | Load session from keychain |
| `auth_persist` | Save session + emit `auth:changed` |
| `auth_logout` | Clear session |
| `vault_pass_load/save/clear` | Vault passphrase keychain |
| `pomodoro_load/save` | Timer snapshot (Tauri store) |
| `show_notification` | Themed always-on-top banner (top-right) when pomodoro completes; auto-hides after 60s |
| `hide_notification` | Dismiss notification banner (swipe or timeout) |
| `focus_main_window` | Raise main window (notification click) |
| `shell_open_external` | Open URL in browser |
| `window_traffic_lights_show` | macOS traffic lights |
| `tray_show_main` | Show main window + open palette (from tray popover) |
| `deep_link_initial` | Returns the URL that cold-launched the app (custom scheme), if any |

**Menu bar (desktop):** tray icon opens `tray-popover` window (timer + theme poster). Hamburger in popover calls `tray_show_main`.

Events: `app:deep-link` (warm-start), `auth:changed`, `app:open-palette`, `pomodoro:sync`, `theme:sync`. Cold-start deep links are pulled once via `deep_link_initial` on renderer mount. Deep link schemes: `focus`, `task.open?id=…`, `note.open?id=…`, `settings?google_calendar=…` (Google Calendar OAuth), `settings?zoom=…` (Zoom OAuth).

## Commands

```bash
cd apps/nordly
cp .env.example .env
npm install
npm run dev              # Tauri
npm run dev:vite         # browser-only (no IPC)
npm run typecheck
npm run test
npm run build            # Tauri release
```

Local backend: `VITE_NORDLY_LOCAL_API=true` + `make start` in each service.

## Release + updater

| Piece | Location |
|-------|----------|
| CI workflow | `.github/workflows/nordly-release.yml` — trigger: tag `nordly-v*` |
| Updater endpoint | `https://trynordly.app/desktop/latest.json` (`plugins.updater.endpoints` in `tauri.conf.json`) |
| CDN sync | same workflow, job `sync-cdn` — rewrites manifests + SCP to VPS `deploy/data/cdn/desktop/` |
| Main version sync | job `sync-main-version` — commits `tauri.conf.json` / `Cargo.toml` / `package.json` after release |
| Settings UI | `pages/Settings/sections/SoftwareSection.tsx` |
| Updater helper | `shared/lib/updater.ts` — `@tauri-apps/plugin-updater` + `plugin-process` relaunch |

Release flow: push `main` → tag `nordly-vX.Y.Z` → push tag → CI builds signed artifacts, syncs version back to `main`, publishes CDN (works with a **private** GitHub repo). Manual version bump in the repo is optional — CI reads the version from the tag.

Default macOS bundle uses ad-hoc signing (`signingIdentity: "-"` in `tauri.conf.json`) so CI works without Apple certs. Set repo variable `NORDLY_CODE_SIGNING=true` + Apple secrets for Developer ID + notarization (see `SIGNING.md`).

GitHub secret `TAURI_SIGNING_PRIVATE_KEY` must match `plugins.updater.pubkey`. Private key lives in `.tauri/nordly.key` (gitignored).

## Known gaps

| Gap | Status |
|-----|--------|
| Note folders | Data model only; no folder UI |
| Task delete in UI | Remote + sync support exists; no TaskRow delete button |
| Google OAuth callback | Handled: tracker redirects to web `/oauth/google-calendar` → `nordly://settings?google_calendar=…` |
| Zoom OAuth callback | Handled: tracker redirects to web `/oauth/zoom` → `nordly://settings?zoom=…` |

## Layout

```
apps/nordly/
├── AGENTS.md
├── docs/architecture-audit.md   # layering audit tracker
├── README.md
├── src-tauri/                   # Rust: auth, vault, pomodoro, deep links
└── src/renderer/src/
    ├── app/                     # bootstrap, App shell, syncRegistry wiring
    ├── platform/                # Tauri IPC bridge, runtime detection
    ├── shared/
    │   ├── model/               # settings, theme, navigation, session, pomodoro
    │   ├── lib/                 # dates, applyTheme, useFlipList, excalidraw
    │   ├── ui/                  # PageStack, SidebarDivider, primitives
    │   ├── db/, sync/, crypto/, api/, hooks/
    ├── features/
    │   ├── auth/, focus/, calendar/, whiteboard/, planning/
    │   ├── notes/               # api, repository, sync/
    │   └── tasks/               # api, repository, lib, components, sync/
    ├── pages/                   # route composition only (TaskBoard page shell, Notes, …)
    └── widgets/                 # Dock, Palette, CanvasBg, overlays, Login
```

**Import rule:** dependencies point inward — `shared` never imports `pages/` or `widgets/`; `features` never imports `pages/`. Types like `PageId` and `ThemeId` live in `shared/model/`.

Architecture audit + layering rules: [docs/architecture-audit.md](docs/architecture-audit.md).
