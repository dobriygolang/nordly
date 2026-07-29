# AGENTS.md — sandbox service

Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/sandbox`

## Purpose

Isolated code execution for **live coding rooms** (run, fetch result, format).

## Ports

HTTP `8086` | gRPC `9096` | PG `5439` / `nordly_sandbox`

## Layout

```
internal/app/api/sandbox/          transport (1 RPC = 1 file)
internal/sandbox/
  model/                           CodeRun + errors.go
  repository/                      Store port + Postgres
  service/                         thin orchestrator
  usecase/command/run_code|format_code|process_queued_runs/
  usecase/query/get_code_run/
  usecase/support/                 shared run helpers
internal/adapter/billing|runner/   external clients
internal/runworker/                async queue poller
```

## API

| RPC | HTTP |
|-----|------|
| RunCode | `POST /v1/sandbox/code-runs` |
| GetCodeRun | `GET /v1/sandbox/code-runs/{id}` |
| FormatCode | `POST /v1/sandbox/format` |
| Go LSP | disabled — the route is not exposed until gopls can run behind the isolated runner boundary |

All runs are **`custom`** (language + code + optional stdin). Task-linked `sample`/`submit` modes and content metadata were removed.

## Runner (`RUNNER_MODE`)

| Mode | Use |
|------|-----|
| `fake` | dev/CI stub |
| `process` | **dev only** — no isolation |
| `docker` | **production required** — container per run |

Prod host needs `/var/lib/sandbox-work` bind-mount + Docker socket. See [deploy/RUNBOOK.md](../../deploy/RUNBOOK.md).

## Billing

`INTERNAL_API_TOKEN` required. Runs and format requests consume `code_runs_per_day` quota via billing gRPC (always wired at startup). Live-room requests charge the stable scoped `room_id`, so reconnecting guests share a quota.

Live room runs store optional `room_id` (from JWT scope `editor:{roomID}`). `GetCodeRun` allows the runner or any guest scoped to the same room.

## Commands

```bash
cd services/sandbox
make gen-proto | start | test | lint
```

Env: JWT public key, `BILLING_GRPC_ADDR`, `SANDBOX_*` limits. Worker interval/batch, run `TimeoutMS`/`MemoryMB`/`CPUs`, and billing consume `amount` must be > 0 — no mid-path invent defaults. `service.New` panics if Repo/Billing/Runner/limits missing. Persistence port: `repository.Store` (mockery).

## Metrics

`GET /metrics` — HTTP instrumentation only (no domain counters yet).
