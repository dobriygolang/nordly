# AGENTS.md — project-nordly (monorepo index)

## Codex: instruction loading

Root and component `AGENTS.md` files are the canonical project instructions.
Read the relevant instructions and required documents before working; a link
does not load its contents automatically. Keep detailed standards in
`docs/engineering/` and workflows in `.agents/skills/`; do not duplicate their
bodies across instruction files and skills.

Before repository work, read [fail-fast policy](docs/engineering/fail-fast-no-fallbacks.md).
For service implementation, service architecture, or Go changes, also read
[architecture standard](docs/engineering/architecture-standard.md) and
[Go backend conventions](docs/engineering/go-backend.md).
Before adding a service, editing proto, or changing CI/deploy service lists, read
[service registry checklist](docs/engineering/service-registry.md).

Before working in a service or app, read its `AGENTS.md` and any documents it
requires for the task. Repeat for every component actually touched by a
cross-component task; do not load unrelated components. Root and component
instructions apply together; component instructions take precedence within
their scope. Detailed standards describe target architecture, not a reason to
rewrite unrelated code.

Markdown links resolve relative to their containing file. Repository-root paths
in prose (`services/`, `apps/`, `docs/`, `deploy/`) resolve from this repository.

### Concise responses and terminal output

- Caveman is a user-level skill. When available, read its `SKILL.md` and use its
  concise response style by default for this project. Preserve technical detail
  and the user's language; honor requests for normal or more detailed responses.
  Do not compress persisted code, comments, or documentation into caveman prose.
- Use the installed `rtk` for supported commands with verbose output, for example
  `rtk git status --short`, `rtk git diff --stat`, `rtk go test ./...`,
  `rtk go build ./...`, and `rtk golangci-lint run`. Run service commands from
  that service's directory and retain required environment variables such as
  `GOWORK=off`. Check `rtk <command> --help` when support is uncertain.
- Read instruction files unfiltered. Use native commands for exact source reads,
  line references, full patch review, or diagnostics hidden by compression.
  RTK is output compression, not a substitute for inspecting failures or checking
  exit status. Use explicit wrappers; no automatic hook is required.

### Agent routing

Use this model routing whenever delegating work in Nordly:

- Repository search and code navigation: `explorer`, using `gpt-6-luna` with `high` reasoning.
- Implementation, fixes, and refactoring: `worker`, using `gpt-6.1-sol` with `medium` reasoning.
- Complex code review (cross-component behavior, concurrency, security, data integrity):
  `reviewer`, using `gpt-6-astra` with `high` reasoning. Review is read-only.

Project presets live in `.codex/agents/`. Use them for suitable delegated tasks.
Keep trivial work in the main agent when delegation adds no value. Follow the
active session's rules about when delegation is allowed.

When a skill selects a Cavecrew preset instead, preserve its scope and output contract:
use `gpt-6-luna` / `high` for `cavecrew-investigator`,
`gpt-6.1-sol` / `medium` for `cavecrew-builder`, and
`gpt-6-astra` / `high` for complex reviews with `cavecrew-reviewer`.
Pass explicit model and reasoning settings with a self-contained task and
`fork_turns="none"` when required by the delegation tool.

Give implementation agents explicit file or component ownership. Tell them they
share the workspace and must preserve other agents' and the user's changes.
Require evidence with file references from search and review agents, and relevant
validation results from implementation agents. Surface unavailable models instead
of silently switching to another model.

### Git commits

When creating commits:

- Prefix the subject with the Linear issue id: `[NOR-123] Brief summary`.
- Write only a **brief summary** (1–2 sentences) focused on *why*, not a changelog.
- Do **not** append trailers or footers: no `Co-authored-by`, no `Signed-off-by`, no tool attribution.
- Never add agent/editor credits or attribution trailers.

Example:

```bash
git commit -m "$(cat <<'EOF'
[NOR-42] Reset prod databases before v0.0.1 launch.

EOF
)"
```

Release branches: see [docs/release-process.md](docs/release-process.md).

### Project skills

Skills live in `.agents/skills/` and load only when relevant:

- `nordly-backend`: Go service implementation and focused backend fixes.
- `nordly-system-design`: architecture decisions and cross-service flow design.
- `nordly-ui`: UI implementation and refinement in the existing apps.

Read the selected skill's `SKILL.md`; these workflows complement the rules above
and do not replace component instructions.

This repo groups independent services under `services/<name>/`.

**Do not use a root Makefile** — each service is self-contained.

When working on a service, **open only that service folder** and read its local `AGENTS.md`.

| Service | AGENTS.md | Reference for |
|---------|-----------|---------------|
| **template** | [services/template/AGENTS.md](services/template/AGENTS.md) | **copy skeleton** for new services |
| identity | [services/identity/AGENTS.md](services/identity/AGENTS.md) | auth, Redis, interceptors, custom HTTP |
| sandbox | [services/sandbox/AGENTS.md](services/sandbox/AGENTS.md) | code execution + LSP (live rooms) |
| **rooms** | [services/rooms/AGENTS.md](services/rooms/AGENTS.md) | live coding collab, WS + Yjs |
| **tracker** | [services/tracker/AGENTS.md](services/tracker/AGENTS.md) | task board, sprint/epic, Google Calendar |
| **notes** | [services/notes/AGENTS.md](services/notes/AGENTS.md) | notes, E2EE vault, publish-to-web |
| **focus** | [services/focus/AGENTS.md](services/focus/AGENTS.md) | pomodoro sessions, focus stats |

**Desktop app (Nordly):** [apps/nordly/AGENTS.md](apps/nordly/AGENTS.md) — Tauri focus workspace (notes, tasks, whiteboard, sync).

**Web companion:** [apps/web/AGENTS.md](apps/web/AGENTS.md) — landing, guest live collab, published notes/boards.

**Chrome extension:** [apps/extension/AGENTS.md](apps/extension/AGENTS.md) — side panel that appends a translated card line to a local Nordly note.

Prod deploy: [deploy/PRODUCTION_CHECKLIST.md](deploy/PRODUCTION_CHECKLIST.md), [deploy/RUNBOOK.md](deploy/RUNBOOK.md)

Observability: [deploy/grafana/README.md](deploy/grafana/README.md) — Prometheus `GET /metrics` on all prod services; Grafana dashboards **Platform**, **HTTP routes**, **Product**.

**CI_SERVICES** (`deploy/scripts/services.conf.sh`): identity, sandbox, rooms, tracker, notes, focus. **template** is skeleton-only (not in CI).

Root `go.work` is optional. Services build with `GOWORK=off`.

---

## Service template (canonical)

Pattern from **identity** + **template**. **Start new services by copying `services/template/`.**

> **Target architecture (CQRS + DDD + Clean Architecture):** see
> [architecture-standard.md](docs/engineering/architecture-standard.md)
> and [fail-fast-no-fallbacks.md](docs/engineering/fail-fast-no-fallbacks.md).
> Prefer `slices`/`sort`, mockery-only tests, fail at `New`/`Load`, delete dead branches,
> drop unused fields/SQL. Per domain add `usecase/{command,query}/<op>/` packages (each = `command|query.go`
> with `Validate()` + `handler.go` with `New`/`Handle` + `mocks/`) and a `repository/store.go`
> port. Reference exemplars: `services/template/internal/example/usecase/query/get_item/`
> (read) and `services/template/internal/example/usecase/command/` (write — add when extracting commands).
> The directory tree below is the minimal skeleton; grow it toward the standard as a service matures.

### Directory tree

```
services/<name>/
├── AGENTS.md
├── Makefile
├── go.mod
├── .golangci.yml
├── buf.yaml
├── buf.gen.yaml
├── .gitignore                  # .bin/, pkg/api/
├── cmd/
│   └── <name>/
│       ├── main.go
│       └── app/
│           ├── run.go            # DI only
│           └── server.go         # HTTP + gRPC startup
├── api/
│   ├── google/api/               # vendored annotations (copy from template)
│   └── <name>/v1/
│       └── <name>.proto
├── pkg/
│   ├── api/                      # generated — gitignored
│   └── client/                   # port for other services (= domain Service)
├── internal/
│   ├── <domain>/                 # one or more bounded contexts
│   │   ├── model/
│   │   ├── repository/           # concrete postgres/redis
│   │   └── service/              # Service interface + impl
│   ├── adapter/<vendor>/         # external APIs only (OAuth, …)
│   ├── app/api/<name>/           # transport — see below
│   ├── config/
│   └── tools/                    # logger, humanerror
└── scripts/
    ├── migrations/               # goose SQL
    └── dev/docker-compose.yml
```

### Transport layer (`internal/app/api/<name>/`)

| File | Role |
|------|------|
| `service.go` | `Implementation` struct + `NewImplementation(svc domain.Service)` |
| `register.go` | gRPC registration, `NewRegisteredImplementation` |
| `gateway.go` | grpc-gateway mux, `HealthzHTTP`, `RegisterGateway` |
| `errors.go` | gRPC status helpers (`invalidArgument`, `notFound`, …) |
| `mapper.go` | proto ↔ domain mapping, `mapServiceError` |
| `<rpc_name>.go` | **One RPC per file** (`get_item.go`, `list_items.go`, …) |

Custom HTTP routes (file download, auth config): add `*_http.go` on `Implementation`.

### Layer rules

```
transport → domain service (interface) → repository → postgres/redis
                                              ↑
                                    adapter/ — 3rd-party APIs only
```

| Layer | Responsibility |
|-------|----------------|
| **Transport** | Validate request, call domain `Service`, map errors to gRPC |
| **Service** | `Service` interface + unexported struct; business logic; `New(Deps) Service` |
| **Repository** | Concrete SQL/Redis; `ErrNotFound`; no interface-only package |
| **Model** | Plain structs, no DB/HTTP imports |
| **DI** | `cmd/<name>/app/run.go` wires everything |

### Domain service pattern

```go
// internal/<domain>/service/service.go
type Service interface {
    GetItem(ctx context.Context, id, slug string) (*model.Item, error)
}

type itemService struct { repo *repository.Repository }

func New(deps Deps) Service { return &itemService{repo: deps.Repo} }
```

Transport receives `domain.Service`, not a duplicate transport interface:

```go
// internal/app/api/<name>/register.go
func NewRegisteredImplementation(s *grpc.Server, svc exampleservice.Service) *Implementation
```

### Port allocation (defaults)

| Service | HTTP | gRPC | Postgres port | DB name |
|---------|------|------|---------------|---------|
| identity | 8080 | 9090 | 5432 | nordly |
| sandbox | 8086 | 9096 | 5439 | nordly_sandbox |
| **rooms** | **8087** | **9097** | **5440** | **nordly_rooms** |
| **tracker** | **8089** | **9099** | **5441** | **nordly_tracker** |
| **notes** | **8090** | **9100** | **5442** | **nordly_notes** |
| **focus** | **8091** | **9101** | **5443** | **nordly_focus** |
| template | 8099 | 9199 | 5439 | nordly_template |

All prod HTTP services expose `GET /metrics` (request instrumentation + domain counters where implemented). See [deploy/grafana/README.md](deploy/grafana/README.md).

Pick unused ports for each new service. Update `Makefile`, `config.go`, `docker-compose.yml`.

### Do / Don't

| Do | Don't |
|----|-------|
| Copy `services/template/` | Start from empty folder |
| One handler file per RPC | `handlers.go` with all RPCs |
| Domain `Service` interface | Duplicate interface in transport |
| `errors.go` for gRPC codes | Error helpers in `gateway.go` |
| Vendored `api/google/api/` | buf remote deps behind corporate proxy |
| `make gen-proto` → `.bin/` | buf in go.mod |
| `GOPROXY=https://proxy.golang.org,direct go mod tidy` | Ignore go.sum proxy errors |

### Proto & API

- gRPC + HTTP in one proto via `google.api.http`.
- Internal-only RPCs: omit HTTP annotation.
- `additional_bindings` for slug lookups: `/v1/items/by-slug/{slug}`.
- Generated code in `pkg/api/` — never edit.

### Standard Makefile targets

```bash
make help | start | run | build | test | lint | gen-proto
make migrate-new NAME=<snake> | migrate-up | migrate-down | stop
```

### New service checklist

Follow [services/template/AGENTS.md](services/template/AGENTS.md#copy-as-new-service): copy template, rename, pick ports, `make migrate-new NAME=init`, `make gen-proto && make lint && make build`, document in `AGENTS.md`.

**Registry (CI/deploy):** edit [deploy/scripts/services.conf.sh](deploy/scripts/services.conf.sh), sync `.github/workflows/ci.yml` matrix + `go.work`, run `bash deploy/scripts/verify-service-registry.sh`. Full list: [service-registry.md](docs/engineering/service-registry.md).

### Go proxy

Corporate proxy stale cache: `GOPROXY=https://proxy.golang.org,direct go mod tidy`

### Documentation

Each `services/<name>/AGENTS.md` is the source of truth for that service;
`apps/<name>/AGENTS.md` owns app-specific instructions. Cross-service flows live
in [docs/onboarding/README.md](docs/onboarding/README.md).

Update relevant documentation in the same change set when changing HTTP/gRPC
routes, auth, environment variables, ports, database names, worker intervals or
batches, outbox events and their producers/consumers, adapter dependencies, or
directory/usecase layout. For one component, update its `AGENTS.md` and relevant
engineering guide; for cross-component flows, also update onboarding docs.
Document implemented behavior only. If code and docs disagree, fix the mismatch
in the same change set. Keep mandatory loading conditions explicit in AGENTS.md.
