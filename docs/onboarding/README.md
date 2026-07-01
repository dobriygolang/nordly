# Onboarding — project-nordly

Architecture overview for the **Nordly productivity stack**.

## Platform (current)

```
Nordly (Tauri desktop) ──HTTP──► identity | tracker | notes | focus
Web (landing + live) ──HTTP/WS──► identity | billing | rooms | sandbox | notes (public)
```

Each service has its own Postgres. Cross-service calls via gRPC adapters only.

| Client | Docs |
|--------|------|
| Nordly desktop | [apps/nordly/AGENTS.md](../../apps/nordly/AGENTS.md) |
| Web companion | [apps/web/AGENTS.md](../../apps/web/AGENTS.md) |
| Backend services | [AGENTS.md](../../AGENTS.md) |
| API usage matrix | [api-usage-matrix.md](../architecture/api-usage-matrix.md) |

Ports: [AGENTS.md — port allocation](../../AGENTS.md#port-allocation-defaults).

## Active services (prod)

| Service | Purpose | Clients |
|---------|---------|---------|
| identity | Telegram auth, JWT | nordly, web (refresh only) |
| tracker | Work tasks, Google Calendar | nordly |
| notes | Notes CRUD, vault, publish | nordly, web (public slug) |
| focus | Pomodoro sessions, stats | nordly |
| rooms | Live collab, Yjs WS, board publish | web, nordly (share) |
| sandbox | Code run, format | web (live rooms) |
| billing | Plans, entitlements | web (pricing), notes/rooms (gates) |

**CI only (not prod):** ai — archived interview-era LLM gateway.

## gRPC dependencies (active)

| From | To | Why |
|------|-----|-----|
| notes | billing | `cloud_notes_count` gate on create |
| rooms | identity | scoped guest JWT mint |
| rooms | billing | live room quotas |
| sandbox | billing | code run quotas |
| tracker | identity | profile timezone fallback (optional) |

## Cross-app flows

### Nordly sync (when `LOCAL_ONLY=false`)

IndexedDB outbox → notes/tasks/focus HTTP APIs. LWW merge by `updatedAt`. See [nordly AGENTS — Sync engine](../../apps/nordly/AGENTS.md#sync-engine).

### Note publish

Nordly `share-to-web` → notes service stores slug → web `/notes/{slug}` (public, no auth).

### Whiteboard share

- **Live:** nordly `share-whiteboard` → rooms service → web `/live/{roomId}`
- **Publish:** nordly `publish-whiteboard` → rooms DB → web `/board/{slug}` read-only

### Live collab (web)

Guest creates room → scoped JWT → WS `/ws/editor/{roomId}`. Code (`practice`) or Excalidraw (`system_design`).

## Retired services

Removed from repo; do not reference in new code.

| Service | Was | Replaced by |
|---------|-----|-------------|
| content | Articles, templates | — (removed) |
| interview | Mock interviews, sessions | — (removed) |
| recommendation | Task picking, progress | — (removed) |
| admin | Operator BFF | — (removed) |

Legacy docs archived under [docs/archive/](../archive/).

## Local dev

**Nordly:**

```bash
cd apps/nordly && cp .env.example .env && npm install && npm run dev
# Optional cloud sync: VITE_HONE_LOCAL_ONLY=false + VITE_HONE_LOCAL_API=true
```

**Web + live rooms:**

```bash
cd services/identity && make start
cd services/billing && make start
cd services/sandbox && make start
cd services/rooms && make start
cd services/notes && make start
cd apps/web && npm install && npm run dev
```

**Full nordly backend:**

```bash
# identity, tracker, notes, focus on default ports
cd services/tracker && make start
cd services/focus && make start
```

Prod ops: [deploy/RUNBOOK.md](../../deploy/RUNBOOK.md).

## First week checklist

- [ ] Read [AGENTS.md](../../AGENTS.md) + [architecture-standard.mdc](../../.cursor/rules/architecture-standard.mdc)
- [ ] Read [apps/nordly/AGENTS.md](../../apps/nordly/AGENTS.md) or [apps/web/AGENTS.md](../../apps/web/AGENTS.md) for your area
- [ ] Skim [api-usage-matrix.md](../architecture/api-usage-matrix.md)
- [ ] Run nordly locally; try notes, task board, whiteboard
- [ ] Run web `/live/new` with local rooms + sandbox

## Diagrams

Open `.excalidraw` files in `docs/onboarding/` with Excalidraw extension. Regenerate: `python3 docs/onboarding/generate_excalidraw.py`.

**Note:** older diagrams may show retired services — treat this README as source of truth.
