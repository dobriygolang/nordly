# AGENTS.md — billing service

Work from this directory only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/billing`

## Purpose

**Entitlements, quotas, usage counters.** Product services call billing before expensive work.

Owns: plan entitlements (single active `default` plan), usage counters, subscription/webhook infra for ops.

Does not own: users (identity), tasks (tracker), notes (notes service).

## Entitlements

`value_json`: `{"type":"bool","value":true}` or `{"type":"counter","limit":N,"period":"day"|"month"}` or `{"type":"gauge","limit":N}`. Omit `limit` for unlimited.

Seeded in migrations (`00001`–`00007`). Active plan: `default` (`pro_monthly` deactivated).

Full matrix + enforcement: [docs/billing-features.md](../../docs/billing-features.md).

### Nordly desktop (Settings → Features)

| Key | Type | default plan |
|-----|------|--------------|
| cloud_sync_enabled | bool | true |
| cloud_sync_devices | gauge | unlimited |
| published_notes_active | gauge | unlimited |
| publish_password | bool | true |

Notes are unlimited (`cloud_notes_count` gauge in DB, not enforced).

### Internal

| Key | Type | default plan | Consumer |
|-----|------|--------------|----------|
| code_runs_per_day | counter/day | unlimited | sandbox |
| live_rooms_per_month | counter/month | unlimited | (reserved) |
| live_rooms_concurrent | gauge | unlimited | (reserved) |

## API

| RPC | HTTP | Auth |
|-----|------|------|
| GetMe | `GET /v1/billing/me` | JWT |
| GetEntitlements, CheckEntitlement, CheckAndConsumeUsage, ReleaseUsage | gRPC | `x-internal-token` |
| Grant/Revoke subscription | admin HTTP | `x-internal-token` |
| Tribute webhook | `POST /v1/billing/webhooks/tribute` | `trbt-signature` HMAC-SHA256 hex only |

Consumers: **identity** (cloud sync), **notes** (publish), **sandbox** (code runs). **Nordly desktop** reads `GET /v1/billing/me` for Settings → Features.

## Invariants

- `resolvePlan` always returns active `default` plan (subscriptions do not change entitlements)
- Atomic consume (`INSERT … ON CONFLICT … WHERE used+amount<=limit`)
- Webhook + subscription changes in one tx; duplicate webhooks idempotent
- `ReleaseUsage` idempotent via `usage_release_dedup`

## Caches

Plans snapshot in RAM at startup. Optional Redis entitlements cache (`ENTITLEMENTS_CACHE_TTL`, 60s).

## Ports

HTTP `8085` | gRPC `9095` | PG `5438` / `nordly_billing`

## Commands

```bash
cd services/billing
make start | gen-proto | lint | test | build
```

Production requires `INTERNAL_API_TOKEN`, `TRIBUTE_WEBHOOK_SECRET`.

## Metrics

`GET /metrics` — HTTP instrumentation + plans/entitlements cache (`billing_plans_*`, `billing_entitlements_*` in `internal/billing/cache/`) + product counters (`billing_usage_consume_total`, `billing_subscriptions_total`, `billing_webhook_events_total` in `internal/billing/product/metrics.go`).
