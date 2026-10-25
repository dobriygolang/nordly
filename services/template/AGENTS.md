# AGENTS.md — template service (skeleton)

**Not production.** Copy to bootstrap new services. Not in `CI_SERVICES` — skeleton only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/template`

## Engineering requirements

For Go changes, read the shared [Go conventions](../../docs/engineering/go-backend.md)
and [architecture standard](../../docs/engineering/architecture-standard.md).
Wire dependencies in `cmd/template/app/run.go`; keep transport thin.

Transport thin; logic in `internal/<domain>/service/` → extract `usecase/{command,query}` as complexity grows.
Mockery-only tests; `New` returns an error on missing required deps.

## Copy as new service

```bash
NEW=myservice
cp -R services/template "services/${NEW}"
# sed template→NEW, nordly_template→nordly_${NEW} in go/proto/make files
# mv cmd/template, api/template, internal/app/api/template
# rename internal/example → your domain
cd "services/${NEW}" && make gen-proto && make tidy && make lint && make build
```

On Linux: `sed -i` without `''`. Pick unique ports — [root AGENTS.md port table](../../AGENTS.md#port-allocation-defaults).

## Layout

See [architecture-standard.md](../../docs/engineering/architecture-standard.md). Exemplars:

- Read: `internal/example/usecase/query/get_item/`
- Write: add `internal/<domain>/usecase/command/<op>/` following the root architecture standard.

## Example API

| RPC | HTTP |
|-----|------|
| Ping | `GET /v1/ping` |
| ListItems, GetItem | `GET /v1/items` |

## Ports

HTTP `8099` | gRPC `9199` | PG `5439` / `nordly_template`

## Commands

```bash
cd services/template
make start | gen-proto | lint | build
```

Reference services: **identity** (auth, Redis, custom HTTP) and other active services listed in root `AGENTS.md`.
