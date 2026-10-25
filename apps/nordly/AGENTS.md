# AGENTS.md — Nordly desktop app

Work from `apps/nordly/` only. Monorepo index: [../../AGENTS.md](../../AGENTS.md). Web companion: [../web/AGENTS.md](../web/AGENTS.md).

Before any work in this app, read [engineering conventions](docs/engineering.md)
and the root [fail-fast policy](../../docs/engineering/fail-fast-no-fallbacks.md).

## Purpose

Tauri 2 + React desktop focus workspace: pomodoro timer, notes (filesystem vault + optional cloud E2EE), task board with day schedule, local Excalidraw whiteboard, stats/calendar overlays, settings. Local-first; notes SoT is an Obsidian-style vault folder on disk when bound; IndexedDB for tasks/focus/outbox; optional cloud sync when signed in and `LOCAL_ONLY=false`.

## Stack

| Layer | Path |
|-------|------|
| Native shell | `src-tauri/` — auth keychain, vault passphrase, pomodoro snapshot, deep links |
| Renderer | `src/renderer/src/` — React + Vite |
| Local DB | IndexedDB `nordly-db` v7 — `shared/db/nordlyDb.ts` |
| Sync | `shared/sync/` — outbox push + pull (notes, tasks, focus, vault file stubs) |
| Platform bridge | `platform/ipc.ts`, `platform/native-bridge.ts` → `window.nordly` |
| HTTP (renderer) | `shared/api/http.ts` → `apiFetch()` — dev: browser `fetch` + Vite proxy; release: `tauri-plugin-http` |

## Pages and navigation

Dock/palette pages (`widgets/Dock.tsx`, `widgets/Palette.tsx`): `home`, `today`, `notes`, `whiteboard`, `calendar`, `planning`, `settings`.

| Page | Component | Notes |
|------|-----------|-------|
| Home | `pages/Home.tsx` | Empty page (`null`); chrome overlays `widgets/HomeTodayTasks` (today tasks, meetings, obstacles; no plan header) on the poster |
| Today | `pages/TaskBoard/TaskBoardPage.tsx` | Day columns, infinite scroll, drag schedule; task UI in `features/tasks/components/` |
| Notes | `pages/Notes/NotesPage.tsx` | Thin composer + `useNotes*` hooks; Sidebar selection/tree extracted; **filesystem vault** (`.md` + `img/`) after folder pick — see [docs/architecture/005-filesystem-notes-vault.md](docs/architecture/005-filesystem-notes-vault.md). Persistence via `notesPersistence()` (vault \| idb); pages import `@features/notes/api/vault`, not `@features/notes/vault`. Paste/drop → relative `![](…)`; drop `.md` / folders; ⌘+/⌘−/⌘0 zooms editor text only |
| Whiteboard | `pages/Whiteboard/WhiteboardPage.tsx` | Multi-board Excalidraw, local IndexedDB only |
| Calendar | `pages/Calendar/CalendarModal.tsx` | PageStack full-screen calendar page; closes/navigates via Home |
| Daily Planning | `pages/DailyPlanning/DailyPlanningModal.tsx` | PageStack full-screen planning wizard |
| Settings | `pages/Settings/index.tsx` | Sidebar-navigated shell (General / Timer / Flashcards / Integrations / Files & Links / Sync / Shortcuts / About). Files & Links binds the Obsidian-style vault folder + attachment path. Sync holds the notes-sync switch and encryption. General holds Appearance (wallpaper, locale, week starts on, text size, whiteboard canvas). Timer holds mode, duration, daily goal, sounds, reminders, and Task Rollover. Flashcards holds card settings. `NordlySettings` (`shared/model/settings.ts`) includes `weekStartsOn` (`monday` \| `sunday`, default Monday), `timerMode`, `endBell`, `taskRollover`, `taskNotifications`, `notificationVolume` |

The PageStack shell owns the dock reservation; pages must not add another bottom spacer. Home poster and page content share `--nordly-content-bottom` (68px plus safe area), reserving the same space above the dock on Notes, Today, Whiteboard, Settings, Calendar, Planning and Cards.

Page headings share `--nordly-page-top` (40px) and `--nordly-page-heading-height` (28px), matching the home wordmark. Keep the first heading row free of extra top padding. Note review actions sit beside the note title so enabling cards does not shift it. Interface copy lives in `apps/shared/i18n/locales/{en,ru}.ts`; keep both key sets and interpolation parameters identical.

Wallpaper choices live in `shared/model/theme.ts`. Removed Winter and local Horizon
selections migrate once to Launch and persist the replacement; other unknown ids
remain errors. Do not restore deleted Winter canvas styles or helpers.

The note-menu publish action keeps the menu open, waits for the server's canonical
URL and copies it through `shared/lib/clipboard.ts`. Desktop writes use the
main-window-only `clipboard_write_text` command; browser previews start a promised
ClipboardItem inside the click gesture. Copy success/error is shown in the menu,
and clipboard failure does not roll back publication. The read-only sharing notice
is inline before the explicit publish action; do not use native `window.confirm`.
Old publish-status responses cannot overwrite a newer publication. Shared note/board
menu styles live in `shared/ui/VaultRowMenu.css`, imported by their menu consumers. The Chrome
translation-capture switch targets a local Nordly note; it does not enable web editing.
Keep the note menu compact: password/expiry controls sit in collapsed “Link settings”,
opening the public page is an icon beside Copy link, and Chrome capture has one short
label rather than an explanatory paragraph. The read-only notice stays in the section heading.

Home-only overlays: `AnimatedStatsOverlay`. Also global: `PomodoroController`, `Palette` (Cmd+K). Calendar and Daily Planning are regular `PageStack` pages so their Home transition uses the same crossfade as Today/Notes/Settings.

Task rollover (`features/tasks/lib/taskRollover.ts`): when `taskRollover` is on (default **off**), at startup and on window focus (after 03:00 local, once/day via a `nordly:task-rollover-day` marker) unfinished tasks scheduled on earlier days are re-anchored onto today at the same clock time. End-bell sound on timer completion is gated by the `endBell` setting; default focus timer mode is seeded from `timerMode`.

Calendar and task reminders keep checking while the main window is hidden (the red button only hides it). Apple Calendar reminders fire at the event start, on the same window as Google, and do not wait for cloud sync.

**Daily Planning** (`pages/DailyPlanning/`): 3-step triage wizard — Pick (Today + All tasks), Defer (Today / Tomorrow / Next week; full-width, no timeline), Finalize (summary + obstacles + timeline preview). Open via Palette or `P`.

**All tasks pool** (`features/planning/lib/planningTasks.ts` → `buildPlanningPool`): a date window, not every task. Overdue first (oldest → newest), then upcoming through the end of the current week (`weekStartsOn`-aware), strictly chronological — `order` is a within-day index and is deliberately not used here. Done, dismissed and dateless tasks are excluded. When the window holds nothing, it rolls forward **whole weeks** until it reaches the nearest upcoming task, so the column is never empty and days from different weeks never interleave; anything past the window is a "reveal one more week" button (`extendPool`). Pick folds tomorrow / next week into the pool (`poolAbsorbsNearDays`) because it renders no columns for them; Defer gives them their own. Dropping into the pool schedules to **tomorrow** — the model has no dateless state, so that is the only non-arbitrary "not today". On **Get started**: saves obstacles + plan snapshot to IndexedDB meta `daily_plan::{userId}::{YYYY-MM-DD}`, dispatches `nordly:daily-plan-changed`, navigates Home. **Home** shows today task list + obstacles (no plan progress header); **Stats** overlay shows plan vs actual when finalized today. Manual open only (no auto-open on launch).

## Env flags

| Variable | Default | Effect |
|----------|---------|--------|
| `VITE_NORDLY_LOCAL_ONLY` | `false` in `.env` / release CI | `true` hides cloud sync, publish, Google/Zoom; unset code default is still `true` |
| `VITE_NORDLY_LOCAL_API` | unset | Vite proxy to local services (8080/8087/8089/8090/8091) |
| `VITE_NORDLY_API_BASE` | unset | Direct API base (skip proxy) |
| `VITE_NORDLY_WEB_BASE` | optional | Unused by renderer today (share/publish URLs come from rooms/notes API) |
| `VITE_SPOTIFY_CLIENT_ID` | unset | Spotify PKCE app id. Optional macOS Liked Songs sign-in only; local playback needs no client id |
| `VITE_SPOTIFY_REDIRECT_URI` | `https://trynordly.app/oauth/spotify` | Must match a Redirect URI on the Spotify app. The page forwards `code` and `state` to `nordly://settings` |

Prod desktop CI sets `VITE_NORDLY_LOCAL_ONLY=false` so cloud APIs (identity + tracker) are on — Google Calendar and Zoom appear under Settings → Integrations.

Google/Zoom OAuth runs through **tracker** (server-stored tokens). Connect opens the browser via `GET /v1/tracker/integrations/{google,zoom}/url`; callbacks land on the web companion and deep-link back as `nordly://settings?google_calendar=…` / `?zoom=…`. Meet/Zoom on tasks use `POST /v1/tracker/work/tasks/{id}/conference`. These features require `LOCAL_ONLY=false`, a signed-in session, and a reachable API.

**Spotify** (`features/spotify/`) is device-local and independent of Nordly cloud / `LOCAL_ONLY`. Playback, current-track metadata and volume use native IPC (`spotify_local_read/playback/volume`), never the Spotify Web API or OAuth. The main renderer owns one shared **2-second local IPC poller** only while Settings or the tray is visible; startup/window focus also reads once. macOS uses Spotify's ScriptingBridge interface and Apple-event permission preflight. Only the explicit Settings **Allow control / Check Spotify** action may request Automation permission; background reads/commands never prompt. Windows selects Spotify's SMTC session by application id (not the global current player), and adjusts only Spotify.exe audio sessions through Core Audio across active output devices. Neither adapter launches Spotify; the user opens it and selects this computer as the playback device. Unsupported platforms and denied permissions are shown honestly. Main/tray timer state changes immediately; native commands run separately and rapid desired states/volume values are coalesced. Native work already dispatched may finish after Off; generation guards discard its result.

**Liked Songs** is optional and separate from local control. `spotifyLikedSongs` defaults off; existing tokens remain untouched until the user enables likes. On macOS, library support can reuse saved credentials or open PKCE sign-in (`VITE_SPOTIFY_CLIENT_ID`, HTTPS callback → `nordly://settings`). Tokens remain in the OS keychain, per device, independent of Nordly sign-out. Only a heart click reads the library state and saves/removes that track; no cloud profile/playback/library polling. Provider quota errors affect likes only. Windows SMTC does not supply a reliable Spotify track id, so library setup and the heart are hidden there. Disconnect removes only optional library credentials; local playback keeps working. `spotifyEnabled` Off pauses both parts without signing out. OAuth scopes request library read/write only.

## Backend dependencies

HTTP REST only (no gRPC in renderer). Prod base: `https://trynordly.app` via Vite proxy.

| Service | Port (dev) | Used for |
|---------|------------|----------|
| identity | 8080 | Auth, healthz |
| tracker | 8089 | Work tasks, Google Calendar, Zoom |
| notes | 8090 | Notes CRUD, vault, publish |
| focus | 8091 | Sessions, stats |
| rooms | 8087 | Whiteboard live share + publish |

### HTTP endpoints (when sync enabled)

**identity**

| Method | Path | Client |
|--------|------|--------|
| GET | `/v1/auth/config` | `features/auth/api/auth.ts` via `apiFetch` — sole source for Telegram bot username on login |
| POST | `/v1/auth/telegram` | same |
| POST | `/v1/auth/refresh` | `shared/api/authSession.ts` via raw HTTP (no 401 retry loop) |
| POST | `/v1/devices/register` | `shared/api/registerSyncDevice.ts` — sync device registration |
| HEAD | `/healthz` | `SyncEngine.ts` via `apiFetch` |

**Packaged builds:** all renderer HTTP goes through `apiFetch` → `tauri-plugin-http` (scope in `src-tauri/capabilities/default.json`). Dev (`npm run dev`) keeps browser `fetch` + Vite proxy. **Never add raw `fetch()` for `/v1/*` or `/healthz`** — see [engineering conventions](docs/engineering.md).

**Tauri shell (Rust)** — `src-tauri/src/auth.rs` (Nordly session keychain):

**tracker** — task transport in `features/tasks/remote/tasksRemote.ts`; Google/Zoom in `features/calendar/remote/calendarClient.ts`.

| Method | Path |
|--------|------|
| GET/POST | `/v1/tracker/work/tasks` |
| POST | `/v1/tracker/work/tasks/{id}/status` |
| DELETE | `/v1/tracker/work/tasks/{id}` |
| POST | `/v1/tracker/work/tasks/{id}/schedule` |
| POST | `/v1/tracker/work/tasks/{id}/unschedule` |
| GET | `/v1/tracker/work/epics` |
| PATCH | `/v1/tracker/work/tasks/{id}` (`epicId`, `clearEpic`, `clearConference`, `googleEventId`+`googleCalendarId` together, `zoomMeetingId`) |
| POST | `/v1/tracker/work/tasks/{id}/conference` |
| GET | `/v1/tracker/integrations/google/url` |
| POST | `/v1/tracker/integrations/google/disconnect` |
| GET | `/v1/tracker/integrations/google/events` |
| POST/PATCH/DELETE | `/v1/tracker/integrations/google/events` (+ `{id}`; patch/delete require exact `calendarId`) |
| GET | `/v1/tracker/integrations/google/calendars` |
| GET/POST | `/v1/tracker/integrations/zoom/url`, `/disconnect` |
| GET/PATCH | `/v1/tracker/settings` |

**notes** — `features/notes/remote/{notesRemote,publishRemote,vaultRemote}.ts`, `shared/crypto/vault.ts`

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

**focus** — `features/focus/remote/focusRemote.ts`

| Method | Path |
|--------|------|
| GET | `/v1/focus/stats?up_to_date=` |
| POST | `/v1/focus/sessions/start` |
| POST | `/v1/focus/sessions/{id}/end` |

**rooms** (whiteboard sharing) — `features/whiteboard/api/whiteboardClient.ts` (HTTP in `remote/whiteboardRemote.ts`)

| Method | Path |
|--------|------|
| POST | `/v1/rooms/share-whiteboard` |
| POST | `/v1/rooms/publish-whiteboard` |

## IndexedDB schema

Database: `nordly-db` v7. All entity stores use composite key `userId::id`.

| Store | Purpose |
|-------|---------|
| `notes` | Note bodies + wiki-link metadata (`wikiLinks` on create/update) |
| `note_attachments` | Note images (`nordly-asset:<uuid>` in markdown); vault may store ciphertext; index `userId_noteId` |
| `tasks` | Work task cards |
| `focus_sessions` | Local pomodoro sessions |
| `whiteboards` | Excalidraw scene JSON |
| `outbox` | Pending sync operations |
| `id_map` | Local UUID → server ID (not used for vault paths) |
| `vault_sync_index` | Vault path → server id, content hash, remote `updatedAt` |
| `card_reviews` | Flashcard progress only (`due`, SM-2 fields). The cards themselves stay in note markdown |
| `meta` | Sync cursors, prefs, `note_folders::{userId}`, vault prefs/salt, `${userId}::notes_sync` |
| `calendar_events` | Last Google Calendar snapshot (offline display) |

Scoped by `setDbUserId()` on sign-in.

## Sync engine

**Local app access** (`canUseLocalApp()`): `signed_in` with `userId` — works for both `authKind: 'local'` (tokenless offline profile) and `authKind: 'cloud'` (even when access JWT is expired).

**Auth boot** (`shared/model/session.ts`): keychain cloud session if present; otherwise `ensureLocalProfile()` opens the shell without Telegram. The `keyring` dependency is built with `apple-native` and `windows-native` — without those features the crate stores the session only in the process, so a full quit always opens a local profile. Keychain IPC failure after retry throws (error boundary) instead of inventing a local profile. Native persist errors from `hydrate` / token apply propagate. Hard full-screen `LoginScreen` is not a boot gate. Cloud `hydrate` from another profile **does not** rebind IndexedDB (no silent merge across users on a shared Mac). Sign-out clears Nordly tokens + device Google/Zoom OAuth and rotates to a **new** local profile id. Dock Quit / ⌘Q is held until the renderer rewrites the current cloud session to the keychain (`confirm_app_exit`); a second `ExitRequested` does not kill the process first. The red button only hides the window.

**Sync enabled** (`isSyncEnabled()`): signed in, `LOCAL_ONLY === false`, valid (non-expired) access token, and registered sync device. Local profiles enqueue outbox when `isSyncQueueEnabled()` but never push until cloud auth exists.

**Outbox queue** (`isSyncQueueEnabled()`): same as sync but ignores access expiry — local mutations still enqueue while offline/expired/local-profile; push waits for a fresh token.

**Session refresh** (`shared/api/authSession.ts`): proactive refresh 60s before JWT expiry + on focus/online; `POST /v1/auth/refresh` rotates tokens into keychain. On **401** when online: refresh once and retry authenticated requests. Interactive reauth banner only after a **definitive** online refresh rejection (400/401) or missing refresh token — never for offline/expired access alone, local profiles, or transient network errors. Soft dismissible “sign in to sync” banner for local profiles when cloud is enabled. `ensureCloudAuth()` opens the login overlay for intentional Nordly cloud CTAs (note publish, whiteboard share/publish, Google/Zoom connect). Offline + expired cloud session → silent local-only grace (no sync, no logout). Network errors surface inline on intentional online actions.

Engine: `shared/sync/SyncEngine.ts` — debounced 3s + 60s interval + online/focus triggers. Starts only after `loadVaultPrefs` and `loadNotesSyncConsent`. Vault note push throws `SyncDeferredError` when notes sync is off or vault prefs are not loaded. IndexedDB note push is dropped while a folder is bound. Calls `ensureAccessTokenForSync()` before each run.

| Domain | Push ops | Pull | Backend |
|--------|----------|------|---------|
| notes | create, update, delete, attachment_put, attachment_delete (IndexedDB path only, and only when notes sync is on and no folder is bound) | full list + get each + attachment meta list + get-on-miss | notes CRUD + vault encrypt + attachment bytes |
| vault | file_put, file_delete (markdown only, notes sync on) | list + get notes whose title is a vault path | notes CRUD (`title` = relative path) |
| tasks | create, status, schedule, delete, patch | full list | tracker work tasks |
| focus | session_start, session_end | none (stats on-demand) | focus sessions |

**Stats overlay** (`getStats` in `features/focus/api/focusClient.ts`): builds from local `focus_sessions` first. When sync is on, merges remote `/v1/focus/stats` with unsynced local sessions, then **max-merges** that heatmap with full local (avoids double-count and stale remote undercount). Local statistics are published before waiting for the remote request; cloud errors still propagate. The overlay starts rendering on the opening frame and its cards enter together. Card-review statistics use existing device-local daily counters (saved answers today/last seven days and new cards today), with their own loading/error state and a refresh after durable card grading. They do not add artificial focus minutes. On the home page, a two-finger trackpad swipe left opens the overlay and a swipe right closes it; other pages ignore that gesture. `S` toggles it without a focus ring on the panel. A streak day needs at least 60 seconds. Heatmap and week bars scale with time (today is not forced bright); the streak sparkline uses a one-hour floor; week-over-week percent is hidden when the previous week is zero.

Task fields **device-only** (preserved on pull/replace): `order`.

Note fields **device-only** (preserved on pull/replace): `folderId` (IDB mode). **Filesystem vault mode:** folders are real directories; note id = relative `.md` path — see ADR 005.

**Note images (filesystem vault):** paste/drop writes under the attachment folder (default `img/`) with Obsidian-like `Pasted image YYYYMMDDHHmmss.*` names; markdown uses relative `![](…)`. Preview resolves via FS read → blob URL.

**Note images (legacy IDB):** PNG/JPEG/GIF/WebP ≤5 MiB, 50 per note. Markdown uses `nordly-asset:<uuid>` (HTTPS URLs unchanged). Local store encrypts with vault when enabled; outbox `attachment_put` / `attachment_delete`. Publish sends plaintext attachment bytes; public pages load `/v1/notes/public/{slug}/assets/{id}` (password shares embed data URLs, ≤15 MiB raw).

Task epics (UI: **tags**): `epicId` syncs to tracker when online; `epicColor` is offline/pending fallback until push resolves color → server epic. Epic list cached in IndexedDB `meta` (`tracker_epics::{userId}`); when empty / local-only, UI uses `OFFLINE_EPIC_STUBS` (4 palette colors, shown as Blue/Green/Purple/Orange).

Conflict: LWW by `updatedAt`, with **local tombstones never revived** (`shared/sync/tombstone.ts`). Soft-delete cancels non-delete outbox ops then enqueues `delete`. Pull soft-deletes previously synced locals absent from the remote list. A remote 404 on notes/tasks **update** is a sync error (outbox is kept). Outbox: `shared/sync/outbox.ts`. ID map: `shared/sync/idMap.ts`. Leaving Notes or Whiteboard awaits the registered page flush.

Not synced via outbox: whiteboards (local + share/publish via rooms), vault prefs, publish status (direct API on user action). Google Calendar events are **cached** in IndexedDB (`calendar_events`) for offline display; refreshed by the background worker via **direct Google Calendar API** when a device Google connection exists and the network is reachable. UI hooks (`useGoogleCalendarEvents`, Home Today, DayTimeline, Calendar modal) read **only** from that local snapshot — they never call Google from the render path.

## Feature layering (offline vs online)

| Layer | Role | Allowed imports |
|-------|------|-----------------|
| `repository/` | IndexedDB only | `shared/db`, model |
| `remote/` | HTTP clients | `shared/api` |
| `sync/` | outbox push/pull | repository + remote |
| `api/` | local-first façade | repository always; sync/remote only behind `isSyncEnabled()` / `isCloudEnabled()` |

Calendar domain types live in `features/calendar/model/`. Notes/task cards live in
`features/notes/model` and `features/tasks/model`. String states use canonical `as const`
objects (`PageId`, `TimerMode`, `AuthStatus`, `SyncDomain`, `OutboxOp`, `CalendarEntrySource`).
Pages and other features consume public `api/`, `lib/`, `hooks/`, and `components/` — not
remote/repository/sync/vault internals. Whiteboard pages use
`features/whiteboard/api/whiteboardClient.ts` for local boards and
`features/whiteboard/api/liveBoard.ts` for the live session, so notes do not download yjs.

Architecture decisions: [local-first consistency](docs/architecture/001-local-first-consistency.md),
[vault threat model](docs/architecture/002-vault-threat-model.md),
[feature boundaries](docs/architecture/003-feature-boundaries.md),
[sync conflict policy](docs/architecture/004-sync-conflict-policy.md), and
[filesystem notes vault](docs/architecture/005-filesystem-notes-vault.md).

### Shell code-splitting (bundle budgets)

`app/App.tsx` must not **statically** import Home calendar/meetings widgets or other heavy chrome that can share into the Notes route graph. Use `React.lazy` + `Suspense` (same pattern as pages). Import calendar leaves (`calendarClient`, `lib/events`, hooks, components), not a barrel. After shell changes: `npm run build:vite && node scripts/check-bundle-budgets.mjs` — see [engineering conventions](docs/engineering.md).

Task titles enter rename on double-click or Enter/F2. Editable controls and the
editing card do not activate task dragging. Existing note titles are read-only
until double-click or Enter/F2; new empty notes start with title editing enabled.
The notes toolbar's three-dot button opens a lazy-loaded Markdown syntax guide
(headings, inline formatting, lists, fences, links, images, wiki links and cards).

## Notes editor workspace

The device remembers the last successfully loaded note per profile and the editor selection and scroll position per profile/note in localStorage. Reopening the editor restores the selection (clamped to the current document length), rather than moving to EOF. Saved folder expansion is pruned only after a successful list load; selecting a note reveals its ancestor folders. The editor draws the active cursor at the head of non-empty keyboard selections. Scroll is restored independently of the cursor; save it before the editor DOM is detached. These workspace preferences do not sync. Live preview styles only closed code fences as code. Clicking a language badge reveals its opening fence for editing; Enter on an opening fence still inserts its closer.

## Filesystem notes vault

Obsidian-style folder SoT after first bind (`features/notes/vault/`, Tauri `notes_vault_*`). Local files are **plaintext**. Soft-delete → `.trash/`. Settings → Files & Links. One-shot IDB export on first pick.

Markdown files sync to the notes service (`POST/PUT/DELETE /v1/notes`) via outbox domain `vault`, keyed by relative path, only when `isNotesSyncEnabled()` (`meta` `${userId}::notes_sync`, default off). The path-to-server map is `vault_sync_index`. Each pull plans push, download, trash, or a conflict copy from the full server list. A list past the service cap fails the pull; it is not treated as remote deletes. Paths that differ only by case are an error, so NTFS cannot silently merge `Note.md` and `note.md`. Rust vault paths use `/`. An empty folder with a non-empty index pauses sync and deletes nothing. Binary vault files stay local. While a folder is bound, IndexedDB note push drops the shadow outbox entry and pull does not read that store. Publish uses the vault index server id and is blocked in the menu until notes sync is on. Tasks and focus sync continue. Pages import `@features/notes/api/vault` and `@features/notes/api/notesSync`, not `@features/notes/vault`.

## Encrypted vault (cloud E2EE)

Client: PBKDF2 600k + AES-256-GCM. A remote note is one ciphertext of path and body; the server title is an opaque id. Server stores salt + ciphertext only. An unencrypted remote note is not written while encryption is on. Publishing writes a separate public copy and leaves the encrypted sync row unchanged. Successful note uploads refresh that copy through `/refresh-published-content` before acknowledging the outbox; the same slug, password, and absolute expiry are preserved. A revoked or expired share is never recreated by a delayed upload. Deploy the notes API before this client. The recovery wrap is stored with the vault salt so the phrase works on another device.

| File | Role |
|------|------|
| `shared/crypto/vault.ts` | Init, unlock, encrypt/decrypt |
| `shared/crypto/vaultPrefs.ts` | Local vault enabled flag; `areVaultPrefsReady()` after load |
| `shared/crypto/recoveryKey.ts` | Recovery phrase |
| `widgets/VaultUnlockGate.tsx` | Unlock UI when vault enabled (local-only or cloud) |
| `pages/Settings/sections/SyncSection.tsx` | Notes sync switch, status, encryption block |

Tauri IPC (OS keychain for passphrase):

| Command | Purpose |
|---------|---------|
| `vault_pass_load` | Load passphrase |
| `vault_pass_save` | Save passphrase |
| `vault_pass_clear` | Clear passphrase |

## Whiteboard

Local Excalidraw (`@excalidraw/excalidraw`). Multiple boards per user in IndexedDB (`whiteboards`); folders live in IndexedDB meta (`whiteboard_folders::{userId}`). The sidebar creates, nests, renames, and deletes folders. Boards and folders move by dragging onto a folder or the list root, the same way notes do. Deleting a folder keeps the boards and lifts them to the parent folder. Scene writes go through a latest-only serializer so a failed load cannot keep a stale canvas.

A note opens another note with `[[Title]]`, a board with `[[board:Title]]`, or an https page with `[[link:https://…]]`. The parser is `apps/shared/markdown/wikiTarget.ts`. A click flushes the note first. A board opens the existing board with that title or creates an empty one, then navigates to the whiteboard page. `![[file.png]]` embeds an image from the vault: next to the note, then by file name. `notes_vault_find_image` returns the shortest match.

| File | Role |
|------|------|
| `features/whiteboard/repository/whiteboardStore.ts` | IndexedDB read/write |
| `features/whiteboard/repository/whiteboardFolders.ts` | Folder tree in IndexedDB meta |
| `features/whiteboard/api/whiteboardClient.ts` | Public local-board façade used by pages |
| `features/whiteboard/api/liveBoard.ts` | Live Yjs session. Imported by the whiteboard page only |
| `pages/Whiteboard/WhiteboardPage.tsx` | Multi-board UI + latest-only save |
| `shared/lib/excalidraw/nordlyTheme.ts` | Theme sync |

Sharing (requires sign-in + network):

- **Live share** → `POST /v1/rooms/share-whiteboard` keeps `roomId` and `accessToken` in memory and joins `WS /ws/editor/{roomId}` as a subscriber. The desktop canvas is view-only and does not publish strokes. Drawing is web+web. Stop sharing, room close, or token expiry writes the Yjs scene into the local board and paints it once. Invite URL is `code.trynordly.app/{roomId}`.
- **Publish** → `POST /v1/rooms/publish-whiteboard` → web `/board/{slug}` (read-only)

## Browser capture

Settings → Browser shows how to load the unpacked Chrome folder and a pairing code stored in a private `capture-token` file under the app data directory (`0600` on Unix). Existing Keychain codes migrate once when Browser settings request the code; background capture requests never read Keychain. The installer copies that folder into the app resources, so a downloaded Nordly still has it. `src-tauri/resources/extension` is committed so Rust checks can see it, and `npm run extension:stage` refreshes it before a desktop build. While the process is running, Nordly listens on `127.0.0.1:47231` for the Chrome extension only (header `X-Nordly-Capture`, bearer code; `Origin` may be absent on a privileged extension request, and any other origin is rejected). `GET /v1/capture/notes` returns the one note marked “Save words here” in that note’s menu, and only while Settings → General → Flashcards is on. `POST /v1/capture` appends `word ::: translation` to that note. The open note goes through the editor draft. Any other note uses `updateNote`. Appends to one note are serialized. A locked vault returns an error and does not write an empty note. Hiding the window does not stop the listener.

## Flashcards

`front :: back` in a note is one card. `front ::: back` is that card and the reverse. The first `:` on a card line asks MyMemory once and fills an empty right side when the line is `::` or `:::`. The Chrome extension in `apps/extension` asks once on Enter and appends `word ::: translation` through the local capture port while this app is running. List markers are ignored. Progress is local IndexedDB `card_reviews` (not synced); daily answer/new-card totals are in `meta`. The Statistics overlay reads them through `features/cards/api/cardStats.ts`, not by scanning note bodies. Settings → General → Flashcards is off by default and caps new cards per day. Review is `PageId.cards`, opened from the palette (`R`), from the note header, from a home chip when cards are due, or from the pomodoro-finished banner (five cards). Same question text keeps one progress record across notes. Changing the question starts a new card.

Spotify volume updates its target immediately, including after pointer-up. One native writer sends at most once every 120ms and coalesces intermediate values; late reads cannot overwrite a newer choice. Errors restore the last confirmed volume. `spotifyEnabled` is persistent, default on. Off stops new native operations, queued writes and visible polling, and hides music controls; optional library requests are blocked/cancelled. On refreshes local state without OAuth. Library backoff survives toggling: respect Retry-After; QUOTA_EXCEEDED without it uses a conservative 15-minute client pause, not a claimed provider reset time. Spotify controller and dock volume controls load asynchronously.

The native range input owns pointer capture. Pointer-driven changes require a held
primary button; pointer-up/cancel, lost capture, window blur and a zero-button move
end dragging and unlock volume reads. Keyboard adjustment remains available.

## Secret access

`src-tauri/src/credentials.rs` caches successful Keychain reads, including missing
entries, in process memory shared by all webviews. On macOS, `credentials-v1`
is one JSON map of account names to secrets (or null migration/logout markers)
in the OS Keychain. It is read once per process, so an ad-hoc update normally
needs authorization for one item after migration. Previously separate auth,
Spotify and per-user vault items migrate lazily: write the bundle before recording
success; retained old items support rollback, which may require signing in again
after tokens have rotated. Clearing an account writes a durable null marker and
also deletes its old item so it cannot restore a logged-out session. A failed
migration write leaves the old item and in-memory state unchanged and can retry.
First migration may require separate authorizations for the old items.
Windows retains separate entries to avoid Credential Manager blob-size limits.
Secrets remain in the OS store on disk, never in plaintext files or localStorage.
Spotify library credentials load only after opting into Liked Songs, never for
local player control or on each settings mount. Ad-hoc signatures cannot prevent reauthorization after an
update, and choosing Allow instead of Always Allow can prompt again next launch.

The notes sync wizard uses two labelled, styled password fields for new vaults,
and one existing-password field when unlocking. Continue and Enter submit the same
form; setup requires matching passwords, and errors clear when either field changes.

## Tauri IPC commands

Registered in `src-tauri/src/lib.rs`:

| Command | Purpose |
|---------|---------|
| `auth_session` | Load session from keychain |
| `auth_persist` | Save session to keychain (no event; renderer already updated store) |
| `auth_logout` | Clear session |
| `clipboard_write_text` | Main window only: write text to the system clipboard; no clipboard read API exposed |
| `confirm_app_exit` | Finish quit after the renderer rewrites the keychain session |
| `vault_pass_load/save/clear` | Encrypted-vault passphrase keychain |
| `spotify_local_read/playback/volume` | Local player access, guarded to the main window; only explicit `requestAccess` can prompt |
| `spotify_secret_load/save/clear` | Spotify tokens and PKCE verifier in the OS keychain. Not cleared by `auth_logout` |
| `notes_vault_*` | Filesystem vault: config, CRUD, paste image, watch, `notes_vault_find_image` (shortest image path by file name) |
| `capture_status` / `capture_token` / `capture_token_rotate` / `capture_reply` | Loopback capture for the Chrome extension. Token is in the private app-data file |
| `pomodoro_load/save` | Timer snapshot (Tauri store) |
| `show_notification` | Themed always-on-top banner (top-right) when pomodoro completes; auto-hides after 60s |
| `hide_notification` | Dismiss notification banner (swipe or timeout) |
| `focus_main_window` | Raise main window (notification click) |
| `shell_open_external` | Open URL in browser |
| `read_text_file` | Read markdown under a path the OS just dropped on the main window (10 min). `root` + `relative_path`; rejects `..` and any other root; `.md` / `.markdown` ≤2 MiB |
| `read_binary_file` | Read an image under that same drop (a dropped folder, or the folder of a dropped note). Rejects `..`; png/jpeg/gif/webp ≤5 MiB |
| `list_markdown_import_entries` | List markdown under a directory the OS dropped (not a path the window invented) |
| `window_traffic_lights_show` | macOS traffic lights |
| `tray_show_main` | Show main window + open palette (from tray popover) |
| `deep_link_initial` | Returns the URL that cold-launched the app (custom scheme), if any |

**Menu bar (desktop):** left clicks toggle the `tray-popover` window (timer + theme poster). On macOS it joins all Spaces, including fullscreen app Spaces, as a nonactivating NSPanel at floating level, below the system menu bar. The panel is clamped below the menu bar on its current screen. Status-item activation does not open the main window; Dock reopen and the hamburger remain explicit ways to open it. When local Spotify is ready, the timer caption shows the current track. The heart is available only for an identified track with optional Liked Songs enabled. One play/pause button changes the timer immediately and sends the desired local Spotify state independently. Visible consumers share a 2-second **local IPC** poller; there is no Spotify Web API polling. API quota/retry handling is confined to optional library actions and accounts token requests. Hamburger in popover calls `tray_show_main`.

Events: `app:deep-link` (warm-start), `auth:changed`, `app:open-palette`, `pomodoro:sync`, `theme:sync`, `spotify:now-playing`, `spotify:cmd`, `tray-popover:show`, `tray-popover:hide`. Cold-start deep links are pulled once via `deep_link_initial` on renderer mount. Deep link schemes: `focus`, `task.open?id=…`, `note.open?id=…`, `settings?google_calendar=…` (Google Calendar OAuth), `settings?zoom=…` (Zoom OAuth), `settings?code=…&state=…` (Spotify PKCE).

## Commands

```bash
cd apps/nordly
cp .env.example .env
npm install
npm run dev              # macOS: signed macos-dev/Nordly.app (Calendar TCC); else: tauri dev
npm run dev:tauri        # plain tauri dev (no Apple Calendar permission dialog on macOS)
npm run dev:macos-app    # macOS .app wrapper only
npm run dev:vite         # browser-only (no IPC)
npm run typecheck
npm run test
npm run build            # Tauri release
```

Local backend: `VITE_NORDLY_LOCAL_API=true` + `make start` in each service.

## Release + updater

Auto-update is a persistent device setting. Off → On checks immediately even
after a recent daily check; unrelated setting changes do not trigger a check.
The background worker reports phases/errors to Software settings through
`NORDLY_EVENTS.updateAvailable`. Failed checks/installs do not consume the daily
interval: focus/visibility can retry after a five-minute cooldown, or the user
can retry immediately with Off → On. Manual and automatic updates share one
download/install. Switching Off during the native check prevents an automatic
download; an explicit manual install still proceeds. A download/install already
started is allowed to finish. The worker loads asynchronously at app startup.

Windows checks: [docs/windows-testing.md](docs/windows-testing.md). The separate
`nordly-windows-check` workflow runs Windows tests and builds an unsigned NSIS
artifact without publishing. Installation, native UI, and upgrade scenarios
still need Windows runtime verification. Browser capture uses Tauri's
cross-platform opener for Explorer/Finder and Chrome settings.

| Piece | Location |
|-------|----------|
| CI workflow | `.github/workflows/nordly-release.yml` — trigger: tag `nordly-v*` |
| Updater endpoint | `https://trynordly.app/desktop/latest.json` (`plugins.updater.endpoints` in `tauri.conf.json`) |
| CDN sync | same workflow, job `sync-cdn` — SCP installers + rewritten manifests to VPS `deploy/data/cdn/desktop` |
| Main version sync | job `sync-main-version` — commits `tauri.conf.json` / `Cargo.toml` / `package.json` after release |
| Settings UI | `pages/Settings/sections/SoftwareSection.tsx` |
| Updater helper | `shared/lib/updater.ts` — `@tauri-apps/plugin-updater` + `plugin-process` relaunch |

Release flow: push `main` → tag `nordly-vX.Y.Z` → push tag → CI builds artifacts (`LOCAL_ONLY=false`), publishes GitHub Release, copies installers to `https://trynordly.app/desktop`. Site `/download` and in-app updates both read that CDN.

Default macOS bundle uses ad-hoc signing (`signingIdentity: "-"` in `tauri.conf.json`) so CI works without Apple certs. Set repo variable `NORDLY_CODE_SIGNING=true` + Apple secrets for Developer ID + notarization (see `SIGNING.md`).

GitHub secret `TAURI_SIGNING_PRIVATE_KEY` must match `plugins.updater.pubkey`. Private key lives in `.tauri/nordly.key` (gitignored).

## Known gaps

| Gap | Status |
|-----|--------|
| Note folders sync | FS vault: folders = dirs; rename/move enqueues path remaps to notes CRUD |
| Vault markdown cloud | Markdown `.md` files push/pull via existing notes CRUD (`vaultFileSync.ts`) after notes sync is turned on. Images stay local. Dedicated List/Put/Get/DeleteVaultFile RPCs still not shipped |
| Google OAuth callback | Handled: tracker redirects to web `/oauth/google-calendar` → `nordly://settings?google_calendar=…` |
| Zoom OAuth callback | Handled: tracker redirects to web `/oauth/zoom` → `nordly://settings?zoom=…` |
| Spotify OAuth callback | Web `/oauth/spotify` forwards `code` and `state` to `nordly://settings`. PKCE exchange stays in the desktop app |

## Layout

```
apps/nordly/
├── AGENTS.md
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
    │   ├── notes/               # api, repository, remote, sync/
    │   ├── tasks/               # api, repository, remote, lib, components, sync/
    │   └── calendar/            # api façade, model, remote (HTTP), repository (IDB), lib
    ├── pages/                   # route composition only (TaskBoard page shell, Notes, …)
    └── widgets/                 # Dock, Palette, CanvasBg, overlays, Login
```

**Import rule:** dependencies point inward — `shared` never imports `pages/` or `widgets/`;
`features` never imports `pages/`. Pages/widgets cannot import feature `repository/`, `remote/`,
or `sync/`. Notes settings use `features/notes/api/notesSync`. Pages/widgets refresh Google Calendar via `features/calendar/api/googleCalendarState`, not cache/connection/worker stores. Task/planning imports from calendar are restricted to `features/calendar/api/`.
Types like `PageId` and `ThemeId` live in `shared/model/`. Per feature: `repository/` (IndexedDB)
and `remote/` (HTTP) are implementation details; `api/` is the public façade.
