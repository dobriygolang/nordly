# Onboarding — project-nordly

Architecture overview for the **Nordly productivity stack**.

## Platform (current)

```
Nordly (Tauri desktop) ──HTTP──► identity | tracker | notes | focus | rooms (whiteboard share/publish)
Web (landing + live) ──HTTP/WS──► identity | billing | rooms | sandbox | notes (public)
```

Each service has its own Postgres. Cross-service calls via gRPC adapters only.

| Client | Docs |
|--------|------|
| Nordly desktop | [apps/nordly/AGENTS.md](../../apps/nordly/AGENTS.md) |
| Web companion | [apps/web/AGENTS.md](../../apps/web/AGENTS.md) |
| Backend services | [AGENTS.md](../../AGENTS.md) |
| API usage matrix | [backend-client-matrix.md](../backend-client-matrix.md) |

Ports: [AGENTS.md — port allocation](../../AGENTS.md#port-allocation-defaults).

## Active services (prod)

| Service | Purpose | Clients |
|---------|---------|---------|
| identity | Telegram auth, JWT | nordly |
| tracker | Work tasks, Google Calendar | nordly |
| notes | Notes CRUD, vault, publish | nordly, web (public slug) |
| focus | Pomodoro sessions, stats | nordly |
| rooms | Live collab, Yjs WS, board publish | web, nordly (share) |
| sandbox | Code run, format | web (live rooms) |
| billing | Plans, entitlements | web (pricing), notes/sandbox (gates) |

Plan matrix: [docs/billing-features.md](../billing-features.md).

**Billing note:** `live_rooms_per_month` / `live_rooms_concurrent` entitlements exist in billing; **rooms does not consume them yet** (reserved for future wiring).

## gRPC dependencies (active)

| From | To | Why |
|------|-----|-----|
| notes | billing | `published_notes_active` on share-to-web; `publish_password` for private links |
| rooms | identity | scoped guest JWT mint |
| sandbox | billing | code run quotas |

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

## Local dev

**Nordly:**

```bash
cd apps/nordly && cp .env.example .env && npm install && npm run dev
# Optional cloud sync: VITE_NORDLY_LOCAL_ONLY=false + VITE_NORDLY_LOCAL_API=true
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

Prod ops: [deploy/RUNBOOK.md](../../deploy/RUNBOOK.md). Monitoring: [deploy/grafana/README.md](../../deploy/grafana/README.md) (Product dashboard for business metrics).

## First week checklist

- [ ] Read [AGENTS.md](../../AGENTS.md) + [architecture-standard.mdc](../../.cursor/rules/architecture-standard.mdc)
- [ ] Read [apps/nordly/AGENTS.md](../../apps/nordly/AGENTS.md) or [apps/web/AGENTS.md](../../apps/web/AGENTS.md) for your area
- [ ] Skim [backend-client-matrix.md](../backend-client-matrix.md)
- [ ] Run nordly locally; try notes, task board, whiteboard
- [ ] Run web `/live/new` with local rooms + sandbox
