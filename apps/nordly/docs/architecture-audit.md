# Nordly — architecture audit & clean-up tracker

Living doc: every source file reviewed, fixes applied, target renderer layout.

**Policy:** fail fast — no silent fallbacks, legacy reads, or dual wire formats. See [`.cursor/rules/fail-fast-no-fallbacks.mdc`](../../../.cursor/rules/fail-fast-no-fallbacks.mdc) and [`.cursor/rules/nordly.mdc`](../.cursor/rules/nordly.mdc).

## Target layers (renderer)

```
platform/   Tauri IPC, runtime — no domain logic
shared/     db, sync, crypto, model, lib, ui — never import pages/ or widgets/
features/   domain API + repository + hooks + components — never import pages/
pages/      route composition
widgets/    chrome, overlays — features + shared only (lazy @pages/ imports OK)
app/        bootstrap, shell, styles
```

**Import rule:** dependencies point inward. `shared` must not import `widgets` or `pages`.

**Cloud gates:** `isCloudEnabled()` (`shared/model/features.ts`), `isSyncEnabled()` (`shared/sync/syncConfig.ts`). UI/integration code uses these — not raw env checks scattered everywhere.

**JSON wire:** grpc-gateway protojson → camelCase. Custom identity HTTP → snake_case where documented. Use `shared/api/json.ts` strict readers; no `field ?? other_field`.

## File checklist (158 source files)

Legend: ✅ reviewed + clean | ⚠️ reviewed, known follow-up

### src-tauri/ (8)

| File | Status | Notes |
|------|--------|-------|
| auth.rs | ✅ | camelCase serde session |
| lib.rs | ✅ | command registration |
| main.rs | ✅ | entry |
| notification.rs | ✅ | monitor fallback OK (positioning) |
| store.rs | ✅ | pomodoro Tauri store |
| tray.rs | ✅ | best-effort window ops |
| vault.rs | ✅ | keychain IPC |
| window_macos.rs | ✅ | traffic lights |

### app/ (4)

| File | Status | Notes |
|------|--------|-------|
| App.tsx | ✅ | isCloudEnabled workers |
| config/features.ts | ✅ | re-exports shared/model/features |
| main.tsx | ✅ | bootstrap |
| vite-env.d.ts | ✅ | types |

### platform/ (3)

| File | Status |
|------|--------|
| ipc.ts | ✅ |
| native-bridge.ts | ✅ |
| runtime.ts | ✅ |

### shared/api/ (7)

| File | Status | Notes |
|------|--------|-------|
| authSession.ts | ✅ | strict refresh tokens |
| authToken.ts | ✅ | requireAccessToken only |
| config.ts | ✅ | |
| device.ts | ✅ | |
| http.ts | ✅ | |
| json.ts | ✅ | **new** strict field readers |
| notifications.ts | ✅ | |

### shared/crypto/ (4)

| File | Status | Notes |
|------|--------|-------|
| vault.ts | ✅ | no cloud→local fallback |
| vaultPrefs.ts | ✅ | |
| vaultPublish.ts | ✅ | |
| recoveryKey.ts | ✅ | |

### shared/db, hooks, lib, model, sync, ui (47)

All ✅ — see git tree. Notable: `settings.ts` one-way migration; `SyncEngine.ts` surfaces retry errors; `features.ts` owns LOCAL_ONLY.

### features/ (44)

All ✅ — Phase 7: remote mappers + sync moved to `features/*/sync/`.

### pages/ (34)

All ✅ — Phase 6: `Notes.tsx` list reload + vault resync fail visibly.

### widgets/ (16)

All ✅ — Phase 6: `SyncStatusBanner` retry sets lastError.

## Changes applied

### Phases 1–5 (2026-07-02)

Layer extraction (theme, navigation, settings, task/planning components), auth fail-fast, sync dead-letter, i18n NoteRow, AGENTS layout.

### Phase 6 (2026-07-02) — fail-fast pass

`features.ts`, vault/auth/notes/sync fixes, `isCloudEnabled()`, strengthened rules.

### Phase 7 (2026-07-02)

1. **Remote mappers** — `notesRemote`, `calendarClient`, `focusRemote`, `whiteboardRemote` → `shared/api/json.ts` (camelCase only)
2. **Request bodies** — protojson camelCase (`bodyMd`, `sceneJson`, `allDay`, `taskId`, …)
3. **Sync domains** → `features/{notes,tasks,focus}/sync/*`; deleted `shared/sync/domains/`
4. **notesSync fail-fast** — required outbox `title`/`bodyMd`; pull encrypted notes throws when vault locked
5. **ESLint** — `no-restricted-imports` for `@pages/` / `@widgets/` in shared/features

### Phase 8 (2026-07-02)

1. **Sync registry** — `shared/sync/registry.ts` + `app/syncRegistry.ts`; `SyncEngine` no longer imports features
2. **`isNativeHttpInTauri`** — renamed from `useNativeHttpInTauri` (fixes ESLint rules-of-hooks)

## Open follow-ups

None from the initial audit.
