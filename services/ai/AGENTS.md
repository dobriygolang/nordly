# AGENTS.md — ai service

> **ARCHIVED — CI only, not prod.** Interview evaluation pipeline; retained for CI matrix builds. Do not deploy or wire new product features to this service.

Work from `services/ai/` only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/ai`

## Purpose

LLM evaluation for **retired** interview attempts. `run.go` wires Postgres, Redis, LLM chains, and optional billing only — **interview/content gRPC clients are not configured**; the outbox worker exits idle when `InterviewClient` is nil.

Does not own: users, catalog, sessions.

## Ports

HTTP `8083` | gRPC `9093` | PG `5435` / `nordly_ai`

## Tables

`evaluation_jobs` (unique `attempt_id`) | `model_calls` | `llm_runtime_config`

## Workers

- **Outbox** — would consume `interview.attempt_submitted` when interview client is wired; currently disabled in default `run.go`

## API

Internal only (`x-internal-token`): `RunEvaluation`, admin eval jobs, `GetLLMConfig` / `UpdateLLMConfig`, `ProbeLLMProviders`.

## Commands

```bash
cd services/ai
export INTERNAL_API_TOKEN=dev-internal-token
make start | gen-proto | gen-mocks | test | lint | build
```

## Env

| Variable | Notes |
|----------|-------|
| INTERNAL_API_TOKEN | **required** |
| BILLING_GRPC_ADDR | optional (CI builds without billing dial) |
| LLM_* keys | optional in dev — fake evaluator when no keys |
| REDIS_ADDR | optional — prompt cache L2 |

Build: `GOWORK=off`
