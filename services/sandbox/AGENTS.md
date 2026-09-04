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
  model/                           CodeRun + strict RunStatus/Language enums + run limits
  repository/                      Store port + Postgres
  service/                         thin orchestrator
  usecase/command/run_code|format_code|process_queued_runs/
  usecase/query/get_code_run/
  usecase/support/                 shared run helpers
internal/adapter/runner/           external runner clients
internal/runworker/                async queue poller
```

## API

| RPC | HTTP |
|-----|------|
| RunCode | `POST /v1/sandbox/code-runs` |
| GetCodeRun | `GET /v1/sandbox/code-runs/{id}` |
| FormatCode | `POST /v1/sandbox/format` |

All runs are custom source execution (language + code + optional stdin). Task-linked
run modes, test evaluation/results, and memory telemetry were removed. Their proto
field numbers/names are reserved and migration `00002_execution_leases.sql` drops the
dead columns.

Wire enums (grpc-gateway names): `LANGUAGE_GO` / `LANGUAGE_PYTHON` /
`LANGUAGE_JAVASCRIPT` and `RUN_STATUS_*`. Domain/DB stay `go` / `queued`.
Mapping: `internal/app/api/sandbox/proto_enums.go`. Language aliases (`golang`,
`py`, `js`) are not accepted.

All three RPC requests carry optional `room_id`. An unrestricted user-session JWT
must omit it and can fetch only its own runs. An editor JWT must provide it; auth
validates the token against exactly `editor:{room_id}`. Fetching then also requires
the persisted run's `room_id` to match, even when the editor token subject created
the run.

## Runner (`RUNNER_MODE`)

| Mode | Use |
|------|-----|
| `fake` | dev/CI stub |
| `process` | **dev only** — no isolation |
| `docker` | **production required** — container per run |

Prod host needs `/var/lib/sandbox-work` bind-mount + Docker socket. See [deploy/RUNBOOK.md](../../deploy/RUNBOOK.md).

Every subprocess/Docker stdout, stderr, compiler, formatter, and warmup stream is
drained through a bounded writer. Python uses `py_compile` and JavaScript uses
`node --check` before runtime, so `NameError`/`ReferenceError` and runtime-created
`SyntaxError` values remain runtime errors. Parent cancellation propagates; only
the runner-owned deadline becomes `timeout`. Docker containers are named and
force-removed after cancellation. Background image/compiler warmup is cancellable
and joined before the logger closes.

Runs persist before execution. Each running row has a unique `claim_token` and
`lease_expires_at`. The worker atomically claims queued or expired running rows;
terminal updates match both `running` and the claim token, then clear the lease.
A reclaimed run therefore cannot be overwritten by its stale worker. The worker
runs even when synchronous execution is selected so interrupted synchronous runs
can be reclaimed.

Run admission is serialized with PostgreSQL advisory transaction locks. It enforces
configured rolling one-minute request rates and active queued/running concurrency
for both user and, when present, room. Capacity errors map to `ResourceExhausted`.

## Commands

```bash
cd services/sandbox
make gen-proto | start | test | lint
```

Env: JWT public key; typed `RUNNER_MODE`; `SANDBOX_MAX_OUTPUT_BYTES`,
`SANDBOX_MAX_CODE_BYTES`, `SANDBOX_MAX_STDIN_BYTES`,
`SANDBOX_DEFAULT_TIMEOUT_MS`, `SANDBOX_DEFAULT_MEMORY_MB`,
`SANDBOX_DEFAULT_CPUS`, `SANDBOX_QUEUE_LEASE_MS`,
`SANDBOX_MAX_CONCURRENT_RUNS_PER_USER`,
`SANDBOX_MAX_CONCURRENT_RUNS_PER_ROOM`,
`SANDBOX_USER_REQUESTS_PER_MINUTE`, `SANDBOX_ROOM_REQUESTS_PER_MINUTE`,
and worker interval/batch. Values must be positive, batch is capped at 50, and the
lease must exceed the execution timeout. Docker mode also requires an absolute
`SANDBOX_DOCKER_WORK_ROOT`; image vars select Go/Python/Node runtimes and the
optional explicit `SANDBOX_DOCKER_GOCACHE_DIR` defaults beneath the work root.
`SANDBOX_ASYNC_RUNS` selects queued versus immediate execution, but the reclaim
worker always remains active. `service.New` rejects missing Repo/Runner/limits.
Persistence and usecase ports use mockery-generated mocks.

## Metrics

`GET /metrics` — HTTP instrumentation only (no domain counters yet).
